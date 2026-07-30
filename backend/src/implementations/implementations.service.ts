import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ProjectRepo,
  ProjectRepoDocument,
} from './schemas/project-repo.schema';
import {
  ImplementationRun,
  ImplementationRunDocument,
  RunStatus,
  TERMINAL_STATUSES,
} from './schemas/implementation-run.schema';
import { GithubService, RepoTarget } from './github.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { ExportService } from '../export/export.service';
import { SaveRepoDto } from './dto/save-repo.dto';
import { TriggerRunDto } from './dto/trigger-run.dto';
import { RunCallbackDto } from './dto/run-callback.dto';
import { Project } from '../projects/schemas/project.schema';
import { Ticket } from '../tickets/schemas/ticket.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

/** `client_payload` travels inside a GitHub API request; keep the prompt sane. */
const MAX_PROMPT_CHARS = 40_000;
/** A run that never reports back is failed rather than left spinning forever. */
const RUN_TIMEOUT_MINUTES = 60;

export interface PublicRepo {
  project: string;
  owner: string;
  repo: string;
  baseBranch: string;
  eventType: string;
  instructions: string;
  autoMerge: boolean;
  isActive: boolean;
  hasToken: boolean;
  lastDispatchAt: Date | null;
  lastError?: string;
}

@Injectable()
export class ImplementationsService {
  private readonly logger = new Logger(ImplementationsService.name);

  constructor(
    @InjectModel(ProjectRepo.name)
    private readonly repoModel: Model<ProjectRepoDocument>,
    @InjectModel(ImplementationRun.name)
    private readonly runModel: Model<ImplementationRunDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<Project>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<Ticket>,
    private readonly github: GithubService,
    private readonly encryption: EncryptionService,
    private readonly exportService: ExportService,
    private readonly configService: ConfigService,
  ) {}

  // --- repositorio del proyecto ---------------------------------------------

  async getRepo(projectId: string): Promise<PublicRepo | null> {
    const repo = await this.repoModel
      .findOne({ project: new Types.ObjectId(projectId) })
      .select('+secretToken')
      .exec();
    return repo ? this.toPublicRepo(repo) : null;
  }

  async saveRepo(projectId: string, dto: SaveRepoDto): Promise<PublicRepo> {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const existing = await this.repoModel
      .findOne({ project: new Types.ObjectId(projectId) })
      .select('+secretToken +secretCallback')
      .exec();

    const token = dto.token?.trim() || this.decryptToken(existing);
    if (!token) {
      throw new BadRequestException(
        'Hace falta un token de GitHub para conectar el repositorio',
      );
    }

    // Fail here, with a clear message, instead of at dispatch time.
    const access = await this.github.checkAccess({
      owner: dto.owner,
      repo: dto.repo,
      token,
    });

    const update: Partial<ProjectRepo> = {
      project: new Types.ObjectId(projectId),
      owner: dto.owner.trim(),
      repo: dto.repo.trim(),
      baseBranch: dto.baseBranch?.trim() || access.defaultBranch,
      eventType: dto.eventType?.trim() || 'mayahelp-implement',
      instructions: dto.instructions?.trim() ?? existing?.instructions ?? '',
      autoMerge: dto.autoMerge ?? existing?.autoMerge ?? false,
      isActive: dto.isActive ?? existing?.isActive ?? true,
      lastError: undefined,
    };
    if (dto.token?.trim()) {
      update.secretToken = this.encryption.encrypt(dto.token.trim());
    }
    if (!existing?.secretCallback) {
      update.secretCallback = this.encryption.encrypt(
        randomBytes(32).toString('base64url'),
      );
    }

    const saved = await this.repoModel
      .findOneAndUpdate({ project: new Types.ObjectId(projectId) }, update, {
        new: true,
        upsert: true,
      })
      .select('+secretToken')
      .exec();
    return this.toPublicRepo(saved);
  }

  async removeRepo(projectId: string): Promise<void> {
    await this.repoModel
      .deleteOne({ project: new Types.ObjectId(projectId) })
      .exec();
  }

  // --- disparar una implementación ------------------------------------------

  async trigger(
    dto: TriggerRunDto,
    user: AuthenticatedUser,
    userName?: string,
  ): Promise<ImplementationRunDocument> {
    const repo = await this.repoModel
      .findOne({ project: new Types.ObjectId(dto.project) })
      .select('+secretToken +secretCallback')
      .exec();
    if (!repo) {
      throw new BadRequestException(
        'El proyecto todavía no tiene un repositorio conectado',
      );
    }
    if (!repo.isActive) {
      throw new BadRequestException(
        'Las implementaciones automáticas están desactivadas para este proyecto',
      );
    }
    const token = this.decryptToken(repo);
    if (!token) {
      throw new BadRequestException(
        'No se pudo leer el token de GitHub; volvé a cargarlo',
      );
    }

    const tickets = await this.ticketModel
      .find({ _id: { $in: dto.tickets.map((id) => new Types.ObjectId(id)) } })
      .select('code subject project')
      .lean()
      .exec();
    if (tickets.length === 0) {
      throw new BadRequestException('No se encontraron los tickets indicados');
    }

    const markdown = await this.exportService.exportCombined(
      { ids: dto.tickets },
      user,
    );
    const runKey = randomBytes(6).toString('hex');
    const autoMerge = dto.autoMerge ?? repo.autoMerge;
    const title = buildTitle(tickets);
    const prompt = this.buildPrompt({
      markdown,
      instructions: repo.instructions,
      notes: dto.notes,
      baseBranch: repo.baseBranch,
      title,
    });

    const run = await this.runModel.create({
      project: repo.project,
      tickets: tickets.map((ticket) => ticket._id),
      ticketCodes: (tickets as TicketSummary[]).map((ticket) => ticket.code),
      requestedBy: new Types.ObjectId(user.userId),
      requestedByName: userName,
      title,
      runKey,
      status: RunStatus.QUEUED,
      autoMerge,
      prompt,
      dispatchedAt: new Date(),
    });

    try {
      await this.github.dispatch(
        { owner: repo.owner, repo: repo.repo, token },
        repo.eventType,
        {
          run_key: runKey,
          title,
          prompt,
          base_branch: repo.baseBranch,
          branch_prefix: this.branchPrefix(runKey),
          callback_url: this.callbackUrl(runKey),
          callback_token: this.callbackToken(repo, runKey),
        },
      );
      repo.lastDispatchAt = new Date();
      repo.lastError = undefined;
      await repo.save();
    } catch (error) {
      const message = (error as Error).message;
      run.status = RunStatus.FAILED;
      run.lastError = message;
      run.finishedAt = new Date();
      await run.save();
      repo.lastError = message;
      await repo.save();
      throw new BadRequestException(
        `No se pudo disparar el workflow en GitHub: ${message}`,
      );
    }

    return run;
  }

  // --- callback del workflow -------------------------------------------------

  /**
   * Called by the GitHub workflow, not by a logged-in user: the only credential is
   * the per-run token, compared in constant time.
   */
  async handleCallback(
    runKey: string,
    token: string,
    dto: RunCallbackDto,
  ): Promise<void> {
    const run = await this.runModel.findOne({ runKey }).exec();
    if (!run) throw new NotFoundException('Corrida no encontrada');

    const repo = await this.repoModel
      .findOne({ project: run.project })
      .select('+secretCallback')
      .exec();
    if (!repo || !this.isValidCallbackToken(repo, runKey, token)) {
      throw new UnauthorizedException('Firma de callback inválida');
    }
    if (TERMINAL_STATUSES.includes(run.status)) return;

    if (dto.branch) run.branch = dto.branch;
    if (dto.prNumber) run.prNumber = dto.prNumber;
    if (dto.prUrl) run.prUrl = dto.prUrl;
    if (dto.workflowUrl) run.workflowUrl = dto.workflowUrl;
    if (dto.summary) run.summary = dto.summary;

    if (dto.status === 'failed') {
      run.status = RunStatus.FAILED;
      run.lastError = dto.error ?? 'El workflow terminó con error';
      run.finishedAt = new Date();
    } else if (dto.status === 'pr_open') {
      run.status = RunStatus.PR_OPEN;
    } else {
      run.status = RunStatus.RUNNING;
    }
    await run.save();
  }

  // --- sincronización --------------------------------------------------------

  findOpenRuns(): Promise<ImplementationRunDocument[]> {
    return this.runModel
      .find({ status: { $nin: TERMINAL_STATUSES } })
      .sort({ createdAt: 1 })
      .exec();
  }

  async syncById(id: string): Promise<ImplementationRunDocument> {
    const run = await this.runModel.findById(id).exec();
    if (!run) throw new NotFoundException('Corrida no encontrada');
    await this.sync(run);
    return run;
  }

  /**
   * Brings a run up to date with GitHub: finds the pull request Claude opened, counts
   * its checks and — when the run asked for it — merges as soon as they are all green.
   */
  async sync(run: ImplementationRunDocument): Promise<void> {
    if (TERMINAL_STATUSES.includes(run.status)) return;

    const repo = await this.repoModel
      .findOne({ project: run.project })
      .select('+secretToken')
      .exec();
    const token = this.decryptToken(repo);
    if (!repo || !token) return;
    const target: RepoTarget = {
      owner: repo.owner,
      repo: repo.repo,
      token,
    };

    try {
      const pull = run.prNumber
        ? await this.github.getPullRequest(target, run.prNumber)
        : await this.github.findPullRequestByBranchPrefix(
            target,
            this.branchPrefix(run.runKey),
          );

      if (!pull) {
        this.expireIfStale(run);
        await run.save();
        return;
      }

      run.prNumber = pull.number;
      run.prUrl = pull.url;
      run.branch = pull.branch;

      if (pull.merged) {
        run.status = RunStatus.MERGED;
        run.mergedAt = new Date();
        run.finishedAt = new Date();
        await run.save();
        return;
      }
      if (pull.state === 'closed') {
        run.status = RunStatus.CANCELLED;
        run.finishedAt = new Date();
        await run.save();
        return;
      }

      run.status = RunStatus.PR_OPEN;
      const checks = await this.github.getChecks(target, pull.headSha);
      run.checksTotal = checks.total;
      run.checksPassed = checks.passed;

      const green =
        checks.total > 0 && checks.failed === 0 && checks.pending === 0;
      if (checks.failed > 0) {
        run.lastError = `${checks.failed} chequeo(s) de CI fallaron`;
      } else if (green) {
        run.lastError = undefined;
      }

      if (run.autoMerge && green && !pull.draft) {
        await this.github.mergePullRequest(
          target,
          pull.number,
          `${run.title} (MayaHelp ${run.ticketCodes.join(', ')})`,
        );
        run.status = RunStatus.MERGED;
        run.mergedAt = new Date();
        run.finishedAt = new Date();
      }
      await run.save();
    } catch (error) {
      run.lastError = (error as Error).message;
      this.expireIfStale(run);
      await run.save();
    }
  }

  /** A queued run with no pull request after an hour is not coming back. */
  private expireIfStale(run: ImplementationRunDocument): void {
    const startedAt = run.dispatchedAt ?? new Date();
    const minutes = (Date.now() - startedAt.getTime()) / 60_000;
    if (minutes > RUN_TIMEOUT_MINUTES) {
      run.status = RunStatus.FAILED;
      run.finishedAt = new Date();
      run.lastError =
        run.lastError ??
        `El workflow no abrió un pull request en ${RUN_TIMEOUT_MINUTES} minutos`;
    }
  }

  // --- consulta y cancelación ------------------------------------------------

  list(projectId?: string, limit = 50): Promise<ImplementationRunDocument[]> {
    const filter = projectId ? { project: new Types.ObjectId(projectId) } : {};
    return this.runModel
      .find(filter)
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .exec();
  }

  async findById(id: string): Promise<ImplementationRunDocument> {
    const run = await this.runModel
      .findById(id)
      .populate('project', 'name')
      .exec();
    if (!run) throw new NotFoundException('Corrida no encontrada');
    return run;
  }

  async cancel(id: string): Promise<ImplementationRunDocument> {
    const run = await this.runModel.findById(id).exec();
    if (!run) throw new NotFoundException('Corrida no encontrada');
    if (TERMINAL_STATUSES.includes(run.status)) return run;

    if (run.prNumber) {
      const repo = await this.repoModel
        .findOne({ project: run.project })
        .select('+secretToken')
        .exec();
      const token = this.decryptToken(repo);
      if (repo && token) {
        // Best effort: the run is cancelled locally even if GitHub says no.
        await this.github
          .closePullRequest(
            { owner: repo.owner, repo: repo.repo, token },
            run.prNumber,
          )
          .catch((error: Error) => this.logger.warn(error.message));
      }
    }
    run.status = RunStatus.CANCELLED;
    run.finishedAt = new Date();
    await run.save();
    return run;
  }

  // --- helpers ---------------------------------------------------------------

  /** Unique per run so the poller can recognise the branch Claude Code created. */
  branchPrefix(runKey: string): string {
    return `mayahelp/${runKey}-`;
  }

  private callbackUrl(runKey: string): string {
    const base = this.configService.get<string>('publicApiUrl');
    return base
      ? `${base.replace(/\/$/, '')}/implementations/hooks/${runKey}`
      : '';
  }

  /** Derived per run, so leaking one run's token does not expose the others. */
  private callbackToken(repo: ProjectRepoDocument, runKey: string): string {
    const secret = repo.secretCallback
      ? (this.encryption.decrypt(repo.secretCallback) ?? '')
      : '';
    return createHmac('sha256', secret).update(runKey).digest('base64url');
  }

  private isValidCallbackToken(
    repo: ProjectRepoDocument,
    runKey: string,
    received: string,
  ): boolean {
    const expected = Buffer.from(this.callbackToken(repo, runKey));
    const actual = Buffer.from(received ?? '');
    return (
      expected.length > 0 &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  }

  private decryptToken(
    repo: ProjectRepoDocument | null | undefined,
  ): string | null {
    return repo?.secretToken ? this.encryption.decrypt(repo.secretToken) : null;
  }

  private buildPrompt(params: {
    markdown: string;
    instructions: string;
    notes?: string;
    baseBranch: string;
    title: string;
  }): string {
    const tickets = params.markdown.slice(0, MAX_PROMPT_CHARS);
    const truncated = params.markdown.length > MAX_PROMPT_CHARS;

    return [
      'Sos un desarrollador trabajando en este repositorio. Implementá lo que piden los tickets de soporte que van más abajo.',
      '',
      'Cómo trabajar:',
      `- Partí de la rama \`${params.baseBranch}\`.`,
      '- Leé el código existente antes de tocarlo y seguí sus convenciones (nombres, estilo, densidad de comentarios).',
      '- Hacé el cambio completo: si algo del pedido no se puede resolver, implementá todo lo demás y explicá en la descripción del pull request qué quedó afuera y por qué.',
      '- Corré los tests y el linter del proyecto antes de commitear. Si hay tests, agregá los que cubran el cambio.',
      '- No toques credenciales, variables de entorno ni archivos de despliegue salvo que el ticket lo pida.',
      '- Commiteá y abrí un pull request con un resumen de qué cambiaste y cómo verificarlo.',
      `- Titulá el pull request: "${params.title}".`,
      params.instructions
        ? `\nContexto del proyecto:\n${params.instructions}`
        : '',
      params.notes ? `\nIndicaciones para esta corrida:\n${params.notes}` : '',
      '',
      '---',
      '',
      tickets,
      truncated
        ? '\n\n(Los tickets se truncaron por tamaño: si falta contexto, decilo en el pull request en vez de adivinar.)'
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private toPublicRepo(repo: ProjectRepoDocument): PublicRepo {
    return {
      project: repo.project.toString(),
      owner: repo.owner,
      repo: repo.repo,
      baseBranch: repo.baseBranch,
      eventType: repo.eventType,
      instructions: repo.instructions,
      autoMerge: repo.autoMerge,
      isActive: repo.isActive,
      hasToken: !!repo.secretToken,
      lastDispatchAt: repo.lastDispatchAt ?? null,
      lastError: repo.lastError,
    };
  }
}

interface TicketSummary {
  _id: Types.ObjectId;
  code: string;
  subject: string;
}

/** The pull request title: one ticket keeps its subject, many get a count. */
function buildTitle(tickets: TicketSummary[]): string {
  if (tickets.length === 1) {
    return `${tickets[0].code}: ${tickets[0].subject}`.slice(0, 120);
  }
  return `${tickets.length} tickets: ${tickets.map((t) => t.code).join(', ')}`.slice(
    0,
    120,
  );
}

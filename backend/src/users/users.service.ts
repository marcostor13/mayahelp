import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { User, UserDocument } from './schemas/user.schema';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import {
  ProjectShareLink,
  ProjectShareLinkDocument,
} from '../projects/schemas/project-share-link.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectAccessService } from '../common/project-access/project-access.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

export interface PendingReporter {
  name: string;
  email: string;
  projects: string[];
}

export interface ResetPasswordResult {
  user: UserDocument;
  /** Shown once to the admin, as a fallback for when the email does not go out. */
  temporaryPassword: string;
  emailSent: boolean;
}

export interface CreatedAccount {
  id: string;
  name: string;
  email: string;
  /** Shown once so the admin can hand it over; it is never stored in clear text. */
  temporaryPassword?: string;
}

function generatePassword(): string {
  return randomBytes(9).toString('base64url');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    // Registered here (instead of importing ProjectsModule) to keep the module graph acyclic.
    @InjectModel(ProjectShareLink.name)
    private shareLinkModel: Model<ProjectShareLinkDocument>,
    @InjectModel(Project.name)
    private projectModel: Model<ProjectDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly access: ProjectAccessService,
  ) {}

  /** Correo de la cuenta dueña de la plataforma (`SUPER_ADMIN_EMAIL`). */
  private get superAdminEmail(): string {
    return (
      this.configService.get<string>('superAdminEmail') ?? ''
    ).toLowerCase();
  }

  private isSuperAdminEmail(email: string): boolean {
    const configured = this.superAdminEmail;
    return configured !== '' && email.toLowerCase().trim() === configured;
  }

  async create(dto: CreateUserDto): Promise<UserDocument> {
    const { user } = await this.createWithPassword(dto);
    return user;
  }

  /**
   * Creates the account and reports the generated password when the caller did not
   * provide one (admin flow), so it can be shared with the person exactly once.
   */
  async createWithPassword(
    dto: CreateUserDto,
  ): Promise<{ user: UserDocument; temporaryPassword?: string }> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    const temporaryPassword = dto.password ? undefined : generatePassword();
    const passwordHash = await bcrypt.hash(
      dto.password ?? temporaryPassword!,
      10,
    );
    // La cuenta dueña nace admin y con acceso a todo, se cree por donde se cree.
    const isSuperAdmin = this.isSuperAdminEmail(email);
    const user = await this.userModel.create({
      name: dto.name,
      email,
      passwordHash,
      role: isSuperAdmin ? Role.ADMIN : (dto.role ?? Role.CLIENT),
      isSuperAdmin,
      projects: await this.resolveProjectIds(dto.projects ?? []),
      company: dto.company,
      phone: dto.phone,
      notifications: {
        email: dto.notifyByEmail ?? true,
        whatsapp: dto.notifyByWhatsApp ?? true,
      },
    });
    return { user, temporaryPassword };
  }

  /**
   * Lista de usuarios para la pantalla de admin, con cuántos tickets abrió cada uno.
   *
   * El conteo va con el mismo recorte que la lista de tickets: si contara todos, la
   * pantalla prometería "5 tickets" y al entrar aparecerían cero, porque esos cinco
   * son de un proyecto que quien mira no tiene asignado. Un número que no se puede
   * abrir es peor que no mostrar número.
   */
  async findAllWithTicketCounts(
    params: { role?: Role; search?: string },
    requester: AuthenticatedUser,
  ) {
    const query: QueryFilter<UserDocument> = {};
    if (params.role) query.role = params.role;
    if (params.search) {
      const term = escapeRegex(params.search);
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { company: { $regex: term, $options: 'i' } },
      ];
    }

    const users = await this.userModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const ids = users.map((user) => user._id);
    const scope = await this.access.ticketScopeFilter(requester);

    const visible = await this.countTicketsByClient({
      ...scope,
      client: { $in: ids },
    });
    // Segunda vuelta sin recorte, solo para poder decir "hay 5 más que no ves".
    // El súper usuario ve todo, así que ahí el recorte no esconde nada.
    const total =
      Object.keys(scope).length === 0
        ? visible
        : await this.countTicketsByClient({ client: { $in: ids } });

    return users.map((user) => {
      const key = user._id.toString();
      const count = visible.get(key) ?? 0;
      return {
        ...user,
        ticketsCount: count,
        /**
         * Cuántos tickets tiene que quien mira no puede abrir, por ser de proyectos
         * que no tiene asignados. Sin este número, la pantalla mostraría un 0 sin
         * explicación justo cuando la persona sí tiene tickets.
         */
        ticketsOutOfScope: (total.get(key) ?? 0) - count,
      };
    });
  }

  private async countTicketsByClient(
    match: Record<string, unknown>,
  ): Promise<Map<string, number>> {
    const rows = await this.ticketModel
      .aggregate<{ _id: Types.ObjectId; total: number }>([
        { $match: match },
        { $group: { _id: '$client', total: { $sum: 1 } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), row.total]));
  }

  findAll(role?: Role) {
    const filter = role ? { role } : {};
    return this.userModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findOrCreateClient(
    email: string,
    name: string,
    company?: string,
  ): Promise<UserDocument> {
    const existing = await this.findByEmail(email);
    if (existing) {
      return existing;
    }
    const { user } = await this.createWithPassword({
      name,
      email,
      company,
      role: Role.CLIENT,
    });
    return user;
  }

  async findOrCreateAiAgent(): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ isAiAgent: true }).exec();
    if (existing) {
      return existing;
    }
    const randomPassword = generatePassword();
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const user = new this.userModel({
      name: 'Agente IA',
      email: 'ai-agent@mayahelp.internal',
      passwordHash,
      role: Role.AGENT,
      isAiAgent: true,
    });
    return user.save();
  }

  /**
   * People pre-authorized on the public links that do not have an account yet, so the
   * admin can turn them into clients without retyping their data.
   */
  async findPendingReporters(
    requester: AuthenticatedUser,
  ): Promise<PendingReporter[]> {
    const links = await this.shareLinkModel
      .find(
        await this.access.referenceFilter(requester, 'project'),
        'reporters project',
      )
      .populate<{ project?: { name?: string } }>('project', 'name')
      .lean()
      .exec();

    const byEmail = new Map<string, PendingReporter>();
    for (const link of links) {
      for (const reporter of link.reporters ?? []) {
        const email = reporter.email?.toLowerCase().trim();
        if (!email) continue;
        const entry = byEmail.get(email) ?? {
          name: reporter.name,
          email,
          projects: [],
        };
        const projectName = link.project?.name;
        if (projectName && !entry.projects.includes(projectName)) {
          entry.projects.push(projectName);
        }
        byEmail.set(email, entry);
      }
    }
    if (byEmail.size === 0) return [];

    const existing = await this.userModel
      .find({ email: { $in: [...byEmail.keys()] } }, 'email')
      .lean()
      .exec();
    for (const user of existing) {
      byEmail.delete(user.email);
    }
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Creates client accounts for the given reporter emails, skipping the ones already taken. */
  async createFromReporters(
    emails: string[],
    requester: AuthenticatedUser,
  ): Promise<CreatedAccount[]> {
    const pending = await this.findPendingReporters(requester);
    const wanted = new Set(emails.map((email) => email.toLowerCase().trim()));
    const created: CreatedAccount[] = [];

    for (const reporter of pending) {
      if (!wanted.has(reporter.email)) continue;
      const { user, temporaryPassword } = await this.createWithPassword({
        name: reporter.name,
        email: reporter.email,
        role: Role.CLIENT,
        company: reporter.projects[0],
      });
      created.push({
        id: user.id,
        name: user.name,
        email: user.email,
        temporaryPassword,
      });
    }
    return created;
  }

  /**
   * Genera una contraseña temporal, cierra las sesiones abiertas de esa persona y
   * se la manda por correo. La devuelve además al admin porque el envío es
   * best-effort (si Resend falla, el correo se pierde y hay que dictarla a mano).
   */
  async resetPassword(id: string): Promise<ResetPasswordResult> {
    const target = await this.findById(id);
    if (target.isAiAgent) {
      throw new BadRequestException(
        'La cuenta del agente IA no tiene acceso por contraseña',
      );
    }

    const temporaryPassword = generatePassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    // $unset del refresh token: las sesiones abiertas no se pueden renovar.
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: { passwordHash, mustChangePassword: true },
          $unset: { refreshTokenHash: 1 },
        },
        { new: true },
      )
      .exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const emailSent = await this.notificationsService.notifyPasswordReset(
      { name: user.name, email: user.email },
      temporaryPassword,
    );
    if (!emailSent) {
      this.logger.warn(
        `No se pudo enviar la contraseña temporal a ${user.email}; el admin la ve en pantalla.`,
      );
    }

    return { user, temporaryPassword, emailSent };
  }

  /** Cambio de contraseña por la propia persona; limpia el flag del reseteo. */
  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select('+passwordHash')
      .exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'La contraseña nueva tiene que ser distinta de la actual',
      );
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    return user.save();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.findById(id);
    const { notifyByEmail, notifyByWhatsApp, email, projects, ...rest } = dto;

    // El dueño de la plataforma no se puede bajar de rol ni dar de baja desde acá.
    if (user.isSuperAdmin) {
      if (rest.role && rest.role !== Role.ADMIN) {
        throw new BadRequestException(
          'El súper usuario no puede dejar de ser administrador',
        );
      }
      if (dto.isActive === false) {
        throw new BadRequestException(
          'La cuenta del súper usuario no se puede desactivar',
        );
      }
    }

    if (projects) {
      user.projects = await this.resolveProjectIds(projects);
    }

    if (email && email.toLowerCase() !== user.email) {
      const taken = await this.userModel.findOne({
        email: email.toLowerCase(),
        _id: { $ne: user._id },
      });
      if (taken) {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      user.email = email.toLowerCase();
      // El flag sigue al correo configurado, no al documento: si le cambian el correo
      // al dueño deja de serlo, y el arranque promueve a quien tenga el correo bueno.
      user.isSuperAdmin = this.isSuperAdminEmail(user.email);
    }
    Object.assign(user, rest);

    if (notifyByEmail !== undefined) user.notifications.email = notifyByEmail;
    if (notifyByWhatsApp !== undefined) {
      user.notifications.whatsapp = notifyByWhatsApp;
    }
    if (notifyByEmail !== undefined || notifyByWhatsApp !== undefined) {
      user.markModified('notifications');
    }
    const saved = await user.save();

    // Desactivar tiene que cortar lo que ya está abierto, no solo los logins nuevos.
    if (dto.isActive === false) {
      await this.setRefreshTokenHash(saved.id, null);
    }
    return saved;
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return user.save();
  }

  async remove(id: string): Promise<void> {
    const target = await this.findById(id);
    if (target.isSuperAdmin) {
      throw new BadRequestException(
        'La cuenta del súper usuario no se puede eliminar',
      );
    }
    await this.userModel.findByIdAndDelete(id).exec();
  }

  /**
   * Reemplaza los proyectos visibles de una cuenta. Al súper usuario no le hace falta
   * (ve todos), pero se guarda igual para no perder la selección si algún día deja de serlo.
   */
  async setProjects(id: string, projectIds: string[]): Promise<UserDocument> {
    const user = await this.findById(id);
    user.projects = await this.resolveProjectIds(projectIds);
    return user.save();
  }

  /** Valida que los ids existan: una asignación a un proyecto borrado sería invisible. */
  private async resolveProjectIds(ids: string[]): Promise<Types.ObjectId[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.projectModel
      .find({ _id: { $in: unique } }, '_id')
      .lean()
      .exec();
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Alguno de los proyectos seleccionados ya no existe',
      );
    }
    return found.map((project) => project._id);
  }

  async setRefreshTokenHash(id: string, refreshTokenHash: string | null) {
    await this.userModel.findByIdAndUpdate(id, { refreshTokenHash }).exec();
  }

  async findByIdWithRefreshToken(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }
}

import { Injectable } from '@nestjs/common';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { TicketsService } from '../tickets/tickets.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { RelevanceService } from '../relevance/relevance.service';
import { CreatePublicObservationDto } from './dto/create-public-observation.dto';
import { CheckDuplicateDto } from './dto/check-duplicate.dto';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { CategoryDocument } from '../categories/schemas/category.schema';

const MAX_PUBLIC_FILES = 5;

export interface PublicProjectInfo {
  projectName: string;
  projectDescription?: string;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly ticketsService: TicketsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly relevanceService: RelevanceService,
  ) {}

  async getProjectInfo(token: string): Promise<PublicProjectInfo> {
    const link = await this.projectsService.resolveShareLink(token);
    const project = link.project as unknown as ProjectDocument;
    return {
      projectName: project.name,
      projectDescription: project.description,
    };
  }

  /**
   * Shown before the reporter submits: during a demo the same bug arrives from five
   * different people, and each copy costs an agent a triage pass. Deliberately
   * scoped to unresolved observations of this project, and phrased as a question —
   * the reporter decides, nothing is blocked.
   */
  async findPossibleDuplicates(token: string, dto: CheckDuplicateDto) {
    const link = await this.projectsService.resolveShareLink(token);
    const project = link.project as unknown as ProjectDocument;

    const similar = await this.relevanceService.findSimilarTickets({
      text: `${dto.subject} ${dto.description}`,
      projectId: project.id,
      onlyUnresolved: true,
      limit: 3,
    });

    // Only what an outsider may see: no client, no agent, no comments.
    return similar.map((ticket) => ({
      code: ticket.code,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
    }));
  }

  async submitObservation(
    token: string,
    dto: CreatePublicObservationDto,
    files: Express.Multer.File[],
  ): Promise<{ code: string }> {
    const link = await this.projectsService.resolveShareLink(token);
    const project = link.project as unknown as ProjectDocument;
    const category = project.defaultCategory as unknown as CategoryDocument;

    const client = await this.usersService.findOrCreateClient(
      dto.reporterEmail,
      dto.reporterName,
    );

    const ticket = await this.ticketsService.createFromExternalSource({
      subject: dto.subject,
      description: dto.description,
      category: category.id,
      clientId: client.id,
      projectId: project.id,
      actorName: `${dto.reporterName} (enlace público)`,
    });

    for (const file of files.slice(0, MAX_PUBLIC_FILES)) {
      await this.attachmentsService.upload(ticket.id, file, client.id);
    }

    await this.projectsService.incrementShareLinkUsage(link.id);

    return { code: ticket.code };
  }
}

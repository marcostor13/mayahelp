import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { TicketsService } from '../tickets/tickets.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CategoriesService } from '../categories/categories.service';
import { CreatePublicObservationDto } from './dto/create-public-observation.dto';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { CategoryDocument } from '../categories/schemas/category.schema';

const MAX_PUBLIC_FILES = 5;
const AUTO_SUBJECT_MAX_LENGTH = 80;

export interface PublicProjectInfo {
  projectName: string;
  projectDescription?: string;
  defaultCategoryId?: string;
  categories: { id: string; name: string }[];
  reporters: { id: string; name: string }[];
}

@Injectable()
export class PublicService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly ticketsService: TicketsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async getProjectInfo(token: string): Promise<PublicProjectInfo> {
    const link = await this.projectsService.resolveShareLink(token);
    const project = link.project as unknown as ProjectDocument;
    const defaultCategory =
      project.defaultCategory as unknown as CategoryDocument | null;
    const categories = await this.categoriesService.findAll('ticket');

    return {
      projectName: project.name,
      projectDescription: project.description,
      defaultCategoryId: defaultCategory?.id,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
      reporters: link.reporters.map((reporter) => ({
        id: reporter._id.toString(),
        name: reporter.name,
      })),
    };
  }

  async submitObservation(
    token: string,
    dto: CreatePublicObservationDto,
    files: Express.Multer.File[],
  ): Promise<{ code: string }> {
    const link = await this.projectsService.resolveShareLink(token);
    const project = link.project as unknown as ProjectDocument;

    const reporter = link.reporters.find(
      (candidate) => candidate._id.toString() === dto.reporterId,
    );
    if (!reporter) {
      throw new BadRequestException(
        'La persona seleccionada no está autorizada para este enlace.',
      );
    }

    const category = await this.categoriesService.findById(dto.category);
    if (category.type !== 'ticket') {
      throw new BadRequestException('Categoría inválida.');
    }

    const client = await this.usersService.findOrCreateClient(
      reporter.email,
      reporter.name,
    );

    const ticket = await this.ticketsService.createFromExternalSource({
      subject: this.buildSubject(dto.description),
      description: dto.description,
      category: category.id,
      clientId: client.id,
      projectId: project.id,
    });

    for (const file of files.slice(0, MAX_PUBLIC_FILES)) {
      await this.attachmentsService.upload(ticket.id, file, client.id);
    }

    await this.projectsService.incrementShareLinkUsage(link.id);

    return { code: ticket.code };
  }

  private buildSubject(description: string): string {
    const firstLine = description.split('\n')[0].trim();
    if (!firstLine) return 'Observación';
    return firstLine.length > AUTO_SUBJECT_MAX_LENGTH
      ? `${firstLine.slice(0, AUTO_SUBJECT_MAX_LENGTH - 1)}…`
      : firstLine;
  }
}

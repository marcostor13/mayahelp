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

export interface PublicProjectInfo {
  projectName: string;
  projectDescription?: string;
  defaultCategoryId?: string;
  categories: { id: string; name: string }[];
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
    };
  }

  async submitObservation(
    token: string,
    dto: CreatePublicObservationDto,
    files: Express.Multer.File[],
  ): Promise<{ code: string }> {
    const link = await this.projectsService.resolveShareLink(token);
    const project = link.project as unknown as ProjectDocument;

    const category = await this.categoriesService.findById(dto.category);
    if (category.type !== 'ticket') {
      throw new BadRequestException('Categoría inválida.');
    }

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
    });

    for (const file of files.slice(0, MAX_PUBLIC_FILES)) {
      await this.attachmentsService.upload(ticket.id, file, client.id);
    }

    await this.projectsService.incrementShareLinkUsage(link.id);

    return { code: ticket.code };
  }
}

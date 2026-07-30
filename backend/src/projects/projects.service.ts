import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { Project, ProjectDocument } from './schemas/project.schema';
import {
  ProjectShareLink,
  ProjectShareLinkDocument,
} from './schemas/project-share-link.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { ReporterInputDto } from './dto/reporter-input.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(ProjectShareLink.name)
    private readonly shareLinkModel: Model<ProjectShareLinkDocument>,
  ) {}

  create(dto: CreateProjectDto, createdBy: string) {
    return this.projectModel.create({ ...dto, createdBy });
  }

  findAll() {
    return this.projectModel
      .find()
      .populate('client', 'name email company')
      .populate('defaultCategory', 'name icon')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<ProjectDocument> {
    const project = await this.projectModel
      .findById(id)
      .populate('client', 'name email company')
      .populate('defaultCategory', 'name icon')
      .exec();
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return project;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument> {
    const project = await this.projectModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return project;
  }

  async remove(id: string): Promise<void> {
    const result = await this.projectModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    await this.shareLinkModel.deleteMany({ project: id }).exec();
  }

  async createShareLink(
    projectId: string,
    dto: CreateShareLinkDto,
    createdBy: string,
  ): Promise<ProjectShareLinkDocument> {
    await this.findById(projectId);
    const token = randomBytes(24).toString('base64url');
    return this.shareLinkModel.create({
      project: projectId,
      token,
      label: dto.label,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdBy,
      reporters: dto.reporters ?? [],
    });
  }

  async addReporter(
    linkId: string,
    dto: ReporterInputDto,
  ): Promise<ProjectShareLinkDocument> {
    const link = await this.shareLinkModel
      .findByIdAndUpdate(linkId, { $push: { reporters: dto } }, { new: true })
      .exec();
    if (!link) {
      throw new NotFoundException('Enlace no encontrado');
    }
    return link;
  }

  async removeReporter(
    linkId: string,
    reporterId: string,
  ): Promise<ProjectShareLinkDocument> {
    const link = await this.shareLinkModel
      .findByIdAndUpdate(
        linkId,
        { $pull: { reporters: { _id: reporterId } } },
        { new: true },
      )
      .exec();
    if (!link) {
      throw new NotFoundException('Enlace no encontrado');
    }
    return link;
  }

  findShareLinksForProject(projectId: string) {
    return this.shareLinkModel
      .find({ project: projectId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async setShareLinkActive(
    id: string,
    isActive: boolean,
  ): Promise<ProjectShareLinkDocument> {
    const link = await this.shareLinkModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .exec();
    if (!link) {
      throw new NotFoundException('Enlace no encontrado');
    }
    return link;
  }

  async removeShareLink(id: string): Promise<void> {
    const result = await this.shareLinkModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Enlace no encontrado');
    }
  }

  /** Validates a public token and returns the link with its project populated, or throws. */
  async resolveShareLink(token: string): Promise<ProjectShareLinkDocument> {
    const link = await this.shareLinkModel
      .findOne({ token })
      .populate({ path: 'project', populate: { path: 'defaultCategory' } })
      .exec();
    if (!link) {
      throw new NotFoundException('Enlace no encontrado');
    }
    if (!link.isActive) {
      throw new GoneException('Este enlace fue desactivado.');
    }
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este enlace expiró.');
    }
    return link;
  }

  async incrementShareLinkUsage(id: string): Promise<void> {
    await this.shareLinkModel
      .findByIdAndUpdate(id, { $inc: { usageCount: 1 } })
      .exec();
  }
}

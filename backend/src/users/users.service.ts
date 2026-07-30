import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from '../common/enums/role.enum';

export interface PendingReporter {
  name: string;
  email: string;
  projects: string[];
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
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    // Registered here (instead of importing ProjectsModule) to keep the module graph acyclic.
    @InjectModel(ProjectShareLink.name)
    private shareLinkModel: Model<ProjectShareLinkDocument>,
  ) {}

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
    const user = await this.userModel.create({
      name: dto.name,
      email,
      passwordHash,
      role: dto.role ?? Role.CLIENT,
      company: dto.company,
      phone: dto.phone,
      notifications: {
        email: dto.notifyByEmail ?? true,
        whatsapp: dto.notifyByWhatsApp ?? true,
      },
    });
    return { user, temporaryPassword };
  }

  /** Users list for the admin screen, with how many tickets each person opened. */
  async findAllWithTicketCounts(params: { role?: Role; search?: string }) {
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

    const counts = await this.ticketModel
      .aggregate<{ _id: Types.ObjectId; total: number }>([
        { $match: { client: { $in: users.map((user) => user._id) } } },
        { $group: { _id: '$client', total: { $sum: 1 } } },
      ])
      .exec();
    const byClient = new Map(
      counts.map((row) => [row._id.toString(), row.total]),
    );

    return users.map((user) => ({
      ...user,
      ticketsCount: byClient.get(user._id.toString()) ?? 0,
    }));
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
  async findPendingReporters(): Promise<PendingReporter[]> {
    const links = await this.shareLinkModel
      .find({}, 'reporters project')
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
  async createFromReporters(emails: string[]): Promise<CreatedAccount[]> {
    const pending = await this.findPendingReporters();
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

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.findById(id);
    const { notifyByEmail, notifyByWhatsApp, email, ...rest } = dto;

    if (email && email.toLowerCase() !== user.email) {
      const taken = await this.userModel.findOne({
        email: email.toLowerCase(),
        _id: { $ne: user._id },
      });
      if (taken) {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      user.email = email.toLowerCase();
    }
    Object.assign(user, rest);

    if (notifyByEmail !== undefined) user.notifications.email = notifyByEmail;
    if (notifyByWhatsApp !== undefined) {
      user.notifications.whatsapp = notifyByWhatsApp;
    }
    if (notifyByEmail !== undefined || notifyByWhatsApp !== undefined) {
      user.markModified('notifications');
    }
    return user.save();
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
    const result = await this.userModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  async setRefreshTokenHash(id: string, refreshTokenHash: string | null) {
    await this.userModel.findByIdAndUpdate(id, { refreshTokenHash }).exec();
  }

  async findByIdWithRefreshToken(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }
}

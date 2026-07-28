import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(dto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = new this.userModel({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role ?? Role.CLIENT,
      company: dto.company,
    });
    return user.save();
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

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
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

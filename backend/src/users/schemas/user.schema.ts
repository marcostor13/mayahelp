import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type UserDocument = HydratedDocument<User>;

/** Per-user opt-out. An admin can silence a channel for one person from the users screen. */
@Schema({ _id: false })
export class UserNotificationPreferences {
  @Prop({ default: true })
  email: boolean;

  @Prop({ default: true })
  whatsapp: boolean;
}

export const UserNotificationPreferencesSchema = SchemaFactory.createForClass(
  UserNotificationPreferences,
);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: Role, default: Role.CLIENT })
  role: Role;

  @Prop({ trim: true })
  company?: string;

  /** E.164 format (e.g. +5491122334455), used for WhatsApp Cloud API notifications. */
  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: UserNotificationPreferencesSchema, default: () => ({}) })
  notifications: UserNotificationPreferences;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isAiAgent: boolean;

  @Prop({ select: false })
  refreshTokenHash?: string;

  declare createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

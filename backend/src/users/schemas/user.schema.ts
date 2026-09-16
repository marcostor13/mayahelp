import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
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

  /**
   * Proyectos que esta persona puede ver. Fuera del súper usuario, todo lo que es
   * por proyecto (la lista, el monitoreo y las implementaciones) se filtra por acá:
   * una cuenta sin asignaciones no ve ningún proyecto.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Project' }], default: [] })
  projects: Types.ObjectId[];

  /**
   * Dueño de la plataforma: ve todos los proyectos sin asignación y no se puede
   * desactivar, bajar de rol ni borrar. Lo fija `SUPER_ADMIN_EMAIL` al arrancar.
   */
  @Prop({ default: false })
  isSuperAdmin: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isAiAgent: boolean;

  /**
   * Lo marca el reseteo de cuenta: la persona entra con la contraseña temporal
   * y no puede usar el resto de la API hasta elegir una propia.
   */
  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ select: false })
  refreshTokenHash?: string;

  declare createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

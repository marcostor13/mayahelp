import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryType = 'ticket' | 'article';
export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['ticket', 'article'] })
  type: CategoryType;

  @Prop({ default: 'label' })
  icon: string;

  @Prop({ trim: true })
  description?: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

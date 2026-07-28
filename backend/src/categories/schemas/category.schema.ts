import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryType = 'ticket' | 'article';
export type AutoReplyMode = 'off' | 'draft' | 'auto';
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

  /** Only meaningful for type "ticket": whether AI drafts/sends replies for tickets in this category. */
  @Prop({ type: String, enum: ['off', 'draft', 'auto'], default: 'draft' })
  autoReplyMode: AutoReplyMode;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

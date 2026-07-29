import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleDocument = HydratedDocument<Article>;

@Schema({ timestamps: true })
export class Article {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  category: Types.ObjectId;

  @Prop({ default: 'article' })
  icon: string;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: false })
  popular: boolean;
}

export const ArticleSchema = SchemaFactory.createForClass(Article);

ArticleSchema.index({ category: 1, createdAt: -1 });
ArticleSchema.index({ popular: 1, createdAt: -1 });
ArticleSchema.index(
  { title: 'text', content: 'text' },
  {
    name: 'article_text_search',
    default_language: 'spanish',
    weights: { title: 10, content: 1 },
  },
);

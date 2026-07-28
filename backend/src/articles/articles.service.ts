import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { Article, ArticleDocument } from './schemas/article.schema';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectModel(Article.name) private articleModel: Model<ArticleDocument>,
  ) {}

  create(dto: CreateArticleDto) {
    return this.articleModel.create(dto);
  }

  findAll(params: { category?: string; search?: string; popular?: boolean }) {
    const query: QueryFilter<ArticleDocument> = {};
    if (params.category) query.category = params.category;
    if (params.popular) query.popular = true;
    if (params.search) {
      query.$or = [
        { title: { $regex: params.search, $options: 'i' } },
        { content: { $regex: params.search, $options: 'i' } },
      ];
    }
    return this.articleModel
      .find(query)
      .populate('category', 'name icon')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string) {
    const article = await this.articleModel
      .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
      .populate('category', 'name icon')
      .exec();
    if (!article) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return article;
  }

  async update(id: string, dto: UpdateArticleDto) {
    const article = await this.articleModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!article) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return article;
  }

  async remove(id: string) {
    const result = await this.articleModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Artículo no encontrado');
    }
  }
}

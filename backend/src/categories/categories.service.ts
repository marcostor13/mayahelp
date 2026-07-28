import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Category,
  CategoryDocument,
  CategoryType,
} from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  create(dto: CreateCategoryDto) {
    return this.categoryModel.create(dto);
  }

  findAll(type?: CategoryType) {
    const filter = type ? { type } : {};
    return this.categoryModel.find(filter).sort({ name: 1 }).exec();
  }

  async findById(id: string) {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  async remove(id: string) {
    const result = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Categoría no encontrada');
    }
  }
}

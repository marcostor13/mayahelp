import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Public } from '../common/decorators/public.decorator';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Public()
  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('popular') popular?: string,
  ) {
    return this.articlesService.findAll({
      category,
      search,
      popular: popular === 'true',
    });
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articlesService.findById(id);
  }

  @Roles(Role.ADMIN, Role.AGENT)
  @Post()
  create(@Body() dto: CreateArticleDto) {
    return this.articlesService.create(dto);
  }

  @Roles(Role.ADMIN, Role.AGENT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.articlesService.remove(id);
  }
}

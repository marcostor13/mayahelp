import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { CategoriesService } from '../categories/categories.service';
import { AiDraftTicketDto } from './dto/ai-draft-ticket.dto';

@Controller('tickets/ai-draft')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Post()
  async draftTicket(@Body() dto: AiDraftTicketDto) {
    const categories = await this.categoriesService.findAll('ticket');
    const categoryOptions = categories.map((c) => ({
      id: c.id,
      name: c.name,
    }));
    return this.aiService.draftTicket(
      dto.freeText,
      categoryOptions,
      dto.imageBase64,
    );
  }
}

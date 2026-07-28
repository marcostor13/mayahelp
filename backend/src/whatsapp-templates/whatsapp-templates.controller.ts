import { Body, Controller, Get, Post } from '@nestjs/common';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('whatsapp-templates')
@Roles(Role.ADMIN)
export class WhatsAppTemplatesController {
  constructor(
    private readonly whatsAppTemplatesService: WhatsAppTemplatesService,
  ) {}

  @Get()
  list() {
    return this.whatsAppTemplatesService.list();
  }

  @Post()
  create(@Body() dto: CreateWhatsAppTemplateDto) {
    return this.whatsAppTemplatesService.create(dto);
  }
}

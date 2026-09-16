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
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { BulkUpdateStatusDto } from './dto/bulk-update-status.dto';
import { BulkUpdateProjectDto } from './dto/bulk-update-project.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.create(dto, user);
  }

  @Get()
  findAll(
    @Query() filter: FilterTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findAll(filter, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.findById(id, user);
  }

  @Patch('bulk/status')
  @Roles(Role.ADMIN, Role.AGENT)
  updateManyStatus(
    @Body() dto: BulkUpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.updateManyStatus(dto.ids, dto.status, user);
  }

  /** Clasificar el backlog: mover varios tickets a un proyecto (o sacarlos de uno). */
  @Patch('bulk/project')
  @Roles(Role.ADMIN, Role.AGENT)
  updateManyProject(
    @Body() dto: BulkUpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.updateManyProject(dto.ids, dto.project, user);
  }

  /**
   * Sin `@Roles`: un cliente puede editar su propio ticket mientras está abierto.
   * El alcance de cada rol lo resuelve el servicio.
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.addComment(id, dto.message, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.remove(id, user);
  }
}

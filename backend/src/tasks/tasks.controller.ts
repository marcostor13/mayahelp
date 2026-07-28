import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('tasks')
@Roles(Role.ADMIN, Role.AGENT)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findAllForAgent(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, user.userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.remove(id, user.userId);
  }
}

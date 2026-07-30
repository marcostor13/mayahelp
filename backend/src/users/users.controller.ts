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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateUsersFromReportersDto } from './dto/create-users-from-reporters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.userId);
  }

  /** Self-service profile edit — deliberately cannot touch role or active state. */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AGENT)
  findAll(@Query('role') role?: Role, @Query('search') search?: string) {
    return this.usersService.findAllWithTicketCounts({ role, search });
  }

  /** People authorized on the public links that still have no account. */
  @Get('pending-reporters')
  @Roles(Role.ADMIN)
  pendingReporters() {
    return this.usersService.findPendingReporters();
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateUserDto) {
    const { user, temporaryPassword } =
      await this.usersService.createWithPassword(dto);
    return { user, temporaryPassword };
  }

  @Post('from-reporters')
  @Roles(Role.ADMIN)
  createFromReporters(@Body() dto: CreateUsersFromReportersDto) {
    return this.usersService.createFromReporters(dto.emails);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AGENT)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}

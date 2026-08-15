import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { BackupsService } from './backups.service';
import { CreateDatabaseConnectionDto } from './dto/create-database-connection.dto';
import { UpdateDatabaseConnectionDto } from './dto/update-database-connection.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

/**
 * Solo admin: acá se cargan las credenciales de las bases de producción y se bajan los
 * dumps completos. No hay motivo para que un agente llegue a esto.
 */
@Controller('backups')
@Roles(Role.ADMIN)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  /** Conexiones registradas, cada una con su historial reciente. */
  @Get('connections')
  list() {
    return this.backupsService.findAll();
  }

  @Post('connections')
  create(
    @Body() dto: CreateDatabaseConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.backupsService.create(dto, user.userId);
  }

  @Patch('connections/:id')
  update(@Param('id') id: string, @Body() dto: UpdateDatabaseConnectionDto) {
    return this.backupsService.update(id, dto);
  }

  @Delete('connections/:id')
  remove(@Param('id') id: string) {
    return this.backupsService.remove(id);
  }

  /** Prueba la conexión (túnel SSH incluido) sin volcar nada. */
  @Post('connections/:id/test')
  test(@Param('id') id: string) {
    return this.backupsService.testConnection(id);
  }

  /** Dispara un backup ahora, sin esperar a la programación. */
  @Post('connections/:id/run')
  run(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.backupsService.runNow(id, user.userId);
  }

  @Get('connections/:id/history')
  history(@Param('id') id: string) {
    return this.backupsService.history(id);
  }

  /** Link firmado de R2 para bajar el `.archive.gz`. */
  @Get(':id/download')
  download(@Param('id') id: string) {
    return this.backupsService.downloadUrl(id);
  }
}

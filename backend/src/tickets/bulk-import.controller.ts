import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  BulkImportService,
  BULK_IMPORT_TEMPLATE_CSV,
} from './bulk-import.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('tickets/bulk-import')
@Roles(Role.ADMIN, Role.AGENT)
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

  @Get('template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla-tickets.csv"')
  downloadTemplate(): string {
    return BULK_IMPORT_TEMPLATE_CSV;
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES },
    }),
  )
  async import(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    const rows = this.bulkImportService.parseFile(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException('El archivo no contiene filas de datos.');
    }
    return this.bulkImportService.importRows(rows);
  }
}

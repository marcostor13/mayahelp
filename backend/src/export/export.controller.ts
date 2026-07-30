import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ExportCombinedDto } from './dto/export-combined.dto';

@Controller()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('tickets/:id/export.md')
  async exportOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const { code, markdown } = await this.exportService.exportOne(id, user);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${code}.md"`);
    res.send(markdown);
  }

  /**
   * Single Markdown document with the selected tickets — or with every ticket matching
   * `filter` when no ids are sent. Intended to be handed whole to a coding AI.
   */
  @Post('tickets/export/combined.md')
  async exportCombined(
    @Body() dto: ExportCombinedDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const markdown = await this.exportService.exportCombined(
      { ids: dto.ids, filter: dto.filter },
      user,
    );
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tickets-mayahelp.md"',
    );
    res.send(markdown);
  }

  @Post('tickets/export/bulk.md')
  async exportMany(
    @Body('ids') ids: string[],
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.exportService.exportManyToZip(ids ?? [], user, res);
  }
}

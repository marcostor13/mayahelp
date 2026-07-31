import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Sirve los adjuntos cuando el bucket de R2 no tiene dominio público: redirige a un link
 * firmado al vuelo. Lo consumen el navegador (miniaturas del ticket) y quien lea el
 * Markdown exportado —Claude Code en GitHub Actions, por ejemplo—, ninguno de los dos con
 * sesión, así que vive en su propio controlador: `RolesGuard` mira los roles de la
 * *clase*, y un handler `@Public()` dentro de un controlador con `@Roles(...)` igual se
 * rechazaría.
 *
 * La única credencial es el token HMAC derivado por adjunto, comparado en tiempo constante.
 */
@Controller('attachments')
export class AttachmentFilesController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Public()
  @Get(':id/file')
  async file(
    @Param('id') id: string,
    @Query('t') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.attachments.resolveFileRedirect(id, token ?? '');
    // 302 y no 301: el destino se firma en cada pedido y no hay que cachear el redirect.
    res.redirect(302, target);
  }
}

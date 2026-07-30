import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ImplementationsService } from './implementations.service';
import { RunCallbackDto } from './dto/run-callback.dto';
import { Public } from '../common/decorators/public.decorator';

/**
 * Reported by the GitHub workflow while it works, so it lives outside the admin
 * controller: `RolesGuard` reads the roles of the *class*, and a class that requires a
 * role rejects an unauthenticated request even when the handler is `@Public()`.
 *
 * The only credential here is the per-run token derived from the project's callback
 * secret, checked in constant time by the service.
 */
@Controller('implementations/hooks')
export class ImplementationHooksController {
  constructor(private readonly implementations: ImplementationsService) {}

  @Public()
  @Post(':runKey')
  @HttpCode(204)
  async callback(
    @Param('runKey') runKey: string,
    @Headers('x-mayahelp-token') token: string,
    @Body() dto: RunCallbackDto,
  ): Promise<void> {
    await this.implementations.handleCallback(runKey, token ?? '', dto);
  }
}

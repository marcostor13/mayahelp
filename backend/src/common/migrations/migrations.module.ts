import { Module } from '@nestjs/common';
import { ReferenceIdsMigration } from './reference-ids.migration';

/** Arreglos de datos que corren solos al arrancar, antes de aceptar requests. */
@Module({
  providers: [ReferenceIdsMigration],
})
export class MigrationsModule {}

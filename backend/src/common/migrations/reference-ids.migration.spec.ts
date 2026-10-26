import { Schema, SchemaType } from 'mongoose';
import { referencePaths } from './reference-ids.migration';
import { ArticleSchema } from '../../articles/schemas/article.schema';
import { AttachmentSchema } from '../../attachments/schemas/attachment.schema';
import { DatabaseBackupSchema } from '../../backups/schemas/database-backup.schema';
import { DatabaseConnectionSchema } from '../../backups/schemas/database-connection.schema';
import { ImplementationRunSchema } from '../../implementations/schemas/implementation-run.schema';
import { ProjectRepoSchema } from '../../implementations/schemas/project-repo.schema';
import { MonitorCheckSchema } from '../../monitoring/schemas/monitor-check.schema';
import { ProjectConnectionSchema } from '../../monitoring/schemas/project-connection.schema';
import { ProjectShareLinkSchema } from '../../projects/schemas/project-share-link.schema';
import { ProjectSchema } from '../../projects/schemas/project.schema';
import { TaskSchema } from '../../tasks/schemas/task.schema';
import { TicketSchema } from '../../tickets/schemas/ticket.schema';
import { UserSchema } from '../../users/schemas/user.schema';

const SCHEMAS: Record<string, Schema> = {
  Article: ArticleSchema,
  Attachment: AttachmentSchema,
  DatabaseBackup: DatabaseBackupSchema,
  DatabaseConnection: DatabaseConnectionSchema,
  ImplementationRun: ImplementationRunSchema,
  ProjectRepo: ProjectRepoSchema,
  MonitorCheck: MonitorCheckSchema,
  ProjectConnection: ProjectConnectionSchema,
  ProjectShareLink: ProjectShareLinkSchema,
  Project: ProjectSchema,
  Task: TaskSchema,
  Ticket: TicketSchema,
  User: UserSchema,
};

/** Rutas con `ref` cuyo tipo no es ObjectId, incluidas las de subdocumentos. */
function mixedReferences(schema: Schema, prefix = ''): string[] {
  const found: string[] = [];
  schema.eachPath((path, type) => {
    const embedded = (type as SchemaType & { embeddedSchemaType?: SchemaType })
      .embeddedSchemaType;
    const nested = (type as SchemaType & { schema?: Schema }).schema;
    if (nested instanceof Schema) {
      found.push(...mixedReferences(nested, `${prefix}${path}.`));
    } else if (type.options?.ref && type.instance !== 'ObjectId') {
      found.push(`${prefix}${path}`);
    } else if (embedded?.options?.ref && embedded.instance !== 'ObjectId') {
      found.push(`${prefix}${path}`);
    }
  });
  return found;
}

/**
 * Declarada con `Types.ObjectId` en lugar de `MongooseSchema.Types.ObjectId`, `@Prop` arma
 * la referencia como `Mixed`: se guarda en texto, y los filtros de acceso, que comparan
 * contra ObjectId, no la encuentran nunca. Así quedaban los tickets de un proyecto
 * invisibles para todos menos el súper usuario.
 */
describe('referencias entre colecciones', () => {
  it.each(Object.keys(SCHEMAS))('%s no tiene referencias Mixed', (name) => {
    expect(mixedReferences(SCHEMAS[name])).toEqual([]);
  });

  it('la migración encuentra las referencias sueltas, en arrays y en subdocumentos', () => {
    expect(
      referencePaths(TicketSchema)
        .map((ref) => ref.path)
        .sort(),
    ).toEqual(
      [
        'assignedAgent',
        'category',
        'client',
        'comments.author',
        'project',
      ].sort(),
    );
    expect(referencePaths(UserSchema).map((ref) => ref.path)).toEqual([
      'projects',
    ]);
  });
});

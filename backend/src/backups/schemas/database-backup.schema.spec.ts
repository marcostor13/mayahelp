import { model, Types } from 'mongoose';
import { DatabaseBackupSchema } from './database-backup.schema';
import { DatabaseConnectionSchema } from './database-connection.schema';

/**
 * El historial se guarda con el `_id` de la conexión (un ObjectId) y se lee por el mismo id
 * pero en texto. Eso solo funciona si el campo es de tipo ObjectId: declarado con
 * `Types.ObjectId` en lugar de `MongooseSchema.Types.ObjectId`, `@Prop` lo arma como `Mixed`,
 * `Mixed` no castea, y la comparación ObjectId contra string no devuelve nada — el síntoma
 * era un historial siempre vacío aunque el dump se hubiera subido bien a R2.
 */
describe('esquemas de backups', () => {
  it('guarda la referencia a la conexión como ObjectId, no como Mixed', () => {
    expect(DatabaseBackupSchema.path('connection').instance).toBe('ObjectId');
    expect(DatabaseBackupSchema.path('triggeredBy').instance).toBe('ObjectId');
    expect(DatabaseConnectionSchema.path('createdBy').instance).toBe(
      'ObjectId',
    );
  });

  it('castea el id de texto con el que se pide el historial', () => {
    const Backup = model('DatabaseBackupSchemaSpec', DatabaseBackupSchema);
    const connectionId = new Types.ObjectId();

    const query = Backup.find({ connection: connectionId.toString() });
    const filter = query.cast(Backup) as unknown as { connection: unknown };

    expect(filter.connection).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.connection)).toBe(connectionId.toString());
  });
});

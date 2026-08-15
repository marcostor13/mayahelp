import { Backups } from './backups';
import { BackupService } from '../../core/services/backup.service';
import { DatabaseConnection } from '../../core/models/backup.model';

function component(): Page {
  return new Backups({} as BackupService) as unknown as Page;
}

/** El componente expone todo como `protected`; los tests lo miran desde afuera. */
type Page = Backups & {
  type: 'atlas' | 'ssh';
  name: string;
  database: string;
  uri: string;
  sshHost: string;
  sshUsername: string;
  sshPassword: string;
  sshPrivateKey: string;
  mongoPassword: string;
  retentionCount: number;
  frequency: string;
  hour: number;
  minute: number;
  editingId: { set(value: string | null): void };
  canSubmit: boolean;
  openEdit(connection: DatabaseConnection): void;
  buildPayload(): Record<string, unknown>;
  storedCount(connection: DatabaseConnection): number;
  formatBytes(bytes: number): string;
  formatDuration(ms: number): string;
  statusLabel(status: string | null): string;
};

function connection(overrides: Partial<DatabaseConnection> = {}): DatabaseConnection {
  return {
    _id: 'c1',
    name: 'Producción',
    type: 'atlas',
    database: 'mayahelp',
    isActive: true,
    hasUri: true,
    hasSshPassword: false,
    hasSshPrivateKey: false,
    hasMongoPassword: false,
    retentionCount: 3,
    schedule: { frequency: 'daily', hour: 3, minute: 0, dayOfWeek: 1, dayOfMonth: 1 },
    scheduleLabel: 'Todos los días a las 03:00 (Lima)',
    nextRunAt: '2026-08-16T08:00:00.000Z',
    lastRunAt: '2026-08-15T08:00:00.000Z',
    lastStatus: 'success',
    lastSuccessAt: '2026-08-15T08:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    backups: [],
    ...overrides,
  };
}

describe('Backups', () => {
  describe('canSubmit', () => {
    it('exige URI al dar de alta una conexión de Atlas', () => {
      const page = component();
      page.name = 'Producción';
      expect(page.canSubmit).toBe(false);

      page.uri = 'mongodb+srv://u:p@cluster.mongodb.net/mibase';
      expect(page.canSubmit).toBe(true);
    });

    it('acepta una URI sin base si el nombre va en el formulario', () => {
      const page = component();
      page.name = 'Producción';
      page.uri = 'mongodb+srv://u:p@cluster.mongodb.net';
      expect(page.canSubmit).toBe(false);

      page.database = 'mayahelp';
      expect(page.canSubmit).toBe(true);
    });

    it('al editar no vuelve a pedir la credencial guardada', () => {
      const page = component();
      page.openEdit(connection());
      expect(page.uri).toBe('');
      expect(page.canSubmit).toBe(true);
    });

    it('una conexión SSH necesita host, usuario, base y una credencial', () => {
      const page = component();
      page.type = 'ssh';
      page.name = 'VPS';
      page.sshHost = '1.2.3.4';
      page.sshUsername = 'ubuntu';
      expect(page.canSubmit).toBe(false);

      page.database = 'mayahelp';
      expect(page.canSubmit).toBe(false);

      page.sshPrivateKey = '-----BEGIN OPENSSH PRIVATE KEY-----';
      expect(page.canSubmit).toBe(true);
    });
  });

  describe('buildPayload', () => {
    it('no manda los secretos que quedaron vacíos, para no pisar los guardados', () => {
      const page = component();
      page.openEdit(connection({ type: 'ssh', sshHost: '1.2.3.4', sshUsername: 'ubuntu' }));
      const payload = page.buildPayload();

      expect(payload.sshPassword).toBeUndefined();
      expect(payload.sshPrivateKey).toBeUndefined();
      expect(payload.mongoPassword).toBeUndefined();
      expect(payload.sshHost).toBe('1.2.3.4');
    });

    it('manda el secreto recién escrito', () => {
      const page = component();
      page.type = 'ssh';
      page.name = 'VPS';
      page.database = 'mayahelp';
      page.sshHost = '1.2.3.4';
      page.sshUsername = 'ubuntu';
      page.mongoPassword = 'nueva';
      expect(page.buildPayload().mongoPassword).toBe('nueva');
    });

    it('incluye la programación completa y la retención', () => {
      const page = component();
      page.name = 'Producción';
      page.uri = 'mongodb+srv://u:p@c.mongodb.net/db';
      page.frequency = 'weekly';
      page.hour = 22;
      page.retentionCount = 5;

      expect(page.buildPayload()).toMatchObject({
        retentionCount: 5,
        schedule: { frequency: 'weekly', hour: 22, minute: 0, dayOfWeek: 1, dayOfMonth: 1 },
      });
    });

    it('con Atlas no arrastra los campos de SSH', () => {
      const page = component();
      page.name = 'Producción';
      page.uri = 'mongodb+srv://u:p@c.mongodb.net/db';
      const payload = page.buildPayload();
      expect(payload.sshHost).toBeUndefined();
      expect(payload.uri).toBe('mongodb+srv://u:p@c.mongodb.net/db');
    });
  });

  describe('presentación', () => {
    it('cuenta solo los backups correctos contra el tope de retención', () => {
      const page = component();
      const backups = [
        { status: 'success' },
        { status: 'failed' },
        { status: 'success' },
      ] as DatabaseConnection['backups'];
      expect(page.storedCount(connection({ backups }))).toBe(2);
    });

    it('formatea tamaños y duraciones', () => {
      const page = component();
      expect(page.formatBytes(0)).toBe('—');
      expect(page.formatBytes(512)).toBe('512 B');
      expect(page.formatBytes(1024 * 1024 * 3.5)).toBe('3.5 MB');
      expect(page.formatDuration(450)).toBe('450 ms');
      expect(page.formatDuration(45_000)).toBe('45 s');
      expect(page.formatDuration(125_000)).toBe('2 min 5 s');
    });

    it('una conexión sin corridas no se muestra como fallada', () => {
      expect(component().statusLabel(null)).toBe('Sin corridas');
    });
  });
});

import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { BackupService } from '../../core/services/backup.service';
import {
  BackupFrequency,
  BackupRunStatus,
  CreateDatabaseConnectionPayload,
  DatabaseBackup,
  DatabaseConnection,
  DatabaseConnectionType,
  TestConnectionResult,
} from '../../core/models/backup.model';

const TYPE_LABELS: Record<DatabaseConnectionType, string> = {
  atlas: 'MongoDB Atlas',
  ssh: 'MongoDB por SSH',
};

const TYPE_ICONS: Record<DatabaseConnectionType, string> = {
  atlas: 'cloud',
  ssh: 'dns',
};

const TYPE_HINTS: Record<DatabaseConnectionType, string> = {
  atlas:
    'Pegá la cadena de conexión de Atlas. El servidor tiene que poder salir a internet y la IP del backend estar permitida en Network Access.',
  ssh: 'Para un MongoDB que solo escucha dentro de un servidor. Se abre un túnel SSH y el backup se toma a través de él.',
};

const FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  hourly: 'Cada hora',
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
};

const STATUS_LABELS: Record<BackupRunStatus, string> = {
  running: 'En curso',
  success: 'Correcto',
  failed: 'Falló',
};

const STATUS_CLASSES: Record<BackupRunStatus, string> = {
  running: 'bg-primary-fixed text-on-primary-fixed',
  success: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-error-container text-on-error-container',
};

const STATUS_ICONS: Record<BackupRunStatus, string> = {
  running: 'autorenew',
  success: 'check_circle',
  failed: 'error',
};

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

@Component({
  selector: 'app-backups',
  imports: [FormsModule, DatePipe],
  templateUrl: './backups.html',
})
export class Backups implements OnInit {
  protected readonly typeLabels = TYPE_LABELS;
  protected readonly typeHints = TYPE_HINTS;
  protected readonly frequencyLabels = FREQUENCY_LABELS;
  protected readonly types: DatabaseConnectionType[] = ['atlas', 'ssh'];
  protected readonly frequencies: BackupFrequency[] = ['hourly', 'daily', 'weekly', 'monthly'];
  protected readonly weekdays = WEEKDAYS;
  protected readonly hours = Array.from({ length: 24 }, (_, hour) => hour);
  protected readonly minutes = [0, 15, 30, 45];
  protected readonly monthDays = Array.from({ length: 28 }, (_, index) => index + 1);

  protected readonly connections = signal<DatabaseConnection[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** Id de la conexión con una acción en curso (probar / respaldar / borrar). */
  protected readonly busyId = signal<string | null>(null);
  protected readonly testResult = signal<{ id: string; result: TestConnectionResult } | null>(null);
  /** Conexiones cuyo historial está desplegado. */
  protected readonly expanded = signal<Set<string>>(new Set());

  // --- formulario -----------------------------------------------------------
  protected type: DatabaseConnectionType = 'atlas';
  protected name = '';
  protected database = '';
  protected isActive = true;
  protected retentionCount = 3;

  protected uri = '';
  protected sshHost = '';
  protected sshPort = 22;
  protected sshUsername = '';
  protected sshPassword = '';
  protected sshPrivateKey = '';
  protected sshPassphrase = '';
  protected mongoHost = '127.0.0.1';
  protected mongoPort = 27017;
  protected mongoUsername = '';
  protected mongoPassword = '';
  protected authDatabase = 'admin';

  protected frequency: BackupFrequency = 'daily';
  protected hour = 3;
  protected minute = 0;
  protected dayOfWeek = 1;
  protected dayOfMonth = 1;

  constructor(private readonly backupService: BackupService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.backupService.list().subscribe({
      next: (connections) => {
        this.connections.set(connections);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'No se pudieron cargar las conexiones.');
        this.loading.set(false);
      },
    });
  }

  // --- formulario -----------------------------------------------------------

  openCreate(): void {
    this.resetForm();
    this.editingId.set(null);
    this.formOpen.set(true);
  }

  /** Los secretos quedan vacíos: el backend nunca los devuelve, y vacío = "no lo cambies". */
  openEdit(connection: DatabaseConnection): void {
    this.resetForm();
    this.editingId.set(connection._id);
    this.type = connection.type;
    this.name = connection.name;
    this.database = connection.database ?? '';
    this.isActive = connection.isActive;
    this.retentionCount = connection.retentionCount;
    this.sshHost = connection.sshHost ?? '';
    this.sshPort = connection.sshPort ?? 22;
    this.sshUsername = connection.sshUsername ?? '';
    this.mongoHost = connection.mongoHost ?? '127.0.0.1';
    this.mongoPort = connection.mongoPort ?? 27017;
    this.mongoUsername = connection.mongoUsername ?? '';
    this.authDatabase = connection.authDatabase ?? 'admin';
    this.frequency = connection.schedule.frequency;
    this.hour = connection.schedule.hour;
    this.minute = connection.schedule.minute;
    this.dayOfWeek = connection.schedule.dayOfWeek;
    this.dayOfMonth = connection.schedule.dayOfMonth;
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  /**
   * Mismo criterio que valida el backend, para no mandar un alta que ya se sabe incompleta.
   * Al editar no se exige la credencial: la guardada sigue valiendo si el campo queda vacío.
   */
  get canSubmit(): boolean {
    if (!this.name.trim()) return false;
    const editing = !!this.editingId();

    if (this.type === 'atlas') {
      if (!editing && !this.uri.trim()) return false;
      // Con Atlas la base puede venir del formulario o del final de la URI.
      return Boolean(this.database.trim() || editing || /\.[^/]+\/[^/?]+/.test(this.uri));
    }

    if (!this.sshHost.trim() || !this.sshUsername.trim() || !this.database.trim()) return false;
    return editing || Boolean(this.sshPassword || this.sshPrivateKey.trim());
  }

  submit(): void {
    this.formError.set(null);
    const payload = this.buildPayload();
    const id = this.editingId();

    this.saving.set(true);
    const request = id
      ? this.backupService.update(id, payload)
      : this.backupService.create(payload as CreateDatabaseConnectionPayload);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.formOpen.set(false);
        // El alta no trae historial; se conserva el que ya estaba al editar.
        this.connections.update((list) =>
          id
            ? list.map((item) =>
                item._id === id ? { ...item, ...saved, backups: item.backups } : item,
              )
            : [...list, { ...saved, backups: saved.backups ?? [] }],
        );
      },
      error: (err: HttpErrorResponse) => {
        this.formError.set(err.error?.message ?? 'No se pudo guardar la conexión.');
        this.saving.set(false);
      },
    });
  }

  /** Solo manda los secretos que el usuario escribió: vacío significa "dejalo como está". */
  protected buildPayload(): Partial<CreateDatabaseConnectionPayload> {
    const common = {
      name: this.name.trim(),
      type: this.type,
      database: this.database.trim() || undefined,
      isActive: this.isActive,
      retentionCount: Number(this.retentionCount) || 3,
      schedule: {
        frequency: this.frequency,
        hour: Number(this.hour),
        minute: Number(this.minute),
        dayOfWeek: Number(this.dayOfWeek),
        dayOfMonth: Number(this.dayOfMonth),
      },
    };

    if (this.type === 'atlas') {
      return { ...common, ...(this.uri.trim() ? { uri: this.uri.trim() } : {}) };
    }

    return {
      ...common,
      sshHost: this.sshHost.trim(),
      sshPort: Number(this.sshPort) || 22,
      sshUsername: this.sshUsername.trim(),
      mongoHost: this.mongoHost.trim() || '127.0.0.1',
      mongoPort: Number(this.mongoPort) || 27017,
      mongoUsername: this.mongoUsername.trim() || undefined,
      authDatabase: this.authDatabase.trim() || undefined,
      ...(this.sshPassword ? { sshPassword: this.sshPassword } : {}),
      ...(this.sshPrivateKey.trim() ? { sshPrivateKey: this.sshPrivateKey.trim() } : {}),
      ...(this.sshPassphrase ? { sshPassphrase: this.sshPassphrase } : {}),
      ...(this.mongoPassword ? { mongoPassword: this.mongoPassword } : {}),
    };
  }

  private resetForm(): void {
    this.type = 'atlas';
    this.name = '';
    this.database = '';
    this.isActive = true;
    this.retentionCount = 3;
    this.uri = '';
    this.sshHost = '';
    this.sshPort = 22;
    this.sshUsername = '';
    this.sshPassword = '';
    this.sshPrivateKey = '';
    this.sshPassphrase = '';
    this.mongoHost = '127.0.0.1';
    this.mongoPort = 27017;
    this.mongoUsername = '';
    this.mongoPassword = '';
    this.authDatabase = 'admin';
    this.frequency = 'daily';
    this.hour = 3;
    this.minute = 0;
    this.dayOfWeek = 1;
    this.dayOfMonth = 1;
    this.formError.set(null);
  }

  // --- acciones -------------------------------------------------------------

  test(connection: DatabaseConnection): void {
    this.busyId.set(connection._id);
    this.testResult.set(null);
    this.backupService.test(connection._id).subscribe({
      next: (result) => {
        this.testResult.set({ id: connection._id, result });
        this.busyId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.testResult.set({
          id: connection._id,
          result: {
            ok: false,
            database: connection.database ?? '',
            collections: 0,
            latencyMs: 0,
            error: err.error?.message ?? 'No se pudo probar la conexión.',
          },
        });
        this.busyId.set(null);
      },
    });
  }

  run(connection: DatabaseConnection): void {
    if (!confirm(`¿Generar un backup de "${connection.name}" ahora?`)) return;

    this.busyId.set(connection._id);
    this.error.set(null);
    this.backupService.run(connection._id).subscribe({
      next: () => {
        this.busyId.set(null);
        // Se recarga todo: el backup nuevo puede haber desalojado al más viejo.
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'No se pudo generar el backup.');
        this.busyId.set(null);
      },
    });
  }

  remove(connection: DatabaseConnection): void {
    const question =
      `¿Eliminar la conexión "${connection.name}"?\n\n` +
      'También se borran sus backups guardados en R2. Esto no se puede deshacer.';
    if (!confirm(question)) return;

    this.busyId.set(connection._id);
    this.backupService.remove(connection._id).subscribe({
      next: () => {
        this.connections.update((list) => list.filter((item) => item._id !== connection._id));
        this.busyId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'No se pudo eliminar la conexión.');
        this.busyId.set(null);
      },
    });
  }

  /** Pide el link firmado recién al hacer clic para que no caduque esperando en la tabla. */
  download(backup: DatabaseBackup): void {
    this.backupService.downloadUrl(backup._id).subscribe({
      next: ({ url }) => window.open(url, '_blank', 'noopener'),
      error: (err: HttpErrorResponse) =>
        this.error.set(err.error?.message ?? 'No se pudo generar el link de descarga.'),
    });
  }

  toggleHistory(connection: DatabaseConnection): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(connection._id)) next.delete(connection._id);
      else next.add(connection._id);
      return next;
    });
  }

  isExpanded(connection: DatabaseConnection): boolean {
    return this.expanded().has(connection._id);
  }

  // --- presentación ---------------------------------------------------------

  typeIcon(type: DatabaseConnectionType): string {
    return TYPE_ICONS[type];
  }

  statusLabel(status: BackupRunStatus | null): string {
    return status ? STATUS_LABELS[status] : 'Sin corridas';
  }

  statusClass(status: BackupRunStatus | null): string {
    return status ? STATUS_CLASSES[status] : 'bg-surface-container-high text-on-surface-variant';
  }

  statusIcon(status: BackupRunStatus | null): string {
    return status ? STATUS_ICONS[status] : 'help';
  }

  formatBytes(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
  }

  formatDuration(ms: number): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms} ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} s`;
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  }

  /** Cuántos backups guardados tiene la conexión, contra su tope de retención. */
  storedCount(connection: DatabaseConnection): number {
    return connection.backups.filter((backup) => backup.status === 'success').length;
  }

  testFor(connection: DatabaseConnection): TestConnectionResult | null {
    const current = this.testResult();
    return current?.id === connection._id ? current.result : null;
  }

  pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { UserAdminService } from '../../core/services/user-admin.service';
import { AuthService } from '../../core/services/auth.service';
import {
  CreatedAccount,
  ManagedUser,
  PendingReporter,
  UserNotificationPreferences,
} from '../../core/models/managed-user.model';
import { Role } from '../../core/models/user.model';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  agent: 'Agente',
  client: 'Cliente',
};

const ROLE_BADGES: Record<Role, string> = {
  admin: 'bg-primary-fixed text-on-primary-fixed',
  agent: 'bg-amber-100 text-amber-800',
  client: 'bg-surface-container-high text-on-surface-variant',
};

@Component({
  selector: 'app-users',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './users.html',
})
export class Users implements OnInit {
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roles: Role[] = ['admin', 'agent', 'client'];

  protected readonly users = signal<ManagedUser[]>([]);
  protected readonly pendingReporters = signal<PendingReporter[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  /** Temporary passwords are shown once, right after creating the accounts. */
  protected readonly createdAccounts = signal<CreatedAccount[]>([]);
  protected readonly selectedReporters = signal<Set<string>>(new Set());

  protected search = '';
  protected roleFilter: Role | '' = '';

  protected name = '';
  protected email = '';
  protected company = '';
  protected phone = '';
  protected role: Role = 'client';
  protected notifyByEmail = true;
  protected notifyByWhatsApp = true;

  constructor(
    private readonly userAdminService: UserAdminService,
    protected readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadPendingReporters();
  }

  load(): void {
    this.loading.set(true);
    this.userAdminService
      .list({ role: this.roleFilter || undefined, search: this.search.trim() || undefined })
      .subscribe({
        next: (users) => {
          this.users.set(users);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar los usuarios.');
          this.loading.set(false);
        },
      });
  }

  private loadPendingReporters(): void {
    this.userAdminService.pendingReporters().subscribe({
      next: (reporters) => this.pendingReporters.set(reporters),
      error: () => this.pendingReporters.set([]),
    });
  }

  setRoleFilter(role: Role | ''): void {
    this.roleFilter = this.roleFilter === role ? '' : role;
    this.load();
  }

  // --- alta / edición -----------------------------------------------------

  openCreate(): void {
    this.resetForm();
    this.formOpen.set(true);
  }

  openEdit(user: ManagedUser): void {
    this.editingId.set(user._id);
    this.name = user.name;
    this.email = user.email;
    this.company = user.company ?? '';
    this.phone = user.phone ?? '';
    this.role = user.role;
    this.notifyByEmail = user.notifications?.email ?? true;
    this.notifyByWhatsApp = user.notifications?.whatsapp ?? true;
    this.error.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.resetForm();
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.name = '';
    this.email = '';
    this.company = '';
    this.phone = '';
    this.role = 'client';
    this.notifyByEmail = true;
    this.notifyByWhatsApp = true;
    this.error.set(null);
  }

  get canSubmit(): boolean {
    return this.name.trim().length >= 2 && /.+@.+\..+/.test(this.email.trim());
  }

  submit(): void {
    if (!this.canSubmit) return;
    const payload = {
      name: this.name.trim(),
      email: this.email.trim(),
      company: this.company.trim() || undefined,
      phone: this.phone.trim() || undefined,
      role: this.role,
      notifyByEmail: this.notifyByEmail,
      notifyByWhatsApp: this.notifyByWhatsApp,
    };
    this.saving.set(true);
    this.error.set(null);

    const editingId = this.editingId();
    const onError = (err: HttpErrorResponse) => {
      this.error.set(
        (err.error as { message?: string | string[] })?.message?.toString() ??
          'No se pudo guardar el usuario.',
      );
      this.saving.set(false);
    };

    if (editingId) {
      this.userAdminService.update(editingId, payload).subscribe({
        next: () => this.afterSave(),
        error: onError,
      });
      return;
    }

    this.userAdminService.create(payload).subscribe({
      next: (result) => {
        if (result.temporaryPassword) {
          this.createdAccounts.set([
            {
              id: result.user._id,
              name: result.user.name,
              email: result.user.email,
              temporaryPassword: result.temporaryPassword,
            },
          ]);
        }
        this.afterSave();
      },
      error: onError,
    });
  }

  private afterSave(): void {
    this.saving.set(false);
    this.closeForm();
    this.load();
    this.loadPendingReporters();
  }

  toggleNotification(user: ManagedUser, channel: 'email' | 'whatsapp'): void {
    const current = this.preferencesOf(user);
    const next = !current[channel];
    // Optimistic: the switch reacts immediately and rolls back if the API rejects it.
    this.patchLocal(user._id, { notifications: { ...current, [channel]: next } });
    this.userAdminService
      .update(user._id, channel === 'email' ? { notifyByEmail: next } : { notifyByWhatsApp: next })
      .subscribe({
        next: (updated) => this.patchLocal(user._id, updated),
        error: () => {
          this.patchLocal(user._id, { notifications: { ...current, [channel]: !next } });
          this.error.set('No se pudo actualizar la notificación.');
        },
      });
  }

  toggleActive(user: ManagedUser): void {
    const next = !user.isActive;
    this.patchLocal(user._id, { isActive: next });
    this.userAdminService.update(user._id, { isActive: next }).subscribe({
      next: (updated) => this.patchLocal(user._id, updated),
      error: () => {
        this.patchLocal(user._id, { isActive: !next });
        this.error.set('No se pudo actualizar el estado de la cuenta.');
      },
    });
  }

  remove(user: ManagedUser): void {
    if (!confirm(`¿Eliminar la cuenta de ${user.name}? Esta acción no se puede deshacer.`)) return;
    this.userAdminService.remove(user._id).subscribe({
      next: () => {
        this.users.update((list) => list.filter((item) => item._id !== user._id));
        this.loadPendingReporters();
      },
      error: () => this.error.set('No se pudo eliminar la cuenta.'),
    });
  }

  /** Accounts created before per-user preferences existed default to both channels on. */
  private preferencesOf(user: ManagedUser): UserNotificationPreferences {
    return {
      email: user.notifications?.email ?? true,
      whatsapp: user.notifications?.whatsapp ?? true,
    };
  }

  private patchLocal(id: string, patch: Partial<ManagedUser>): void {
    this.users.update((list) =>
      list.map((user) => (user._id === id ? { ...user, ...patch } : user)),
    );
  }

  // --- personas de los enlaces -------------------------------------------

  isReporterSelected(email: string): boolean {
    return this.selectedReporters().has(email);
  }

  toggleReporter(email: string): void {
    this.selectedReporters.update((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  toggleAllReporters(): void {
    const all = this.pendingReporters().map((reporter) => reporter.email);
    this.selectedReporters.update((current) =>
      current.size === all.length ? new Set() : new Set(all),
    );
  }

  createSelectedAccounts(): void {
    const emails = [...this.selectedReporters()];
    if (emails.length === 0) return;
    this.saving.set(true);
    this.userAdminService.createFromReporters(emails).subscribe({
      next: (accounts) => {
        this.createdAccounts.set(accounts);
        this.selectedReporters.set(new Set());
        this.saving.set(false);
        this.load();
        this.loadPendingReporters();
      },
      error: () => {
        this.error.set('No se pudieron crear las cuentas.');
        this.saving.set(false);
      },
    });
  }

  async copyCredentials(): Promise<void> {
    const text = this.createdAccounts()
      .map(
        (account) =>
          `${account.name} <${account.email}> — contraseña temporal: ${account.temporaryPassword}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be blocked; the credentials stay visible on screen anyway.
    }
  }

  dismissCredentials(): void {
    this.createdAccounts.set([]);
  }

  // --- helpers ------------------------------------------------------------

  roleBadge(role: Role): string {
    return ROLE_BADGES[role];
  }

  initials(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }
}

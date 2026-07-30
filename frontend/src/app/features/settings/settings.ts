import { Component, OnInit, computed, effect, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { WhatsAppTemplateService } from '../../core/services/whatsapp-template.service';
import { NotificationSettings, NotificationTestResult } from '../../core/models/app-settings.model';
import { WhatsAppTemplate } from '../../core/models/whatsapp-template.model';

/** Counts the distinct `{{n}}` placeholders of an approved template body. */
function countTemplateVariables(bodyText: string): number {
  return new Set([...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1])).size;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink],
  templateUrl: './settings.html',
})
export class Settings implements OnInit {
  // --- perfil -------------------------------------------------------------
  protected phone = '';
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);

  // --- notificaciones -----------------------------------------------------
  protected readonly settings = signal<NotificationSettings | null>(null);
  protected readonly templates = signal<WhatsAppTemplate[]>([]);
  protected readonly templatesError = signal<string | null>(null);
  protected readonly loadingSettings = signal(false);
  protected readonly savingSettings = signal(false);
  protected readonly settingsSaved = signal(false);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly testing = signal(false);
  protected readonly testResult = signal<NotificationTestResult | null>(null);

  protected newPhone = '';
  protected newEmail = '';

  constructor(
    protected readonly auth: AuthService,
    private readonly appSettingsService: AppSettingsService,
    private readonly whatsappTemplateService: WhatsAppTemplateService,
  ) {
    effect(() => {
      this.phone = this.auth.currentUser()?.phone ?? '';
    });
  }

  ngOnInit(): void {
    if (!this.isAdmin) return;
    this.loadingSettings.set(true);
    this.appSettingsService.getNotifications().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.loadingSettings.set(false);
      },
      error: () => {
        this.settingsError.set('No se pudieron cargar los ajustes de notificaciones.');
        this.loadingSettings.set(false);
      },
    });
    this.whatsappTemplateService.list().subscribe({
      next: (templates) => this.templates.set(templates),
      error: (err: HttpErrorResponse) =>
        this.templatesError.set(
          err.status === 503
            ? 'WhatsApp Cloud API no está configurada en el servidor (falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_BUSINESS_ACCOUNT_ID).'
            : 'No se pudieron traer los templates aprobados de Meta. Puedes escribir el nombre a mano.',
        ),
    });
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  savePhone(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.auth.updateProfile({ phone: this.phone || undefined }).then(
      () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      () => this.saving.set(false),
    );
  }

  // --- template + variables ----------------------------------------------

  protected readonly selectedTemplate = computed(() => {
    const name = this.settings()?.whatsapp.templateName;
    if (!name) return null;
    return this.templates().find((template) => template.name === name) ?? null;
  });

  /** How many parameters the chosen template expects, so the UI asks for exactly those. */
  protected readonly templateVariableCount = computed(() => {
    const template = this.selectedTemplate();
    if (!template) return this.settings()?.whatsapp.variables.length ?? 0;
    return countTemplateVariables(template.bodyText);
  });

  protected readonly variableSlots = computed(() =>
    Array.from({ length: this.templateVariableCount() }, (_, index) => index),
  );

  variableAt(index: number): string {
    return this.settings()?.whatsapp.variables[index] ?? '';
  }

  setVariableAt(index: number, token: string): void {
    const settings = this.settings();
    if (!settings) return;
    const variables = [...settings.whatsapp.variables];
    while (variables.length < index) variables.push('');
    variables[index] = token;
    this.patchWhatsApp({ variables });
  }

  onTemplateSelected(name: string): void {
    const template = this.templates().find((item) => item.name === name);
    this.patchWhatsApp({
      templateName: name,
      templateLanguage: template?.language ?? this.settings()?.whatsapp.templateLanguage ?? 'es',
    });
  }

  // --- recipient lists ----------------------------------------------------

  addPhone(): void {
    const phone = this.newPhone.trim();
    const settings = this.settings();
    if (!phone || !settings) return;
    if (settings.whatsapp.recipients.includes(phone)) {
      this.newPhone = '';
      return;
    }
    this.patchWhatsApp({ recipients: [...settings.whatsapp.recipients, phone] });
    this.newPhone = '';
  }

  removePhone(phone: string): void {
    const settings = this.settings();
    if (!settings) return;
    this.patchWhatsApp({
      recipients: settings.whatsapp.recipients.filter((item) => item !== phone),
    });
  }

  addEmail(): void {
    const email = this.newEmail.trim().toLowerCase();
    const settings = this.settings();
    if (!email || !settings) return;
    if (settings.email.recipients.includes(email)) {
      this.newEmail = '';
      return;
    }
    this.patchEmail({ recipients: [...settings.email.recipients, email] });
    this.newEmail = '';
  }

  removeEmail(email: string): void {
    const settings = this.settings();
    if (!settings) return;
    this.patchEmail({ recipients: settings.email.recipients.filter((item) => item !== email) });
  }

  // --- local patches (saved with the "Guardar" button) --------------------

  patchWhatsApp(patch: Partial<NotificationSettings['whatsapp']>): void {
    this.settings.update((current) =>
      current ? { ...current, whatsapp: { ...current.whatsapp, ...patch } } : current,
    );
    this.settingsSaved.set(false);
  }

  patchEmail(patch: Partial<NotificationSettings['email']>): void {
    this.settings.update((current) =>
      current ? { ...current, email: { ...current.email, ...patch } } : current,
    );
    this.settingsSaved.set(false);
  }

  patchEvents(patch: Partial<NotificationSettings['events']>): void {
    this.settings.update((current) =>
      current ? { ...current, events: { ...current.events, ...patch } } : current,
    );
    this.settingsSaved.set(false);
  }

  saveNotifications(): void {
    const settings = this.settings();
    if (!settings) return;
    this.savingSettings.set(true);
    this.settingsError.set(null);
    this.settingsSaved.set(false);
    this.appSettingsService
      .updateNotifications({
        whatsapp: {
          enabled: settings.whatsapp.enabled,
          recipients: settings.whatsapp.recipients,
          notifyClient: settings.whatsapp.notifyClient,
          templateName: settings.whatsapp.templateName,
          templateLanguage: settings.whatsapp.templateLanguage,
          variables: settings.whatsapp.variables.slice(0, this.templateVariableCount()),
        },
        email: settings.email,
        events: settings.events,
      })
      .subscribe({
        next: (updated) => {
          this.settings.set(updated);
          this.savingSettings.set(false);
          this.settingsSaved.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.settingsError.set(
            (err.error as { message?: string | string[] })?.message?.toString() ??
              'No se pudieron guardar los ajustes.',
          );
          this.savingSettings.set(false);
        },
      });
  }

  sendTest(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.appSettingsService.sendTest().subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.testing.set(false);
      },
      error: () => {
        this.settingsError.set('No se pudo enviar la notificación de prueba.');
        this.testing.set(false);
      },
    });
  }
}

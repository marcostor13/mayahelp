import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { WhatsAppTemplateService } from '../../core/services/whatsapp-template.service';
import {
  CreateWhatsAppTemplatePayload,
  WhatsAppTemplate,
  WhatsAppTemplateCategory,
} from '../../core/models/whatsapp-template.model';

const CATEGORY_OPTIONS: { value: WhatsAppTemplateCategory; label: string }[] = [
  { value: 'UTILITY', label: 'Utilidad (notificaciones transaccionales)' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'AUTHENTICATION', label: 'Autenticación' },
];

@Component({
  selector: 'app-whatsapp-templates',
  imports: [FormsModule],
  templateUrl: './whatsapp-templates.html',
})
export class WhatsAppTemplates implements OnInit {
  protected readonly categoryOptions = CATEGORY_OPTIONS;
  protected readonly templates = signal<WhatsAppTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitSuccess = signal<string | null>(null);
  protected readonly bodyExamples = signal<string[]>([]);

  protected name = '';
  protected language = 'es';
  protected category: WhatsAppTemplateCategory = 'UTILITY';
  protected headerText = '';
  protected bodyText = '';
  protected footerText = '';

  constructor(private readonly whatsAppTemplateService: WhatsAppTemplateService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.whatsAppTemplateService.list().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadError.set(err.error?.message ?? 'No se pudieron cargar los templates.');
        this.loading.set(false);
      },
    });
  }

  protected wrapVar(n: number): string {
    return `{{${n}}}`;
  }

  get variableCount(): number {
    const matches = new Set([...this.bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]));
    return matches.size;
  }

  onBodyTextChange(): void {
    const count = this.variableCount;
    this.bodyExamples.update((examples) => {
      const next = examples.slice(0, count);
      while (next.length < count) next.push('');
      return next;
    });
  }

  setExample(index: number, value: string): void {
    this.bodyExamples.update((examples) => {
      const next = [...examples];
      next[index] = value;
      return next;
    });
  }

  submit(): void {
    this.submitError.set(null);
    this.submitSuccess.set(null);
    if (!this.name || !this.bodyText) {
      this.submitError.set('El nombre y el cuerpo del mensaje son obligatorios.');
      return;
    }
    if (this.variableCount > 0 && this.bodyExamples().some((example) => !example.trim())) {
      this.submitError.set('Completa un valor de ejemplo para cada variable del cuerpo.');
      return;
    }

    const payload: CreateWhatsAppTemplatePayload = {
      name: this.name,
      language: this.language || undefined,
      category: this.category,
      headerText: this.headerText || undefined,
      bodyText: this.bodyText,
      footerText: this.footerText || undefined,
      bodyExamples: this.variableCount > 0 ? this.bodyExamples() : undefined,
    };

    this.submitting.set(true);
    this.whatsAppTemplateService.create(payload).subscribe({
      next: (template) => {
        this.templates.update((templates) => [template, ...templates]);
        this.submitSuccess.set(
          `Template "${template.name}" enviado a Meta para revisión (estado: ${template.status}).`,
        );
        this.resetForm();
        this.submitting.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.submitError.set(err.error?.message ?? 'No se pudo crear el template.');
        this.submitting.set(false);
      },
    });
  }

  private resetForm(): void {
    this.name = '';
    this.headerText = '';
    this.bodyText = '';
    this.footerText = '';
    this.bodyExamples.set([]);
  }
}

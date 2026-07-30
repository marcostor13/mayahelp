import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AccountService } from '../../core/services/account.service';
import { AuthService } from '../../core/services/auth.service';
import { CategoryService } from '../../core/services/category.service';
import { TicketService } from '../../core/services/ticket.service';
import { AttachmentService } from '../../core/services/attachment.service';
import { MediaCapture } from '../../shared/media-capture/media-capture';
import { AccountSummary } from '../../core/models/account.model';
import { Category } from '../../core/models/category.model';
import { TicketPriority, TicketStatus } from '../../core/models/ticket.model';

const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: 'Abiertos',
  en_proceso: 'En proceso',
  resuelto: 'Resueltos',
  cerrado: 'Cerrados',
};

const STATUS_DOTS: Record<TicketStatus, string> = {
  abierto: 'bg-primary',
  en_proceso: 'bg-amber-500',
  resuelto: 'bg-emerald-500',
  cerrado: 'bg-gray-400',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: 'En planificación',
  in_progress: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
};

const MAX_FILES = 5;

@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink, DatePipe, MediaCapture],
  templateUrl: './account.html',
})
export class Account implements OnInit {
  protected readonly statuses: TicketStatus[] = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  protected readonly maxFiles = MAX_FILES;

  protected readonly summary = signal<AccountSummary | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);

  // --- nuevo ticket (mismo flujo que el enlace público) --------------------
  protected readonly composerOpen = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly createdCode = signal<string | null>(null);
  protected readonly selectedFiles = signal<File[]>([]);

  protected description = '';
  protected category = '';
  protected project = '';
  protected priority: TicketPriority = 'media';

  constructor(
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
    private readonly ticketService: TicketService,
    private readonly attachmentService: AttachmentService,
    protected readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.categoryService.list('ticket').subscribe((categories) => {
      this.categories.set(categories);
      if (!this.category && categories.length > 0) this.category = categories[0]._id;
    });
  }

  private load(): void {
    this.loading.set(true);
    this.accountService.getSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        if (!this.project && summary.projects.length === 1) {
          this.project = summary.projects[0]._id;
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // --- estadísticas -------------------------------------------------------

  countByStatus(status: TicketStatus): number {
    return this.summary()?.tickets.byStatus?.[status] ?? 0;
  }

  statusDot(status: TicketStatus): string {
    return STATUS_DOTS[status];
  }

  /** Share of the total, so the bars stay meaningful with any number of tickets. */
  sharePercent(status: TicketStatus): number {
    const total = this.summary()?.tickets.total ?? 0;
    if (total === 0) return 0;
    return Math.round((this.countByStatus(status) / total) * 100);
  }

  // --- composer -----------------------------------------------------------

  toggleComposer(): void {
    this.composerOpen.update((open) => !open);
    this.createdCode.set(null);
  }

  onFilesAdded(files: File[]): void {
    this.selectedFiles.update((current) => [...current, ...files].slice(0, MAX_FILES));
  }

  removeFile(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
  }

  get canSubmit(): boolean {
    return !!this.category && this.description.trim().length >= 10;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting.set(true);
    this.submitError.set(null);

    this.ticketService
      .create({
        description: this.description.trim(),
        category: this.category,
        project: this.project || undefined,
        priority: this.priority,
      })
      .subscribe({
        next: (ticket) => {
          const files = this.selectedFiles();
          if (files.length === 0) {
            this.finishSubmit(ticket.code);
            return;
          }
          // Attachments upload after the ticket exists, since they hang off its id.
          let pending = files.length;
          for (const file of files) {
            this.attachmentService.upload(ticket._id, file).subscribe({
              next: () => --pending === 0 && this.finishSubmit(ticket.code),
              error: () => --pending === 0 && this.finishSubmit(ticket.code),
            });
          }
        },
        error: (err: HttpErrorResponse) => {
          this.submitError.set(
            (err.error as { message?: string | string[] })?.message?.toString() ??
              'No se pudo crear el ticket.',
          );
          this.submitting.set(false);
        },
      });
  }

  private finishSubmit(code: string): void {
    this.createdCode.set(code);
    this.description = '';
    this.selectedFiles.set([]);
    this.submitting.set(false);
    this.composerOpen.set(false);
    this.load();
  }
}

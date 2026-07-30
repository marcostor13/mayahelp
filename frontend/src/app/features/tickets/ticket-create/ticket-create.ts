import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TicketService } from '../../../core/services/ticket.service';
import { CategoryService } from '../../../core/services/category.service';
import { AttachmentService } from '../../../core/services/attachment.service';
import { AiService } from '../../../core/services/ai.service';
import { Category } from '../../../core/models/category.model';
import { TicketPriority } from '../../../core/models/ticket.model';
import { MediaCapture } from '../../../shared/media-capture/media-capture';

@Component({
  selector: 'app-ticket-create',
  imports: [FormsModule, MediaCapture],
  templateUrl: './ticket-create.html',
})
export class TicketCreate implements OnInit {
  protected readonly categories = signal<Category[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly generating = signal(false);
  protected readonly aiError = signal<string | null>(null);

  protected subject = '';
  protected description = '';
  protected category = '';
  protected priority: TicketPriority = 'media';
  protected aiFreeText = '';

  constructor(
    private readonly ticketService: TicketService,
    private readonly categoryService: CategoryService,
    private readonly attachmentService: AttachmentService,
    private readonly aiService: AiService,
    private readonly router: Router,
  ) {}

  generateWithAi(): void {
    const freeText = this.aiFreeText.trim();
    if (!freeText) return;

    this.generating.set(true);
    this.aiError.set(null);
    this.aiService.draftTicket(freeText).subscribe({
      next: (draft) => {
        this.subject = draft.subject;
        this.description = draft.description;
        this.priority = draft.priority;
        if (draft.categoryId) {
          this.category = draft.categoryId;
        }
        this.generating.set(false);
      },
      error: () => {
        this.aiError.set('No se pudo generar el borrador con IA. Completa el formulario manualmente.');
        this.generating.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
  }

  onFilesAdded(files: File[]): void {
    this.selectedFiles.update((current) => [...current, ...files]);
  }

  removeFile(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
  }

  submit(): void {
    this.error.set(null);
    if (!this.subject || !this.description || !this.category) {
      this.error.set('Completa todos los campos requeridos.');
      return;
    }
    this.submitting.set(true);
    this.ticketService
      .create({
        subject: this.subject,
        description: this.description,
        category: this.category,
        priority: this.priority,
      })
      .subscribe({
        next: (ticket) => this.uploadAttachmentsThenNavigate(ticket._id),
        error: () => {
          this.error.set('No se pudo crear el ticket. Intenta de nuevo.');
          this.submitting.set(false);
        },
      });
  }

  private uploadAttachmentsThenNavigate(ticketId: string): void {
    const files = this.selectedFiles();
    if (files.length === 0) {
      this.router.navigate(['/tickets', ticketId]);
      return;
    }
    const uploads = files.map((file) =>
      this.attachmentService.upload(ticketId, file).pipe(catchError(() => of(null))),
    );
    forkJoin(uploads).subscribe(() => this.router.navigate(['/tickets', ticketId]));
  }
}

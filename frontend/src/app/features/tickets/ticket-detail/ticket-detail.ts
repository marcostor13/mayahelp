import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TicketService } from '../../../core/services/ticket.service';
import { AuthService } from '../../../core/services/auth.service';
import { AttachmentService } from '../../../core/services/attachment.service';
import { ExportService } from '../../../core/services/export.service';
import { MediaCapture } from '../../../shared/media-capture/media-capture';
import {
  Ticket,
  TicketComment,
  TicketPriority,
  TicketStatus,
} from '../../../core/models/ticket.model';
import { Attachment } from '../../../core/models/attachment.model';

const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: 'Abierto',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

const STATUS_BADGES: Record<TicketStatus, string> = {
  abierto: 'bg-primary-fixed text-on-primary-fixed',
  en_proceso: 'bg-amber-100 text-amber-800',
  resuelto: 'bg-emerald-100 text-emerald-800',
  cerrado: 'bg-surface-container-high text-on-surface-variant',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

const PRIORITY_BADGES: Record<TicketPriority, string> = {
  baja: 'bg-surface-container-high text-on-surface-variant',
  media: 'bg-amber-100 text-amber-800',
  alta: 'bg-error-container text-on-error-container',
};

@Component({
  selector: 'app-ticket-detail',
  imports: [FormsModule, RouterLink, DatePipe, MediaCapture],
  templateUrl: './ticket-detail.html',
})
export class TicketDetail implements OnInit {
  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly sending = signal(false);
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly linkCopied = signal(false);
  /** Index into `imageAttachments` of the picture open in the viewer, or null when closed. */
  protected readonly viewerIndex = signal<number | null>(null);
  protected newComment = '';

  protected readonly statuses: TicketStatus[] = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
  protected readonly priorities: TicketPriority[] = ['baja', 'media', 'alta'];
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  protected readonly imageAttachments = computed(() =>
    this.attachments().filter((file) => file.kind === 'image'),
  );

  protected readonly viewerImage = computed(() => {
    const index = this.viewerIndex();
    if (index === null) return null;
    return this.imageAttachments()[index] ?? null;
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ticketService: TicketService,
    private readonly attachmentService: AttachmentService,
    private readonly exportService: ExportService,
    protected readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.load(id);
    this.loadAttachments(id);
  }

  private load(id: string): void {
    this.loading.set(true);
    this.ticketService.getById(id).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadAttachments(id: string): void {
    this.attachmentService
      .listForTicket(id)
      .subscribe((attachments) => this.attachments.set(attachments));
  }

  // --- header actions -----------------------------------------------------

  exportMarkdown(): void {
    const current = this.ticket();
    if (!current) return;
    this.exportService.exportTicket(current._id, current.code);
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      this.linkCopied.set(false);
    }
  }

  removeTicket(): void {
    const current = this.ticket();
    if (!current) return;
    if (!confirm(`¿Eliminar el ticket ${current.code}? Esta acción no se puede deshacer.`)) return;
    this.ticketService.remove(current._id).subscribe(() => this.router.navigate(['/tickets']));
  }

  // --- edits --------------------------------------------------------------

  updateStatus(status: string): void {
    const current = this.ticket();
    if (!current) return;
    this.ticketService
      .updateStatus(current._id, status)
      .subscribe((updated) => this.ticket.set(updated));
  }

  updatePriority(priority: string): void {
    const current = this.ticket();
    if (!current) return;
    this.ticketService
      .updatePriority(current._id, priority)
      .subscribe((updated) => this.ticket.set(updated));
  }

  addComment(): void {
    const current = this.ticket();
    const message = this.newComment.trim();
    if (!current || !message) return;
    this.sending.set(true);
    this.ticketService.addComment(current._id, message).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.newComment = '';
        this.sending.set(false);
      },
      error: () => this.sending.set(false),
    });
  }

  useAiSuggestion(comment: TicketComment): void {
    this.newComment = comment.message;
  }

  // --- attachments --------------------------------------------------------

  onFilesAdded(files: File[]): void {
    const current = this.ticket();
    if (!current || files.length === 0) return;

    this.uploadError.set(null);
    this.uploading.set(true);
    let pending = files.length;
    for (const file of files) {
      this.attachmentService.upload(current._id, file).subscribe({
        next: (attachment) => {
          this.attachments.update((list) => [...list, attachment]);
          if (--pending === 0) this.uploading.set(false);
        },
        error: () => {
          this.uploadError.set(`No se pudo subir "${file.name}".`);
          if (--pending === 0) this.uploading.set(false);
        },
      });
    }
  }

  removeAttachment(attachment: Attachment, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!confirm(`¿Eliminar el adjunto "${attachment.filename}"?`)) return;
    this.attachmentService.remove(attachment._id).subscribe(() => {
      this.attachments.update((list) => list.filter((a) => a._id !== attachment._id));
      if (this.imageAttachments().length === 0) this.closeViewer();
    });
  }

  // --- image viewer -------------------------------------------------------

  openViewer(attachment: Attachment): void {
    const index = this.imageAttachments().findIndex((file) => file._id === attachment._id);
    if (index >= 0) this.viewerIndex.set(index);
  }

  closeViewer(): void {
    this.viewerIndex.set(null);
  }

  /** Wraps around, so the arrows keep working at either end of the gallery. */
  stepViewer(delta: number, event?: Event): void {
    event?.stopPropagation();
    const images = this.imageAttachments();
    const current = this.viewerIndex();
    if (current === null || images.length === 0) return;
    this.viewerIndex.set((current + delta + images.length) % images.length);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.viewerIndex() === null) return;
    if (event.key === 'Escape') this.closeViewer();
    if (event.key === 'ArrowRight') this.stepViewer(1);
    if (event.key === 'ArrowLeft') this.stepViewer(-1);
  }

  // --- presentation helpers ----------------------------------------------

  statusBadge(status: TicketStatus): string {
    return STATUS_BADGES[status];
  }

  priorityBadge(priority: TicketPriority): string {
    return PRIORITY_BADGES[priority];
  }

  initials(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  iconForKind(kind: Attachment['kind']): string {
    switch (kind) {
      case 'image':
        return 'image';
      case 'video':
        return 'movie';
      case 'audio':
        return 'audiotrack';
      default:
        return 'description';
    }
  }

  get canManage(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
  }

  get canDelete(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }
}

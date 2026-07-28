import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TicketService } from '../../../core/services/ticket.service';
import { AuthService } from '../../../core/services/auth.service';
import { AttachmentService } from '../../../core/services/attachment.service';
import { ExportService } from '../../../core/services/export.service';
import { Ticket, TicketComment, TicketPriority, TicketStatus } from '../../../core/models/ticket.model';
import { Attachment } from '../../../core/models/attachment.model';

@Component({
  selector: 'app-ticket-detail',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './ticket-detail.html',
})
export class TicketDetail implements OnInit {
  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly uploading = signal(false);
  protected newComment = '';

  protected readonly statuses: TicketStatus[] = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
  protected readonly priorities: TicketPriority[] = ['baja', 'media', 'alta'];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ticketService: TicketService,
    private readonly attachmentService: AttachmentService,
    private readonly exportService: ExportService,
    protected readonly auth: AuthService,
  ) {}

  exportMarkdown(): void {
    const current = this.ticket();
    if (!current) return;
    this.exportService.exportTicket(current._id, current.code);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.load(id);
    this.loadAttachments(id);
  }

  private load(id: string): void {
    this.loading.set(true);
    this.ticketService.getById(id).subscribe((ticket) => {
      this.ticket.set(ticket);
      this.loading.set(false);
    });
  }

  private loadAttachments(id: string): void {
    this.attachmentService.listForTicket(id).subscribe((attachments) => this.attachments.set(attachments));
  }

  updateStatus(status: string): void {
    const current = this.ticket();
    if (!current) return;
    this.ticketService.updateStatus(current._id, status).subscribe((updated) => this.ticket.set(updated));
  }

  updatePriority(priority: string): void {
    const current = this.ticket();
    if (!current) return;
    this.ticketService.updatePriority(current._id, priority).subscribe((updated) => this.ticket.set(updated));
  }

  addComment(): void {
    const current = this.ticket();
    const message = this.newComment.trim();
    if (!current || !message) return;
    this.sending.set(true);
    this.ticketService.addComment(current._id, message).subscribe((updated) => {
      this.ticket.set(updated);
      this.newComment = '';
      this.sending.set(false);
    });
  }

  useAiSuggestion(comment: TicketComment): void {
    this.newComment = comment.message;
  }

  onFileSelected(event: Event): void {
    const current = this.ticket();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!current || !file) return;

    this.uploading.set(true);
    this.attachmentService.upload(current._id, file).subscribe({
      next: (attachment) => {
        this.attachments.update((list) => [...list, attachment]);
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
    input.value = '';
  }

  removeAttachment(attachment: Attachment): void {
    this.attachmentService.remove(attachment._id).subscribe(() => {
      this.attachments.update((list) => list.filter((a) => a._id !== attachment._id));
    });
  }

  get canManage(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
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
}

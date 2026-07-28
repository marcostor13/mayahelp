import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TicketService } from '../../../core/services/ticket.service';
import { AuthService } from '../../../core/services/auth.service';
import { Ticket, TicketPriority, TicketStatus } from '../../../core/models/ticket.model';

@Component({
  selector: 'app-ticket-detail',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './ticket-detail.html',
})
export class TicketDetail implements OnInit {
  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected newComment = '';

  protected readonly statuses: TicketStatus[] = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
  protected readonly priorities: TicketPriority[] = ['baja', 'media', 'alta'];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ticketService: TicketService,
    protected readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.load(id);
  }

  private load(id: string): void {
    this.loading.set(true);
    this.ticketService.getById(id).subscribe((ticket) => {
      this.ticket.set(ticket);
      this.loading.set(false);
    });
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

  get canManage(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
  }
}

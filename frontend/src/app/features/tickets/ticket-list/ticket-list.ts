import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TicketService } from '../../../core/services/ticket.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExportService } from '../../../core/services/export.service';
import { Ticket, TicketPriority, TicketStatus } from '../../../core/models/ticket.model';
import { Category } from '../../../core/models/category.model';

const STATUS_OPTIONS: { value: TicketStatus; label: string; dot: string }[] = [
  { value: 'abierto', label: 'Abierto', dot: 'bg-primary' },
  { value: 'en_proceso', label: 'En Proceso', dot: 'bg-amber-500' },
  { value: 'resuelto', label: 'Resuelto', dot: 'bg-emerald-500' },
  { value: 'cerrado', label: 'Cerrado', dot: 'bg-gray-400' },
];

@Component({
  selector: 'app-ticket-list',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './ticket-list.html',
})
export class TicketList implements OnInit {
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly tickets = signal<Ticket[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);

  protected statusFilter: TicketStatus | '' = '';
  protected priorityFilter: TicketPriority | '' = '';
  protected categoryFilter = '';
  protected search = '';
  protected readonly selectedIds = signal<Set<string>>(new Set());

  constructor(
    private readonly ticketService: TicketService,
    private readonly categoryService: CategoryService,
    private readonly exportService: ExportService,
    protected readonly auth: AuthService,
  ) {}

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelected(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  exportSelected(): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    this.exportService.exportTicketsBulk(ids);
  }

  get canBulkImport(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
  }

  ngOnInit(): void {
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.ticketService
      .list({
        status: this.statusFilter || undefined,
        priority: this.priorityFilter || undefined,
        category: this.categoryFilter || undefined,
        search: this.search || undefined,
      })
      .subscribe((tickets) => {
        this.tickets.set(tickets);
        this.loading.set(false);
      });
  }

  setStatus(status: TicketStatus | ''): void {
    this.statusFilter = this.statusFilter === status ? '' : status;
    this.load();
  }
}

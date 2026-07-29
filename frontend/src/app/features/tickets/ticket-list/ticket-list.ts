import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  protected readonly page = signal(1);
  protected readonly totalPages = signal(0);
  protected readonly total = signal(0);

  protected statusFilter: TicketStatus | '' = '';
  protected priorityFilter: TicketPriority | '' = '';
  protected categoryFilter = '';
  protected search = '';
  /** Set from ?client=<id> (the command palette links here); not exposed as a control. */
  protected clientFilter = '';
  protected readonly selectedIds = signal<Set<string>>(new Set());

  constructor(
    private readonly route: ActivatedRoute,
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
    // Query params are read on every emission, not just once: navigating from the
    // command palette to /tickets?client=X while already on /tickets reuses this
    // component, so a snapshot read would silently ignore the new filter.
    this.route.queryParamMap.subscribe((params) => {
      this.clientFilter = params.get('client') ?? '';
      this.search = params.get('search') ?? '';
      this.load();
    });
  }

  /** Any filter change restarts at page 1 — staying on page 7 of a new result set is never right. */
  load(): void {
    this.page.set(1);
    this.fetch();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.ticketService
      .list({
        status: this.statusFilter || undefined,
        priority: this.priorityFilter || undefined,
        category: this.categoryFilter || undefined,
        client: this.clientFilter || undefined,
        search: this.search || undefined,
        page: this.page(),
      })
      .subscribe((result) => {
        this.tickets.set(result.items);
        this.total.set(result.total);
        this.totalPages.set(result.totalPages);
        this.loading.set(false);
      });
  }

  setStatus(status: TicketStatus | ''): void {
    this.statusFilter = this.statusFilter === status ? '' : status;
    this.load();
  }
}

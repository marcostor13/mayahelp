import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TicketService } from '../../../core/services/ticket.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExportService } from '../../../core/services/export.service';
import {
  SortOrder,
  Ticket,
  TicketFilter,
  TicketPriority,
  TicketSortField,
  TicketStatus,
} from '../../../core/models/ticket.model';
import { Category } from '../../../core/models/category.model';
import { Project } from '../../../core/models/project.model';

interface StatusMeta {
  value: TicketStatus;
  label: string;
  dot: string;
  badge: string;
  icon: string;
}

interface PriorityMeta {
  value: TicketPriority;
  label: string;
  badge: string;
  icon: string;
}

interface SortableColumn {
  field: TicketSortField;
  label: string;
}

const STATUS_META: StatusMeta[] = [
  {
    value: 'abierto',
    label: 'Abierto',
    dot: 'bg-primary',
    badge: 'bg-primary-fixed text-on-primary-fixed',
    icon: 'radio_button_checked',
  },
  {
    value: 'en_proceso',
    label: 'En proceso',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800',
    icon: 'progress_activity',
  },
  {
    value: 'resuelto',
    label: 'Resuelto',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    icon: 'check_circle',
  },
  {
    value: 'cerrado',
    label: 'Cerrado',
    dot: 'bg-gray-400',
    badge: 'bg-surface-container-high text-on-surface-variant',
    icon: 'lock',
  },
];

const PRIORITY_META: PriorityMeta[] = [
  {
    value: 'alta',
    label: 'Alta',
    badge: 'bg-error-container text-on-error-container',
    icon: 'keyboard_double_arrow_up',
  },
  { value: 'media', label: 'Media', badge: 'bg-amber-100 text-amber-800', icon: 'remove' },
  {
    value: 'baja',
    label: 'Baja',
    badge: 'bg-surface-container-high text-on-surface-variant',
    icon: 'keyboard_double_arrow_down',
  },
];

const SORTABLE_COLUMNS: SortableColumn[] = [
  { field: 'code', label: 'ID' },
  { field: 'subject', label: 'Asunto' },
  { field: 'priority', label: 'Prioridad' },
  { field: 'status', label: 'Estado' },
  { field: 'createdAt', label: 'Creado' },
  { field: 'updatedAt', label: 'Actualizado' },
];

@Component({
  selector: 'app-ticket-list',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './ticket-list.html',
})
export class TicketList implements OnInit {
  protected readonly statusMeta = STATUS_META;
  protected readonly priorityMeta = PRIORITY_META;
  protected readonly sortableColumns = SORTABLE_COLUMNS;

  protected readonly tickets = signal<Ticket[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly projects = signal<Project[]>([]);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly filtersOpen = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());

  protected statusFilter: TicketStatus | '' = '';
  protected priorityFilter: TicketPriority | '' = '';
  protected categoryFilter = '';
  protected projectFilter = '';
  /** Set from ?client= (the admin's "see this person's tickets" link). */
  protected clientFilter = '';
  protected search = '';
  protected sortField: TicketSortField = 'createdAt';
  protected sortOrder: SortOrder = 'desc';

  constructor(
    private readonly ticketService: TicketService,
    private readonly categoryService: CategoryService,
    private readonly projectService: ProjectService,
    private readonly exportService: ExportService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    protected readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
    if (this.canManage) {
      this.projectService.list().subscribe((projects) => this.projects.set(projects));
    }
    // Deep links (and the topbar search) arrive as query params; this also fires on the
    // first navigation, so it doubles as the initial load.
    this.route.queryParamMap.subscribe((params) => {
      this.search = params.get('search') ?? '';
      const status = params.get('status');
      const priority = params.get('priority');
      this.statusFilter = isStatus(status) ? status : '';
      this.priorityFilter = isPriority(priority) ? priority : '';
      this.categoryFilter = params.get('category') ?? '';
      this.projectFilter = params.get('project') ?? '';
      this.clientFilter = params.get('client') ?? '';
      if (this.appliedFilterCount > 0) this.filtersOpen.set(true);
      this.load();
    });
  }

  // --- data ---------------------------------------------------------------

  get currentFilter(): TicketFilter {
    return {
      status: this.statusFilter || undefined,
      priority: this.priorityFilter || undefined,
      category: this.categoryFilter || undefined,
      project: this.projectFilter || undefined,
      client: this.clientFilter || undefined,
      search: this.search.trim() || undefined,
      sort: this.sortField,
      order: this.sortOrder,
    };
  }

  load(): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.ticketService.list(this.currentFilter).subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  get appliedFilterCount(): number {
    return [
      this.statusFilter,
      this.priorityFilter,
      this.categoryFilter,
      this.projectFilter,
      this.clientFilter,
      this.search.trim(),
    ].filter(Boolean).length;
  }

  toggleStatus(status: TicketStatus): void {
    this.statusFilter = this.statusFilter === status ? '' : status;
    this.load();
  }

  togglePriority(priority: TicketPriority): void {
    this.priorityFilter = this.priorityFilter === priority ? '' : priority;
    this.load();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.priorityFilter = '';
    this.categoryFilter = '';
    this.projectFilter = '';
    this.clientFilter = '';
    this.search = '';
    // Drop the query params too, otherwise a deep link would re-apply them.
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    this.load();
  }

  /** Clicking the same column flips the direction; a new column starts descending. */
  sortBy(field: TicketSortField): void {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortOrder = field === 'code' || field === 'subject' ? 'asc' : 'desc';
    }
    this.load();
  }

  sortIcon(field: TicketSortField): string {
    if (this.sortField !== field) return 'unfold_more';
    return this.sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // --- selection ----------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelected(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  get allSelected(): boolean {
    const tickets = this.tickets();
    return tickets.length > 0 && this.selectedIds().size === tickets.length;
  }

  toggleSelectAll(): void {
    this.selectedIds.set(
      this.allSelected ? new Set() : new Set(this.tickets().map((ticket) => ticket._id)),
    );
  }

  // --- exports ------------------------------------------------------------

  /** Selected tickets, or everything matching the current filter when nothing is selected. */
  exportMarkdown(): void {
    const ids = [...this.selectedIds()];
    this.exporting.set(true);
    this.exportService
      .exportCombinedMarkdown(ids.length ? { ids } : { filter: this.currentFilter })
      .subscribe({
        next: (blob) => {
          downloadBlob(blob, 'tickets-mayahelp.md');
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  exportZip(): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    this.exportService.exportTicketsBulk(ids);
  }

  exportSingle(ticket: Ticket, event: Event): void {
    event.stopPropagation();
    this.exportService.exportTicket(ticket._id, ticket.code);
  }

  // --- row actions --------------------------------------------------------

  open(ticket: Ticket): void {
    this.router.navigate(['/tickets', ticket._id]);
  }

  remove(ticket: Ticket, event: Event): void {
    event.stopPropagation();
    if (!confirm(`¿Eliminar el ticket ${ticket.code}? Esta acción no se puede deshacer.`)) return;
    this.ticketService.remove(ticket._id).subscribe(() => {
      this.tickets.update((list) => list.filter((item) => item._id !== ticket._id));
    });
  }

  // --- presentation helpers ----------------------------------------------

  statusFor(status: TicketStatus): StatusMeta {
    return STATUS_META.find((meta) => meta.value === status) ?? STATUS_META[0];
  }

  priorityFor(priority: TicketPriority): PriorityMeta {
    return PRIORITY_META.find((meta) => meta.value === priority) ?? PRIORITY_META[1];
  }

  get canManage(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
  }

  get canDelete(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get canBulkImport(): boolean {
    return this.canManage;
  }
}

function isStatus(value: string | null): value is TicketStatus {
  return (
    value === 'abierto' || value === 'en_proceso' || value === 'resuelto' || value === 'cerrado'
  );
}

function isPriority(value: string | null): value is TicketPriority {
  return value === 'baja' || value === 'media' || value === 'alta';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SearchService } from '../../core/services/search.service';
import { AuthService } from '../../core/services/auth.service';
import {
  EMPTY_SEARCH_RESULTS,
  PaletteItem,
  SearchResults,
} from '../../core/models/search.model';

/** Matches the backend's minimum: a single letter matches most of the database. */
const MIN_TERM_LENGTH = 2;

interface QuickAction extends PaletteItem {
  staffOnly: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'action-new-ticket',
    group: 'Acciones',
    icon: 'add_circle',
    label: 'Nuevo ticket',
    route: '/tickets/new',
    staffOnly: false,
  },
  {
    id: 'action-tickets',
    group: 'Acciones',
    icon: 'confirmation_number',
    label: 'Ver todos los tickets',
    route: '/tickets',
    staffOnly: false,
  },
  {
    id: 'action-bulk-import',
    group: 'Acciones',
    icon: 'upload_file',
    label: 'Importar tickets',
    route: '/tickets/bulk-import',
    staffOnly: true,
  },
  {
    id: 'action-projects',
    group: 'Acciones',
    icon: 'folder',
    label: 'Proyectos',
    route: '/projects',
    staffOnly: true,
  },
  {
    id: 'action-help-center',
    group: 'Acciones',
    icon: 'help',
    label: 'Centro de ayuda',
    route: '/help-center',
    staffOnly: false,
  },
  {
    id: 'action-settings',
    group: 'Acciones',
    icon: 'settings',
    label: 'Ajustes',
    route: '/settings',
    staffOnly: false,
  },
];

@Component({
  selector: 'app-command-palette',
  imports: [FormsModule],
  templateUrl: './command-palette.html',
})
export class CommandPalette {
  private readonly input =
    viewChild<ElementRef<HTMLInputElement>>('paletteInput');
  private readonly typed = new Subject<string>();

  protected readonly term = signal('');
  protected readonly results = signal<SearchResults>(EMPTY_SEARCH_RESULTS);
  protected readonly loading = signal(false);
  protected readonly highlighted = signal(0);

  protected readonly items = computed<PaletteItem[]>(() => {
    const term = this.term().trim().toLowerCase();
    const isStaff = this.isStaff();
    const results = this.results();

    const actions = QUICK_ACTIONS.filter(
      (action) =>
        (!action.staffOnly || isStaff) &&
        (term === '' || action.label.toLowerCase().includes(term)),
    ).map(({ staffOnly: _staffOnly, ...item }) => item);

    return [
      ...actions,
      ...results.tickets.map((ticket) => ({
        id: `ticket-${ticket._id}`,
        group: 'Tickets',
        icon: 'confirmation_number',
        label: ticket.subject,
        sublabel: `${ticket.code} · ${ticket.status}`,
        route: `/tickets/${ticket._id}`,
      })),
      ...results.clients.map((client) => ({
        id: `client-${client._id}`,
        group: 'Clientes',
        icon: 'person',
        label: client.name,
        sublabel: client.company
          ? `${client.email} · ${client.company}`
          : client.email,
        // No client detail page yet, so land on their tickets. Filtering by id,
        // not by email: the ticket search indexes subject/description, not the
        // client's contact details, so an email query would find nothing.
        route: `/tickets?client=${client._id}`,
      })),
      ...results.projects.map((project) => ({
        id: `project-${project._id}`,
        group: 'Proyectos',
        icon: 'folder',
        label: project.name,
        sublabel: project.status,
        route: `/projects/${project._id}`,
      })),
      ...results.articles.map((article) => ({
        id: `article-${article._id}`,
        group: 'Centro de ayuda',
        icon: 'article',
        label: article.title,
        route: `/help-center/${article._id}`,
      })),
    ];
  });

  /** Adds the group header flag so the template can render sections from a flat list. */
  protected readonly rows = computed(() => {
    const items = this.items();
    return items.map((item, index) => ({
      ...item,
      index,
      startsGroup: index === 0 || items[index - 1].group !== item.group,
    }));
  });

  constructor(
    protected readonly search: SearchService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.typed
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          if (term.trim().length < MIN_TERM_LENGTH) {
            return of(EMPTY_SEARCH_RESULTS);
          }
          return this.search.search(term).pipe(
            // A failed lookup must not kill the stream, or the palette goes
            // permanently dead after one blip.
            catchError(() => of(EMPTY_SEARCH_RESULTS)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((results) => {
        this.results.set(results);
        this.highlighted.set(0);
        this.loading.set(false);
      });

    effect(() => {
      if (this.search.isOpen()) {
        // The input only exists once the overlay renders.
        setTimeout(() => this.input()?.nativeElement.focus());
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.search.toggle();
      return;
    }
    if (!this.search.isOpen()) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        const target = this.items()[this.highlighted()];
        if (target) {
          event.preventDefault();
          this.go(target);
        }
        break;
      }
    }
  }

  protected onTermChange(value: string): void {
    this.term.set(value);
    this.loading.set(value.trim().length >= MIN_TERM_LENGTH);
    this.typed.next(value);
  }

  protected go(item: PaletteItem): void {
    void this.router.navigateByUrl(item.route);
    this.close();
  }

  protected close(): void {
    this.search.close();
    this.term.set('');
    this.results.set(EMPTY_SEARCH_RESULTS);
    this.highlighted.set(0);
    this.loading.set(false);
  }

  private move(delta: number): void {
    const count = this.items().length;
    if (count === 0) return;
    // Wraps, so ArrowUp from the top lands on the last row.
    this.highlighted.update((current) => (current + delta + count) % count);
  }

  private isStaff(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
  }
}

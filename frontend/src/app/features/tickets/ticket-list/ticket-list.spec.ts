import { of, throwError } from 'rxjs';
import { WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TicketList } from './ticket-list';
import { TicketService } from '../../../core/services/ticket.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProjectService } from '../../../core/services/project.service';
import { ExportService } from '../../../core/services/export.service';
import { ImplementationService } from '../../../core/services/implementation.service';
import { AuthService } from '../../../core/services/auth.service';
import { Ticket, TicketStatus } from '../../../core/models/ticket.model';

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    _id: 't1',
    code: 'TCK-8001',
    subject: 'No carga el dashboard',
    description: 'Queda cargando.',
    client: { _id: 'c1', name: 'Ana', email: 'ana@x.com' },
    category: { _id: 'cat1', name: 'Bug' } as Ticket['category'],
    project: null,
    assignedAgent: null,
    status: 'abierto',
    priority: 'alta',
    comments: [],
    satisfaction: null,
    resolvedAt: null,
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

/** Lo que el test necesita tocar del componente: signals y handlers protegidos. */
type Page = TicketList & {
  tickets: WritableSignal<Ticket[]>;
  selectedIds: WritableSignal<Set<string>>;
  statusMenuFor: WritableSignal<string | null>;
  statusError: WritableSignal<string | null>;
  statusFilter: TicketStatus | '';
  changeStatus(ticket: Ticket, status: TicketStatus): void;
  changeStatusForSelected(status: TicketStatus): void;
};

interface Harness {
  page: Page;
  calls: { ids: string[]; status: string }[];
}

function harness(options: { tickets: Ticket[]; fails?: boolean }): Harness {
  const calls: { ids: string[]; status: string }[] = [];
  const ticketService = {
    updateStatusMany: (ids: string[], status: string) => {
      calls.push({ ids, status });
      if (options.fails) {
        return throwError(() => new HttpErrorResponse({ error: { message: 'Sin permiso' } }));
      }
      return of(
        options.tickets
          .filter((item) => ids.includes(item._id))
          .map((item) => ({ ...item, status, updatedAt: '2026-07-05T12:00:00.000Z' })),
      );
    },
  } as unknown as TicketService;

  const page = new TicketList(
    ticketService,
    {} as CategoryService,
    {} as ProjectService,
    {} as ExportService,
    {} as ImplementationService,
    {} as ActivatedRoute,
    {} as Router,
    { currentUser: () => ({ role: 'agent' }) } as unknown as AuthService,
  ) as unknown as Page;
  page.tickets.set(options.tickets);

  return { page, calls };
}

describe('TicketList — cambio de estado', () => {
  it('changes one ticket from the table and refreshes the row in place', () => {
    const { page, calls } = harness({ tickets: [ticket(), ticket({ _id: 't2' })] });

    page.changeStatus(page.tickets()[0], 'resuelto');

    expect(calls).toEqual([{ ids: ['t1'], status: 'resuelto' }]);
    expect(page.tickets()[0].status).toBe('resuelto');
    expect(page.tickets()[0].updatedAt).toBe('2026-07-05T12:00:00.000Z');
    // El resto de la tabla queda igual: no se recarga.
    expect(page.tickets()[1].status).toBe('abierto');
    expect(page.statusMenuFor()).toBeNull();
  });

  it('does not call the API when the ticket is already in that status', () => {
    const { page, calls } = harness({ tickets: [ticket({ status: 'cerrado' })] });

    page.changeStatus(page.tickets()[0], 'cerrado');

    expect(calls).toEqual([]);
  });

  it('changes the selected tickets, skipping the ones already in that status', () => {
    const { page, calls } = harness({
      tickets: [
        ticket({ _id: 't1' }),
        ticket({ _id: 't2', status: 'resuelto' }),
        ticket({ _id: 't3' }),
      ],
    });
    page.selectedIds.set(new Set(['t1', 't2']));

    page.changeStatusForSelected('resuelto');

    expect(calls).toEqual([{ ids: ['t1'], status: 'resuelto' }]);
    expect(page.tickets().map((item) => item.status)).toEqual(['resuelto', 'resuelto', 'abierto']);
  });

  it('drops the rows that stopped matching the active status filter', () => {
    const { page } = harness({ tickets: [ticket({ _id: 't1' }), ticket({ _id: 't2' })] });
    page.statusFilter = 'abierto';
    page.selectedIds.set(new Set(['t1']));

    page.changeStatus(page.tickets()[0], 'cerrado');

    expect(page.tickets().map((item) => item._id)).toEqual(['t2']);
    // Y sale de la selección, para que el contador de la barra no mienta.
    expect(page.selectedIds().has('t1')).toBe(false);
  });

  it('surfaces the API error instead of leaving the row looking changed', () => {
    const { page } = harness({ tickets: [ticket()], fails: true });

    page.changeStatus(page.tickets()[0], 'resuelto');

    expect(page.tickets()[0].status).toBe('abierto');
    expect(page.statusError()).toBe('Sin permiso');
  });
});

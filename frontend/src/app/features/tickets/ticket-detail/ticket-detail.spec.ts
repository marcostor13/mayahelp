import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TicketDetail } from './ticket-detail';
import { TicketService } from '../../../core/services/ticket.service';
import { AuthService } from '../../../core/services/auth.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProjectService } from '../../../core/services/project.service';
import { AttachmentService } from '../../../core/services/attachment.service';
import { ExportService } from '../../../core/services/export.service';
import { Ticket, TicketStatus } from '../../../core/models/ticket.model';
import { Role, User } from '../../../core/models/user.model';

const OWNER_ID = 'client-1';

/** El componente expone todo como `protected`; los tests lo miran desde afuera. */
type Page = TicketDetail & {
  ticket: { set(value: Ticket | null): void };
  editSubject: string;
  editDescription: string;
  editCategory: string;
  canEdit: boolean;
  canSaveEdit: boolean;
};

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    _id: 't1',
    code: 'TCK-8001',
    subject: 'Asunto original',
    description: 'Descripción original del problema',
    client: { _id: OWNER_ID, name: 'Ana', email: 'ana@acme.com' },
    category: { _id: 'cat-1', name: 'Soporte', icon: 'build', type: 'ticket' },
    project: null,
    assignedAgent: null,
    status: 'abierto',
    priority: 'media',
    comments: [],
    satisfaction: null,
    resolvedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Ticket;
}

function page(params: { role: Role; userId?: string; ticket?: Ticket | null }): Page {
  const user = signal<User | null>({
    id: params.userId ?? OWNER_ID,
    name: 'Quien mira',
    email: 'quien@acme.com',
    role: params.role,
  });
  const auth = { currentUser: user } as unknown as AuthService;

  const component = new TicketDetail(
    { snapshot: { paramMap: { get: () => 't1' } } } as unknown as ActivatedRoute,
    {} as unknown as Router,
    {} as unknown as TicketService,
    {} as unknown as CategoryService,
    // La lista de proyectos solo se pide si la persona es del equipo.
    { list: () => of([]) } as unknown as ProjectService,
    {} as unknown as AttachmentService,
    {} as unknown as ExportService,
    auth,
  ) as unknown as Page;

  component.ticket.set(params.ticket === undefined ? ticket() : params.ticket);
  return component;
}

describe('TicketDetail.canEdit', () => {
  it('deja al dueño editar su ticket abierto', () => {
    expect(page({ role: 'client' }).canEdit).toBe(true);
  });

  it.each<TicketStatus>(['en_proceso', 'resuelto', 'cerrado'])(
    'se lo niega cuando el ticket está %s',
    (status) => {
      expect(page({ role: 'client', ticket: ticket({ status }) }).canEdit).toBe(false);
    },
  );

  it('se lo niega sobre el ticket de otra persona', () => {
    expect(page({ role: 'client', userId: 'otro' }).canEdit).toBe(false);
  });

  /** El equipo edita siempre, sin importar el estado ni de quién sea. */
  it.each<Role>(['admin', 'agent'])('deja editar a un %s aunque esté cerrado', (role) => {
    const closed = ticket({ status: 'cerrado' });
    expect(page({ role, userId: 'staff-1', ticket: closed }).canEdit).toBe(true);
  });

  it('no ofrece editar mientras el ticket no cargó', () => {
    expect(page({ role: 'client', ticket: null }).canEdit).toBe(false);
  });
});

describe('TicketDetail.canSaveEdit', () => {
  /** Los mismos mínimos que valida la API: asunto 5, descripción 10. */
  it('exige asunto, descripción y categoría con el largo mínimo', () => {
    const component = page({ role: 'client' });

    component.editSubject = 'Hola';
    component.editDescription = 'Una descripción larga';
    component.editCategory = 'cat-1';
    expect(component.canSaveEdit).toBe(false);

    component.editSubject = 'Asunto válido';
    component.editDescription = 'corta';
    expect(component.canSaveEdit).toBe(false);

    component.editDescription = 'Una descripción larga';
    component.editCategory = '';
    expect(component.canSaveEdit).toBe(false);

    component.editCategory = 'cat-1';
    expect(component.canSaveEdit).toBe(true);
  });

  it('no toma como válido un asunto de solo espacios', () => {
    const component = page({ role: 'client' });
    component.editSubject = '        ';
    component.editDescription = 'Una descripción larga';
    component.editCategory = 'cat-1';

    expect(component.canSaveEdit).toBe(false);
  });
});

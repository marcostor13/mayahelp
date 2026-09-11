import { vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TicketList } from './ticket-list';
import { TicketService } from '../../../core/services/ticket.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExportService } from '../../../core/services/export.service';
import { ImplementationService } from '../../../core/services/implementation.service';
import { Ticket } from '../../../core/models/ticket.model';

/** El componente expone todo como `protected`; los tests lo miran desde afuera. */
type Page = TicketList & {
  tickets(): Ticket[];
  loading(): boolean;
  loadError(): string | null;
};

function page(list: ReturnType<typeof vi.fn>): Page {
  return new TicketList(
    { list } as unknown as TicketService,
    {} as unknown as CategoryService,
    {} as unknown as ProjectService,
    {} as unknown as ExportService,
    {} as unknown as ImplementationService,
    { queryParamMap: of({ get: () => null }) } as unknown as ActivatedRoute,
    {} as unknown as Router,
    { currentUser: () => ({ role: 'client' }) } as unknown as AuthService,
  ) as unknown as Page;
}

function failingWith(status: number, message?: string) {
  return vi.fn().mockReturnValue(
    throwError(
      () =>
        new HttpErrorResponse({
          status,
          error: message ? { message } : null,
        }),
    ),
  );
}

describe('TicketList.load', () => {
  it('muestra los tickets que devuelve la API', () => {
    const component = page(vi.fn().mockReturnValue(of([{ _id: 't1' } as Ticket])));

    component.load();

    expect(component.tickets()).toHaveLength(1);
    expect(component.loadError()).toBeNull();
    expect(component.loading()).toBe(false);
  });

  /**
   * Lo importante: un fallo de la API no puede verse igual que "no tenés tickets".
   * Esa confusión es la que hace que el problema real quede invisible.
   */
  it('reporta el motivo cuando la API rechaza la consulta', () => {
    const component = page(failingWith(403, 'No tienes permiso'));

    component.load();

    expect(component.tickets()).toEqual([]);
    expect(component.loadError()).toBe('No tienes permiso');
  });

  it('distingue un servidor inalcanzable', () => {
    const component = page(failingWith(0));

    component.load();

    expect(component.loadError()).toContain('No pudimos contactar al servidor');
  });

  it('cae a un mensaje con el código cuando la API no manda detalle', () => {
    const component = page(failingWith(500));

    component.load();

    expect(component.loadError()).toContain('error 500');
  });

  it('limpia el error al reintentar con éxito', () => {
    const list = failingWith(500);
    const component = page(list);
    component.load();
    expect(component.loadError()).not.toBeNull();

    list.mockReturnValue(of([]));
    component.load();

    expect(component.loadError()).toBeNull();
  });
});

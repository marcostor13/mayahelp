import { describeTicketChanges } from './ticket-changes';
import type { NotifyTicket } from '../notifications/notifications.service';

function ticket(overrides: Partial<NotifyTicket> = {}): NotifyTicket {
  return {
    _id: 't1',
    code: 'TCK-8001',
    subject: 'Asunto original',
    description: 'Descripción original',
    status: 'abierto',
    priority: 'media',
    categoryName: 'Soporte',
    ...overrides,
  };
}

describe('describeTicketChanges', () => {
  it('no reporta nada cuando el ticket quedó igual', () => {
    expect(describeTicketChanges(ticket(), ticket())).toEqual([]);
  });

  it('reporta el asunto con su valor anterior y el nuevo', () => {
    const changes = describeTicketChanges(
      ticket(),
      ticket({ subject: 'Asunto corregido' }),
    );

    expect(changes).toEqual([
      {
        field: 'subject',
        label: 'Asunto',
        from: 'Asunto original',
        to: 'Asunto corregido',
      },
    ]);
  });

  /** La categoría viaja por nombre: un id en el correo no le dice nada a nadie. */
  it('reporta la categoría por su nombre', () => {
    const changes = describeTicketChanges(
      ticket(),
      ticket({ categoryName: 'Infraestructura' }),
    );

    expect(changes[0]).toMatchObject({
      field: 'category',
      from: 'Soporte',
      to: 'Infraestructura',
    });
  });

  it('capitaliza la prioridad', () => {
    const changes = describeTicketChanges(
      ticket(),
      ticket({ priority: 'alta' }),
    );

    expect(changes[0]).toMatchObject({ from: 'Media', to: 'Alta' });
  });

  it('acumula varios cambios en el orden en que se leen', () => {
    const changes = describeTicketChanges(
      ticket(),
      ticket({
        subject: 'Otro asunto',
        description: 'Otra descripción',
        priority: 'baja',
      }),
    );

    expect(changes.map((change) => change.field)).toEqual([
      'subject',
      'description',
      'priority',
    ]);
  });

  /** Un campo ausente en cualquiera de las dos fotos no es una edición. */
  it('ignora los campos que faltan en alguno de los dos lados', () => {
    expect(
      describeTicketChanges(
        ticket({ categoryName: undefined }),
        ticket({ categoryName: 'Soporte' }),
      ),
    ).toEqual([]);
    expect(
      describeTicketChanges(ticket(), ticket({ description: '' })),
    ).toEqual([]);
  });
});

import {
  BackupFrequency,
  describeSchedule,
  limaWallClockToUtc,
  nextRunAt,
  toLimaParts,
} from './lima-schedule';

/** Lima es UTC-5 todo el año, así que las 03:00 locales son las 08:00 UTC. */
describe('lima-schedule', () => {
  const schedule = (over: Partial<Parameters<typeof nextRunAt>[0]> = {}) => ({
    frequency: BackupFrequency.DAILY,
    hour: 3,
    minute: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
    ...over,
  });

  it('convierte la hora de pared de Lima a UTC', () => {
    expect(limaWallClockToUtc(2026, 3, 15, 3, 0).toISOString()).toBe(
      '2026-03-15T08:00:00.000Z',
    );
    // En pleno "verano" del norte tampoco cambia: Perú no tiene DST.
    expect(limaWallClockToUtc(2026, 7, 15, 23, 30).toISOString()).toBe(
      '2026-07-16T04:30:00.000Z',
    );
  });

  it('lee las partes locales de un instante UTC', () => {
    const parts = toLimaParts(new Date('2026-01-01T02:00:00.000Z'));
    expect(parts).toMatchObject({ year: 2025, month: 12, day: 31, hour: 21 });
  });

  it('medianoche local no se reporta como hora 24', () => {
    expect(toLimaParts(new Date('2026-05-10T05:00:00.000Z')).hour).toBe(0);
  });

  describe('diario', () => {
    it('elige la corrida de hoy cuando todavía no pasó', () => {
      const from = new Date('2026-03-15T06:00:00.000Z'); // 01:00 Lima
      expect(nextRunAt(schedule(), from).toISOString()).toBe(
        '2026-03-15T08:00:00.000Z',
      );
    });

    it('salta al día siguiente cuando la hora ya pasó', () => {
      const from = new Date('2026-03-15T10:00:00.000Z'); // 05:00 Lima
      expect(nextRunAt(schedule(), from).toISOString()).toBe(
        '2026-03-16T08:00:00.000Z',
      );
    });

    it('cruza el fin de mes', () => {
      const from = new Date('2026-01-31T10:00:00.000Z');
      expect(nextRunAt(schedule(), from).toISOString()).toBe(
        '2026-02-01T08:00:00.000Z',
      );
    });

    it('nunca devuelve el instante exacto en que se lo llama', () => {
      const from = new Date('2026-03-15T08:00:00.000Z');
      expect(nextRunAt(schedule(), from).getTime()).toBeGreaterThan(
        from.getTime(),
      );
    });
  });

  describe('semanal', () => {
    it('espera al día de la semana elegido', () => {
      // 2026-03-15 es domingo; el próximo miércoles (3) es el 18.
      const from = new Date('2026-03-15T10:00:00.000Z');
      const next = nextRunAt(
        schedule({ frequency: BackupFrequency.WEEKLY, dayOfWeek: 3 }),
        from,
      );
      expect(next.toISOString()).toBe('2026-03-18T08:00:00.000Z');
    });

    it('si hoy es el día pero la hora pasó, va a la semana siguiente', () => {
      const from = new Date('2026-03-15T10:00:00.000Z'); // domingo 05:00 Lima
      const next = nextRunAt(
        schedule({ frequency: BackupFrequency.WEEKLY, dayOfWeek: 0 }),
        from,
      );
      expect(next.toISOString()).toBe('2026-03-22T08:00:00.000Z');
    });
  });

  describe('mensual', () => {
    it('usa el día del mes elegido', () => {
      const from = new Date('2026-03-15T10:00:00.000Z');
      const next = nextRunAt(
        schedule({ frequency: BackupFrequency.MONTHLY, dayOfMonth: 28 }),
        from,
      );
      expect(next.toISOString()).toBe('2026-03-28T08:00:00.000Z');
    });

    it('pasa al mes siguiente cuando el día ya pasó', () => {
      const from = new Date('2026-12-20T10:00:00.000Z');
      const next = nextRunAt(
        schedule({ frequency: BackupFrequency.MONTHLY, dayOfMonth: 5 }),
        from,
      );
      expect(next.toISOString()).toBe('2027-01-05T08:00:00.000Z');
    });
  });

  describe('cada hora', () => {
    it('toma el minuto de la hora en curso o de la siguiente', () => {
      const from = new Date('2026-03-15T10:10:00.000Z');
      expect(
        nextRunAt(
          schedule({ frequency: BackupFrequency.HOURLY, minute: 30 }),
          from,
        ).toISOString(),
      ).toBe('2026-03-15T10:30:00.000Z');
      expect(
        nextRunAt(
          schedule({ frequency: BackupFrequency.HOURLY, minute: 5 }),
          from,
        ).toISOString(),
      ).toBe('2026-03-15T11:05:00.000Z');
    });
  });

  it('describe la programación en castellano', () => {
    expect(describeSchedule(schedule())).toBe(
      'Todos los días a las 03:00 (Lima)',
    );
    expect(
      describeSchedule(
        schedule({ frequency: BackupFrequency.WEEKLY, dayOfWeek: 5, hour: 22 }),
      ),
    ).toBe('Cada viernes a las 22:00 (Lima)');
    expect(
      describeSchedule(
        schedule({ frequency: BackupFrequency.MONTHLY, dayOfMonth: 12 }),
      ),
    ).toBe('El día 12 de cada mes a las 03:00 (Lima)');
  });
});

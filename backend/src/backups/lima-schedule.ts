/**
 * Cálculo de "la próxima vez que toca" para los backups programados. La hora que elige
 * el usuario es siempre hora de Lima; acá se traduce al instante UTC que guarda Mongo.
 *
 * Lima no tiene horario de verano, pero la conversión se hace igual vía `Intl` en vez de
 * restar 5 horas fijas: si algún día se agrega otra zona, alcanza con cambiar `BACKUP_TIMEZONE`.
 */

export const BACKUP_TIMEZONE = 'America/Lima';

export enum BackupFrequency {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export interface BackupSchedule {
  frequency: BackupFrequency;
  /** Hora local (0-23). Ignorada en `hourly`. */
  hour: number;
  /** Minuto local (0-59). */
  minute: number;
  /** 0 = domingo ... 6 = sábado. Solo para `weekly`. */
  dayOfWeek: number;
  /** 1-28 — se corta en 28 para que todos los meses tengan ese día. Solo para `monthly`. */
  dayOfMonth: number;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: BACKUP_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Descompone un instante en la hora de pared de Lima. */
export function toLimaParts(date: Date): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of FORMATTER.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // `hour12: false` puede devolver "24" a medianoche en algunos runtimes.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Diferencia entre la hora de pared de Lima y UTC, en ms, para un instante dado. */
function limaOffsetMs(date: Date): number {
  const parts = toLimaParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Los ms se pierden en el formateo; se reponen para que la resta sea exacta.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Instante UTC de una hora de pared de Lima. Se resuelve en dos pasos porque el offset
 * depende del instante y el instante del offset: la primera pasada da una aproximación y
 * la segunda la corrige si cayó en otro tramo (irrelevante en Lima, correcto en general).
 */
export function limaWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let timestamp = asUtc - limaOffsetMs(new Date(asUtc));
  const corrected = asUtc - limaOffsetMs(new Date(timestamp));
  if (corrected !== timestamp) timestamp = corrected;
  return new Date(timestamp);
}

/** Normaliza lo que llega del formulario a valores con los que se puede calcular. */
function normalize(schedule: BackupSchedule): BackupSchedule {
  return {
    frequency: schedule.frequency,
    hour: clamp(schedule.hour ?? 0, 0, 23),
    minute: clamp(schedule.minute ?? 0, 0, 59),
    dayOfWeek: clamp(schedule.dayOfWeek ?? 1, 0, 6),
    dayOfMonth: clamp(schedule.dayOfMonth ?? 1, 1, 28),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/**
 * Próxima corrida estrictamente posterior a `from`. Devolver siempre un instante futuro
 * es lo que evita que el scheduler dispare dos veces la misma ventana.
 */
export function nextRunAt(
  schedule: BackupSchedule,
  from: Date = new Date(),
): Date {
  const config = normalize(schedule);
  const now = toLimaParts(from);

  if (config.frequency === BackupFrequency.HOURLY) {
    // La hora elegida no aplica; solo el minuto dentro de cada hora.
    const candidate = limaWallClockToUtc(
      now.year,
      now.month,
      now.day,
      now.hour,
      config.minute,
    );
    if (candidate > from) return candidate;
    return new Date(candidate.getTime() + 3_600_000);
  }

  const todayAtTime = () =>
    limaWallClockToUtc(
      now.year,
      now.month,
      now.day,
      config.hour,
      config.minute,
    );

  switch (config.frequency) {
    case BackupFrequency.DAILY: {
      const candidate = todayAtTime();
      if (candidate > from) return candidate;
      return atLimaDayOffset(from, 1, config);
    }
    case BackupFrequency.WEEKLY: {
      let delta = (config.dayOfWeek - now.weekday + 7) % 7;
      if (delta === 0 && todayAtTime() <= from) delta = 7;
      return atLimaDayOffset(from, delta, config);
    }
    case BackupFrequency.MONTHLY: {
      const thisMonth = limaWallClockToUtc(
        now.year,
        now.month,
        config.dayOfMonth,
        config.hour,
        config.minute,
      );
      if (thisMonth > from) return thisMonth;
      const month = now.month === 12 ? 1 : now.month + 1;
      const year = now.month === 12 ? now.year + 1 : now.year;
      return limaWallClockToUtc(
        year,
        month,
        config.dayOfMonth,
        config.hour,
        config.minute,
      );
    }
    default:
      return atLimaDayOffset(from, 1, config);
  }
}

/**
 * La misma hora de pared, `days` días de calendario después. Se suma sobre el instante y
 * se releen las partes locales para no tener que saber cuántos días trae cada mes.
 */
function atLimaDayOffset(
  from: Date,
  days: number,
  config: BackupSchedule,
): Date {
  const shifted = toLimaParts(new Date(from.getTime() + days * 86_400_000));
  return limaWallClockToUtc(
    shifted.year,
    shifted.month,
    shifted.day,
    config.hour,
    config.minute,
  );
}

/** "Todos los días a las 03:00 (Lima)" — para mostrar la programación sin recalcularla. */
export function describeSchedule(schedule: BackupSchedule): string {
  const config = normalize(schedule);
  const time = `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`;
  const days = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ];

  switch (config.frequency) {
    case BackupFrequency.HOURLY:
      return `Cada hora, en el minuto ${String(config.minute).padStart(2, '0')} (Lima)`;
    case BackupFrequency.WEEKLY:
      return `Cada ${days[config.dayOfWeek]} a las ${time} (Lima)`;
    case BackupFrequency.MONTHLY:
      return `El día ${config.dayOfMonth} de cada mes a las ${time} (Lima)`;
    default:
      return `Todos los días a las ${time} (Lima)`;
  }
}

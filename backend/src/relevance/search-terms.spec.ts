import { buildTextSearch, extractSearchTerms } from './search-terms';

describe('extractSearchTerms', () => {
  it('keeps the distinctive words of a ticket', () => {
    expect(
      extractSearchTerms('No puedo descargar la factura electrónica'),
    ).toEqual(['descargar', 'factura', 'electrónica']);
  });

  it('drops words shorter than four characters', () => {
    expect(extractSearchTerms('el pdf no se ve en la app')).toEqual([]);
  });

  it('drops domain noise that would match almost every ticket', () => {
    expect(
      extractSearchTerms('Error en el sistema, necesito ayuda urgente'),
    ).toEqual([]);
  });

  it('keeps the real terms even when surrounded by noise', () => {
    expect(
      extractSearchTerms('Hola, tengo un problema con la facturación mensual'),
    ).toEqual(['facturación', 'mensual']);
  });

  it('splits on punctuation and symbols', () => {
    expect(extractSearchTerms('checkout/pago: falló (timeout)')).toEqual([
      'checkout',
      'pago',
      'falló',
      'timeout',
    ]);
  });

  it('deduplicates repeated words', () => {
    expect(extractSearchTerms('factura factura FACTURA')).toEqual(['factura']);
  });

  it('is case insensitive', () => {
    expect(extractSearchTerms('FACTURACIÓN Mensual')).toEqual([
      'facturación',
      'mensual',
    ]);
  });

  it('keeps accented and non-ascii words intact', () => {
    expect(extractSearchTerms('sesión caducó rápido')).toEqual([
      'sesión',
      'caducó',
      'rápido',
    ]);
  });

  it('keeps numbers that are part of a word', () => {
    expect(extractSearchTerms('error http500 al guardar')).toEqual([
      'http500',
      'guardar',
    ]);
  });

  it('caps the term list so a long description cannot match everything', () => {
    const long = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ');
    expect(extractSearchTerms(long)).toHaveLength(12);
  });

  it('preserves order, so the words the reporter led with survive the cap', () => {
    const long = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ');
    expect(extractSearchTerms(long)[0]).toBe('palabra0');
  });

  it('returns nothing for empty or meaningless input', () => {
    expect(extractSearchTerms('')).toEqual([]);
    expect(extractSearchTerms('   ')).toEqual([]);
    expect(extractSearchTerms('!!! ??? ...')).toEqual([]);
  });
});

describe('buildTextSearch', () => {
  it('joins the terms into a $text query string', () => {
    expect(buildTextSearch('No puedo descargar la factura')).toBe(
      'descargar factura',
    );
  });

  it('returns an empty string when nothing is worth searching for', () => {
    // Callers rely on this to skip the query entirely rather than match everything.
    expect(buildTextSearch('hola, ayuda urgente')).toBe('');
  });
});

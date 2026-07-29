/**
 * Words that carry no signal in a support ticket and would otherwise match almost
 * everything. Mongo's spanish text index already drops grammatical stopwords when
 * indexing, but these are domain noise ("problema", "error") that it happily keeps.
 */
const NOISE_TERMS = new Set([
  'problema',
  'problemas',
  'error',
  'errores',
  'falla',
  'fallas',
  'ayuda',
  'consulta',
  'ticket',
  'urgente',
  'favor',
  'hola',
  'buenas',
  'gracias',
  'saludos',
  'necesito',
  'quiero',
  'puedo',
  'puede',
  'tengo',
  'hace',
  'hacer',
  'sistema',
  'aplicacion',
  'aplicación',
  'plataforma',
]);

const MIN_TERM_LENGTH = 4;

/**
 * Long descriptions otherwise turn into a query that matches half the collection and
 * ranks nothing usefully. The cap keeps the most distinctive words only.
 */
const MAX_TERMS = 12;

/**
 * Turns free text into the term list handed to `$text`. Order is preserved, so the
 * words the reporter led with survive the cap.
 */
export function extractSearchTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_TERM_LENGTH) continue;
    if (NOISE_TERMS.has(raw)) continue;
    if (seen.has(raw)) continue;

    seen.add(raw);
    terms.push(raw);
    if (terms.length === MAX_TERMS) break;
  }

  return terms;
}

/** Empty when the text has nothing distinctive — callers must skip the query entirely. */
export function buildTextSearch(text: string): string {
  return extractSearchTerms(text).join(' ');
}

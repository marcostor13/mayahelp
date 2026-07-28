/** Neutralises regex metacharacters so a user typing "(" cannot blow up the query. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

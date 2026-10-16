/** Orders strings by UTF-16 code unit, independent of locale, so sorted output is identical on every machine. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

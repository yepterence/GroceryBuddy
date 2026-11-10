/** Item identity (ADR 0001): lowercase with whitespace runs collapsed; mirrors api/items.py. */
export const normalizeItemName = (name: string): string =>
  name.split(/\s+/).filter(Boolean).join(" ").toLowerCase();

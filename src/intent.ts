import { normalizeItemName } from "./items";
import { Item } from "./types";

/**
 * Grocery intent (PRD 02 §4a): whether a list looks like a regular grocery run.
 * A show/hide gate for Suggestions, separate from the re-purchase score.
 * Judged live and never stored. The word lists are English.
 */
export const GROCERY_WORDS = [
  "grocery",
  "groceries",
  "weekly",
  "shop",
  "market",
  "food",
  "costco",
];

export const EVENT_WORDS = ["party", "bbq", "birthday", "potluck", "christmas"];

/** Grocery lines on a mixed list. Whole words, so "oat milk" counts and "buttermilk" does not. */
export const GROCERY_ITEMS = ["milk", "bread", "eggs", "butter", "rice", "cheese"];

/**
 * Items commonly bought for an occasion. Weekly re-purchase does not use this list.
 * The Suggestion slot does not show it yet (PRD 02 F9).
 */
export const SEASONAL_ITEMS: Record<string, readonly string[]> = {
  christmas: ["turkey", "cranberry sauce", "stuffing", "potatoes", "gravy"],
  bbq: ["buns", "burgers", "ketchup", "mustard", "charcoal"],
  birthday: ["cake", "candles", "ice cream"],
  party: ["chips", "soda", "dip", "ice"],
  potluck: ["chips", "dip", "rolls", "soda"],
};

export const MIN_MANUAL_ITEMS = 2;
export const KNOWN_SHARE = 0.5;

const wordsIn = (title: string): Set<string> =>
  new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0));

const hasWord = (title: string, words: readonly string[]): boolean => {
  const found = wordsIn(title);
  return words.some((word) => found.has(word));
};

/** True when the Item name contains a staple word, such as "milk" in "oat milk". */
export const isGroceryItem = (name: string): boolean => {
  const words = wordsIn(normalizeItemName(name));
  return GROCERY_ITEMS.some((staple) => words.has(staple));
};

/** Companions for every occasion word in the title, in list order, without duplicates. */
export const seasonalCompanions = (title: string): string[] => {
  const found = wordsIn(title);
  const companions: string[] = [];
  for (const word of EVENT_WORDS) {
    if (!found.has(word)) continue;
    for (const item of SEASONAL_ITEMS[word] ?? []) {
      if (!companions.includes(item)) companions.push(item);
    }
  }
  return companions;
};

/**
 * True when re-purchase Suggestions should show. A grocery word in the title,
 * at least two grocery Items the Shopper typed, or enough previously added
 * Items. An occasion word does not hide this and does not open it alone.
 * `knownItemNames` is this Shopper's history; on a saved list it leaves out
 * Additions on that list.
 */
export const hasGroceryIntent = ({
  title,
  items,
  knownItemNames,
}: {
  title: string;
  items: Pick<Item, "name" | "source">[];
  knownItemNames: readonly string[];
}): boolean => {
  if (hasWord(title, GROCERY_WORDS)) return true;

  const typed = items.filter((item) => (item.source ?? "manual") === "manual");
  const groceryCount = typed.filter((item) => isGroceryItem(item.name)).length;
  if (groceryCount >= MIN_MANUAL_ITEMS) return true;
  if (typed.length < MIN_MANUAL_ITEMS) return false;
  const known = new Set(knownItemNames.map(normalizeItemName));
  const familiar = typed.filter((item) => known.has(normalizeItemName(item.name))).length;
  return familiar / typed.length >= KNOWN_SHARE;
};

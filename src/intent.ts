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

export const MIN_MANUAL_ITEMS = 2;
export const KNOWN_SHARE = 0.5;

const wordsIn = (title: string): Set<string> =>
  new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0));

const hasWord = (title: string, words: readonly string[]): boolean => {
  const found = wordsIn(title);
  return words.some((word) => found.has(word));
};

/**
 * True when the title names a grocery run, or when enough of the Items the
 * Shopper typed are ones they have added before. An event word in the title
 * hides Suggestions either way. `knownItemNames` is this Shopper's history;
 * on a saved list it leaves out Additions on that list.
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
  if (hasWord(title, EVENT_WORDS)) return false;
  if (hasWord(title, GROCERY_WORDS)) return true;

  const typed = items.filter((item) => (item.source ?? "manual") === "manual");
  if (typed.length < MIN_MANUAL_ITEMS) return false;
  const known = new Set(knownItemNames.map(normalizeItemName));
  const familiar = typed.filter((item) => known.has(normalizeItemName(item.name))).length;
  return familiar / typed.length >= KNOWN_SHARE;
};

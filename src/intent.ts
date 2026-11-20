import seasonalEventsJson from "./data/seasonal-events.json";
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

/**
 * Occasion names, in suggestion order. Key order in seasonal-events.json is that
 * order, and "party" is last, so "birthday party" starts with cake.
 */
export const EVENT_WORDS: readonly string[] = Object.keys(seasonalEventsJson);

/** Grocery lines on a mixed list. Whole words, so "oat milk" counts and "buttermilk" does not. */
export const GROCERY_ITEMS = ["milk", "bread", "eggs", "butter", "rice", "cheese"];

/**
 * Items commonly bought for an occasion. An occasion list shows the next one
 * that is not already on the list, instead of the weekly re-purchase list.
 * The lists live in src/data/seasonal-events.json.
 */
export const SEASONAL_ITEMS: Record<string, readonly string[]> = seasonalEventsJson;

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

/** The next occasion Item that is not already on the list. */
export const nextSeasonalCompanion = (
  title: string,
  itemNames: readonly string[],
): string | undefined => {
  const onList = new Set(itemNames.map((name) => normalizeItemName(name)));
  return seasonalCompanions(title).find((name) => !onList.has(name));
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

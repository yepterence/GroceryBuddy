import { useEffect, useState } from "react";
import { hasGroceryIntent } from "./intent";
import { normalizeItemName } from "./items";
import { Item, Suggestion } from "./types";

// An untouched Suggestion collapses to a chip after this long; it is not dismissed.
export const SUGGESTION_COLLAPSE_MS = 10_000;

/**
 * The one-at-a-time Suggestion in the empty Item slot (PRD 02 §4a).
 * Shared by the create form and saved lists: grocery intent, skipping Items
 * already on the list or dismissed on this visit, the collapse timer, and
 * treating typing in the slot as a dismissal.
 */
export const useSuggestionSlot = ({
  title,
  items,
  suggestions,
  knownItemNames,
  draftText,
}: {
  title: string;
  items: Item[];
  suggestions: Suggestion[];
  knownItemNames: readonly string[];
  draftText: string;
}) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);

  const show = hasGroceryIntent({ title, items, knownItemNames });
  const onList = new Set(items.map((item) => normalizeItemName(item.name)));
  const next = show
    ? suggestions.find(
        (suggestion) =>
          !onList.has(suggestion.payload.item_name) &&
          !dismissed.has(suggestion.payload.item_name),
      )
    : undefined;
  // The Suggestion only sits in the slot while the Shopper has not typed into it.
  const shown = draftText === "" ? next : undefined;
  const shownName = shown?.payload.item_name ?? null;
  const collapsed = shownName !== null && collapsedFor === shownName;

  useEffect(() => {
    if (shownName === null || collapsed) return;
    const timer = setTimeout(() => setCollapsedFor(shownName), SUGGESTION_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [shownName, collapsed]);

  const dismiss = (suggestion: Suggestion) => {
    setDismissed((prev) => new Set(prev).add(suggestion.payload.item_name));
  };

  // Returns the Suggestion that typing just dismissed, when the slot was showing one.
  const noteDraftChange = (value: string): Suggestion | undefined => {
    if (!shown || value === "") return undefined;
    dismiss(shown);
    return shown;
  };

  const reset = () => {
    setDismissed(new Set());
    setCollapsedFor(null);
  };

  return {
    shown,
    collapsed,
    dismiss,
    noteDraftChange,
    expand: () => setCollapsedFor(null),
    reset,
  };
};

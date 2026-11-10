export type ItemSource = "manual" | "suggestion";

export interface Item {
  id: string;
  name: string;
  checked: boolean;
  /** How the Item got onto a draft list; saved lists do not carry it. */
  source?: ItemSource;
}

export interface GroceryList {
  id: string;
  title: string;
  contents: Item[];
}

export interface GroceryLists {
  lists: GroceryList[];
}

/** A re-purchase Suggestion exactly as the API returns it (PRD 02 §4). */
export interface Suggestion {
  type: "repurchase";
  payload: {
    item_name: string;
    inclusion_count: number;
    last_included_at: string;
    cadence_days: number | null;
    next_due_at: string | null;
  };
  reason: string;
  score: number;
}

export type OutcomeAction = "accepted" | "dismissed";

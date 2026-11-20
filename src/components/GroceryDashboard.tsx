import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GroceryLists, GroceryList, Item, Suggestion } from "../types";
import { useListStore, useSearchQueryStore } from "../store/applicationStore";
import {
  addItem,
  fetchLists,
  fetchRepurchaseSuggestions,
  recordOutcome,
  removeItem,
  removeList,
  setItemChecked,
} from "../requests";
import { LISTS_QUERY_KEY } from "../queryClient";
import { useSuggestionSlot } from "../useSuggestionSlot";
import Banner from "./Banner";
import SuggestionBubble from "./Suggestion";

/** Wraps each case-insensitive occurrence of `term` in `text` with a <mark>. */
const highlightTerm = (text: string, term: string) => {
  if (!term) return text;
  const lowerText = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let at = lowerText.indexOf(term);
  while (at !== -1) {
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(<mark key={at}>{text.slice(at, at + term.length)}</mark>);
    cursor = at + term.length;
    at = lowerText.indexOf(term, cursor);
  }
  if (cursor === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
};

const messageFrom = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

// Outcomes are best effort: a lost one only means the Item may be suggested again.
const sendOutcome = (suggestion: Suggestion, action: "accepted" | "dismissed") => {
  recordOutcome(suggestion, action).catch(() => {});
};

/** The New Item slot on one saved list, with its Suggestion when intent is high enough. */
const SavedListAdder = ({
  list,
  onError,
  onAdded,
}: {
  list: GroceryList;
  onError: (message: string | null) => void;
  onAdded: (message: string) => void;
}) => {
  const addItemToList = useListStore((state) => state.addItemToList);
  const [newItem, setNewItem] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [knownItemNames, setKnownItemNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRepurchaseSuggestions(list.id)
      .then((found) => {
        if (cancelled) return;
        setSuggestions(found.suggestions);
        setKnownItemNames(found.knownItemNames);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
        setKnownItemNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [list.id]);

  const { shown, collapsed, dismiss, noteDraftChange, expand } = useSuggestionSlot({
    title: list.title,
    items: list.contents,
    suggestions,
    knownItemNames,
    draftText: newItem,
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const typedOver = noteDraftChange(value);
    if (typedOver) sendOutcome(typedOver, "dismissed");
    setNewItem(value);
  };

  const accept = async (suggestion: Suggestion) => {
    onError(null);
    try {
      const saved = await addItem(list.id, suggestion.payload.item_name, "suggestion");
      addItemToList(list.id, saved);
      sendOutcome(suggestion, "accepted");
      onAdded(list.title.trim() ? `Added to ${list.title.trim()}` : "Added to this list");
      inputRef.current?.focus();
    } catch (err) {
      onError(messageFrom(err, "Could not add the item."));
    }
  };

  const commitTyped = async () => {
    const name = newItem.trim();
    if (!name) return;
    onError(null);
    try {
      const saved = await addItem(list.id, name, "manual");
      addItemToList(list.id, saved);
      setNewItem("");
    } catch (err) {
      onError(messageFrom(err, "Could not add the item."));
    }
  };

  return (
    <li className={shown ? "list-item composer-row" : "list-item"}>
      <div className="new-item-slot">
        <input
          type="checkbox"
          checked={false}
          disabled
          className="input-list-checkbox"
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          type="text"
          className="new-item-input"
          placeholder="New Item"
          aria-label={`New item on ${list.title}`}
          value={newItem}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyped();
            }
          }}
          ref={inputRef}
        />
      </div>
      {shown && (
        <SuggestionBubble
          inline
          suggestion={shown}
          collapsed={collapsed}
          onAccept={() => accept(shown)}
          onDismiss={() => {
            dismiss(shown);
            sendOutcome(shown, "dismissed");
          }}
          onExpand={expand}
        />
      )}
    </li>
  );
};

const GroceryDashboard = ({ lists }: GroceryLists) => {
  const setGroceryLists = useListStore((state) => state.setGroceryLists);
  const toggleItemChecked = useListStore((state) => state.toggleItemChecked);
  const deleteList = useListStore((state) => state.deleteList);
  const searchTerm = useSearchQueryStore((state) => state.searchTerm);
  const removeItemFromList = useListStore((state) => state.removeItem);
  // Errors from check/delete actions.
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // One list at a time offers its New Item slot.
  const [addingListId, setAddingListId] = useState<string | null>(null);
  // The load error the user already dismissed (compared by identity, so a new
  // failure shows again).
  const [dismissedLoadError, setDismissedLoadError] = useState<unknown>(null);

  // Load this user's saved lists from the API. TanStack Query handles the loading
  // state, caching, one retry, and refetching when the window regains focus.
  const { data: savedLists, error: loadError } = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => fetchLists(),
  });

  // The store still drives the UI (and the offline cache); mirror the server's
  // lists into it whenever fresh data arrives.
  useEffect(() => {
    if (savedLists) setGroceryLists(savedLists);
  }, [savedLists, setGroceryLists]);

  const loadErrorMessage =
    loadError && loadError !== dismissedLoadError
      ? messageFrom(loadError, "Could not load your lists.")
      : null;

  const dismissError = () => {
    setActionError(null);
    setDismissedLoadError(loadError);
  };

  // Persist first; only update the UI once the server confirmed the change.
  const handleToggle = async (listId: string, item: Item) => {
    setActionError(null);
    try {
      await setItemChecked(item.id, !item.checked);
      toggleItemChecked(listId, item.id);
    } catch (err) {
      setActionError(messageFrom(err, "Could not update the item."));
    }
  };

  const handleDelete = async (listId: string) => {
    setActionError(null);
    try {
      await removeList(listId);
      deleteList(listId);
    } catch (err) {
      setActionError(messageFrom(err, "Could not delete the list."));
    }
  };

  const handleRemoveItem = async (listId: string, item: Item) => {
    setActionError(null);
    try {
      await removeItem(item.id);
      removeItemFromList(listId, item.id);
    } catch (err) {
      setActionError(messageFrom(err, "Could not remove the item."));
    }
  };

  // A filtered copy: the store keeps every list, so clearing the search restores them.
  const term = searchTerm.trim().toLowerCase();
  const matchesTerm = (text: string) => text.toLowerCase().includes(term);
  const searchFilteredList = !lists
    ? lists
    : term
      ? lists.filter(
          (list) =>
            matchesTerm(list.title) ||
            list.contents.some((item) => matchesTerm(item.name)),
        )
      : lists;
  const noMatches = Boolean(term) && searchFilteredList?.length === 0;

  return (
    <section className="lists-section">
      <Banner
        type="error"
        message={actionError || loadErrorMessage}
        onDismiss={dismissError}
      />
      <Banner type="success" message={notice} onDismiss={() => setNotice(null)} />
      <div className="section-heading">
        <h2>Your lists</h2>
        <p>A little planning. One easy trip.</p>
      </div>
      <div className="lists">
        {noMatches && <Banner type="info" message="No match found" />}
        {searchFilteredList &&
          searchFilteredList.map((newList: GroceryList) => (
            <article className="list-card" key={newList.id}>
              <header className="list-card-header">
                <h3>{highlightTerm(newList.title, term)}</h3>
                <div className="list-card-actions">
                  <button
                    type="button"
                    className={
                      addingListId === newList.id ? "button-add is-open" : "button-add"
                    }
                    aria-label={`Add item to ${newList.title}`}
                    aria-expanded={addingListId === newList.id}
                    onClick={() =>
                      setAddingListId((current) =>
                        current === newList.id ? null : newList.id,
                      )
                    }
                  >
                    Add item
                  </button>
                  <button
                    type="button"
                    className="icon-dismiss"
                    aria-label={`Delete ${newList.title}`}
                    onClick={() => handleDelete(newList.id)}
                  >
                    ×
                  </button>
                </div>
              </header>
              <ul>
                {newList.contents.map((item: Item) => (
                  <li
                    key={item.id}
                    className={[
                      item.checked ? "list-item list-item-checked" : "list-item",
                      term && matchesTerm(item.name) ? "list-item-match" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggle(newList.id, item)}
                    />
                    <span>{item.name}</span>
                    <button
                      type="button"
                      className="icon-dismiss"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => handleRemoveItem(newList.id, item)}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {addingListId === newList.id && (
                  <SavedListAdder
                    list={newList}
                    onError={setActionError}
                    onAdded={setNotice}
                  />
                )}
              </ul>
            </article>
          ))}
      </div>
    </section>
  );
};

export default GroceryDashboard;

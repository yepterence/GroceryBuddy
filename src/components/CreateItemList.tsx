import {
  ChangeEvent,
  useCallback,
  useEffect,
  useState,
  useRef,
  KeyboardEvent,
} from "react";
import { useListStore } from "../store/applicationStore";
import { v4 as uuidv4 } from "uuid";
import { Item, Suggestion } from "../types";
import {
  createList,
  fetchRepurchaseSuggestions,
  recordOutcome,
} from "../requests";
import { normalizeItemName } from "../items";
import Banner from "./Banner";
import SuggestionBubble from "./Suggestion";

// Suggestions wait for this many Items on the draft (PRD 02 §4a, before grocery intent).
const MIN_ITEMS_FOR_SUGGESTIONS = 2;
// An untouched Suggestion collapses to a chip after this long; it is not dismissed.
const SUGGESTION_COLLAPSE_MS = 10_000;

// Outcomes are best effort: a lost one only means the Item may be suggested again.
const sendOutcome = (suggestion: Suggestion, action: "accepted" | "dismissed") => {
  recordOutcome(suggestion, action).catch(() => {});
};

const CreateItemList = () => {
  const addGroceryList = useListStore((state) => state.addGroceryList);
  const [title, setTitle] = useState("");
  const [newItem, setNewItem] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Item names the Shopper dismissed on this draft; the server keeps the lasting "no".
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Accepted Suggestions by draft Item id, reported as accepted once the list is saved.
  const [accepted, setAccepted] = useState<Record<string, Suggestion>>({});
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null);
  const nextInputRef = useRef<HTMLInputElement>(null);

  const loadSuggestions = useCallback(() => {
    fetchRepurchaseSuggestions()
      .then((found) => setSuggestions(found.suggestions))
      .catch(() => setSuggestions([]));
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const onDraft = new Set(items.map((item) => normalizeItemName(item.name)));
  const nextSuggestion =
    items.length >= MIN_ITEMS_FOR_SUGGESTIONS
      ? suggestions.find(
          (s) =>
            !onDraft.has(s.payload.item_name) && !dismissed.has(s.payload.item_name),
        )
      : undefined;
  // The Suggestion only sits in the slot while the Shopper has not typed into it.
  const shown = newItem === "" ? nextSuggestion : undefined;
  const shownName = shown?.payload.item_name ?? null;
  const collapsed = shownName !== null && collapsedFor === shownName;

  useEffect(() => {
    if (shownName === null || collapsed) return;
    const timer = setTimeout(() => setCollapsedFor(shownName), SUGGESTION_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [shownName, collapsed]);

  const dismissSuggestion = (suggestion: Suggestion) => {
    setDismissed((prev) => new Set(prev).add(suggestion.payload.item_name));
    sendOutcome(suggestion, "dismissed");
  };

  const acceptSuggestion = (suggestion: Suggestion) => {
    const id = uuidv4();
    setItems([
      ...items,
      { id, name: suggestion.payload.item_name, checked: false, source: "suggestion" },
    ]);
    setAccepted((prev) => ({ ...prev, [id]: suggestion }));
    setNotice(title.trim() ? `Added to ${title.trim()}` : "Added to this list");
    nextInputRef.current?.focus();
  };

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  // Typing over a Suggestion is a dismissal, the same lasting "no" as the button.
  const handleNewItemChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (shown && value !== "") dismissSuggestion(shown);
    setNewItem(value);
  };

  const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!newItem.trim()) return;
      const newId = uuidv4();
      setItems([
        ...items,
        { id: newId, name: newItem, checked: false, source: "manual" },
      ]);
      setNewItem("");
    }
  };

  const toggleItemChecked = (itemId: string) => {
    setItems(
      items.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setTitle((e.target as HTMLInputElement).value);
      if (nextInputRef.current) {
        nextInputRef.current.focus();
      }
    }
  };

  // Save to the API first; the store gets the server's list (with its real ids),
  // and the form is only cleared once the save succeeded.
  const handleFormSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const saved = await createList(
        title,
        items.map((item) => ({ name: item.name, source: item.source ?? "manual" })),
      );
      addGroceryList(saved);
      items.forEach((item) => {
        const suggestion = accepted[item.id];
        if (suggestion) sendOutcome(suggestion, "accepted");
      });
      setTitle("");
      setItems([]);
      setAccepted({});
      setDismissed(new Set());
      setCollapsedFor(null);
      setNotice(null);
      loadSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the list.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <Banner type="error" message={error} onDismiss={() => setError(null)} />
      <Banner type="success" message={notice} onDismiss={() => setNotice(null)} />
      <form>
        <input
          type="text"
          name="title"
          placeholder="Title"
          value={title}
          onChange={handleTitleChange}
          onKeyDown={(e) => handleTitleKeyDown(e)}
        />
        {items &&
          items.map((item) => (
            <li
              key={item.id}
              className={item.checked ? "list-item-checked" : "list-item"}
            >
              <input
                type="checkbox"
                checked={item.checked}
                className="input-list-checkbox"
                onChange={() => toggleItemChecked(item.id)}
              />
              {item.name}
            </li>
          ))}
        {shown && (
          <SuggestionBubble
            suggestion={shown}
            collapsed={collapsed}
            onAccept={() => acceptSuggestion(shown)}
            onDismiss={() => dismissSuggestion(shown)}
            onExpand={() => setCollapsedFor(null)}
          />
        )}
        {title.trim() && (
          <li className="list-item">
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
              value={newItem}
              onChange={handleNewItemChange}
              onKeyDown={handleKeyDown}
              ref={nextInputRef}
            />
          </li>
        )}
        <button type="submit" onClick={handleFormSubmit} disabled={saving}>
          Add
        </button>
      </form>
    </div>
  );
};

export default CreateItemList;

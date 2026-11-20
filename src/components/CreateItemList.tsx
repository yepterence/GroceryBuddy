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
import Banner from "./Banner";
import SuggestionBubble from "./Suggestion";
import { useSuggestionSlot } from "../useSuggestionSlot";

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
  const [knownItemNames, setKnownItemNames] = useState<string[]>([]);
  // Accepted Suggestions by draft Item id, reported as accepted once the list is saved.
  const [accepted, setAccepted] = useState<Record<string, Suggestion>>({});
  const nextInputRef = useRef<HTMLInputElement>(null);

  const loadSuggestions = useCallback(() => {
    fetchRepurchaseSuggestions()
      .then((found) => {
        setSuggestions(found.suggestions);
        setKnownItemNames(found.knownItemNames);
      })
      .catch(() => {
        setSuggestions([]);
        setKnownItemNames([]);
      });
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const { shown, collapsed, dismiss, noteDraftChange, expand, reset } = useSuggestionSlot({
    title,
    items,
    suggestions,
    knownItemNames,
    draftText: newItem,
  });

  const dismissSuggestion = (suggestion: Suggestion) => {
    dismiss(suggestion);
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
    const typedOver = noteDraftChange(value);
    if (typedOver) sendOutcome(typedOver, "dismissed");
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

  const removeDraftItem = (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
    setAccepted((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
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
      reset();
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
          aria-label="Title"
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
              <span>{item.name}</span>
              <button
                type="button"
                className="icon-dismiss"
                aria-label={`Remove ${item.name}`}
                onClick={() => removeDraftItem(item.id)}
              >
                ×
              </button>
            </li>
          ))}
        {(shown || title.trim()) && (
          <li className={shown ? "list-item composer-row" : "list-item"}>
            {title.trim() && (
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
                  value={newItem}
                  onChange={handleNewItemChange}
                  onKeyDown={handleKeyDown}
                  ref={nextInputRef}
                />
              </div>
            )}
            {shown && (
              <SuggestionBubble
                inline
                suggestion={shown}
                collapsed={collapsed}
                onAccept={() => acceptSuggestion(shown)}
                onDismiss={() => dismissSuggestion(shown)}
                onExpand={expand}
              />
            )}
          </li>
        )}
        <button
          type="submit"
          onClick={handleFormSubmit}
          disabled={saving || !title.trim()}
        >
          Create list
        </button>
      </form>
    </div>
  );
};

export default CreateItemList;

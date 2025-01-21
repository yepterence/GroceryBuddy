import { SetStateAction, useState, useRef, KeyboardEvent } from "react";
import { useListStore } from "../store/applicationStore";
import { v4 as uuidv4 } from "uuid";
import { Item } from "../types";

const CreateItemList = () => {
  const addGroceryList = useListStore((state) => state.addGroceryList);
  const [title, setTitle] = useState("");
  const [newItem, setNewItem] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const nextInputRef = useRef<HTMLInputElement>(null);

  const handleTitleChange = (e: {
    target: { value: SetStateAction<string> };
  }) => {
    setTitle(e.target.value);
  };

  const handleNewItemChange = (e: {
    target: { value: SetStateAction<string> };
  }) => {
    setNewItem(e.target.value);
  };

  const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newId = uuidv4();
      setItems([...items, { id: newId, name: newItem, checked: false }]);
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

  const handleFormSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const listId = uuidv4();
    const payload = { id: listId, title: title, contents: items };
    addGroceryList(payload);
    setTitle("");
    setItems([]);
  };
  return (
    <div>
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
        <input
          type="text"
          placeholder="New Item"
          value={newItem}
          onChange={handleNewItemChange}
          onKeyDown={handleKeyDown}
          ref={nextInputRef}
        />
        <button type="submit" onClick={handleFormSubmit}>
          Add
        </button>
      </form>
    </div>
  );
};

export default CreateItemList;

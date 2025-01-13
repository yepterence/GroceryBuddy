import { SetStateAction, useState } from "react";
import { useListStore } from "../store/applicationStore";
import { v4 as uuidv4 } from "uuid";

const CreateItemList = () => {
  const addGroceryList = useListStore((state) => state.addGroceryList);
  const [title, setTitle] = useState("");
  const [newItem, setNewItem] = useState<string>("");
  const [items, setItems] = useState<{}[]>([]);

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

  const toggleItemChecked = (index) => {
    setItems(
      items.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const listId = uuidv4();
    console.log(e.target);
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
        />
        <button type="submit" onClick={handleFormSubmit}>
          Add
        </button>
      </form>
    </div>
  );
};

export default CreateItemList;

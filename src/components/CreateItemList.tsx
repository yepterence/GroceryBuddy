import { useState } from "react";

const CreateItemList = () => {
  const [title, setTitle] = useState("");
  const [newItem, setNewItem] = useState("");
  const [items, setItems] = useState([]);

  const handleTitleChange = (e) => {
    setTitle(e.target.value);
  };

  const handleNewItemChange = (e) => {
    setNewItem(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setItems([...items, { name: newItem, checked: false }]);
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
        {items.map((item, index) => (
          <li
            key={index}
            className={item.checked ? "list-item-checked" : "list-item"}
          >
            <input
              type="checkbox"
              checked={item.checked}
              className="input-list-checkbox"
              onChange={() => toggleItemChecked(index)}
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
        <button type="submit" onClick={(e) => handleFormSubmit(e)}>
          Add
        </button>
      </form>
    </div>
  );
};

export default CreateItemList;

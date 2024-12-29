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
    if (e.key === "Enter" && newItem.trim() !== "") {
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
      <form onSubmit={(e) => e.preventDefault()}>
        <input
          type="text"
          name="title"
          placeholder="Title"
          value={title}
          onChange={handleTitleChange}
        />
        {items.map((item, index) => (
          <li key={index} className={item.checked ? "checked" : ""}>
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
      </form>
      <div>
        <h3>{title}</h3>
      </div>
    </div>
  );
};

export default CreateItemList;

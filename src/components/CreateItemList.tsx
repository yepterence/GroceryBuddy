import { useState } from "react";

const CreateItemList = () => {
  const [newItem, setNewItem] = useState("");
  const [items, setItems] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const handleTitleChange = (e) => {
    setNewTitle(e.target.value);
  };
  const handleNewItemChange = (e) => {
    setNewItem(e.target.value);
  };
  const handleAddItem = (e) => {
    e.preventDefault();
    if (newItem.trim() !== "") {
      setItems([...items, newItem]);
      setNewItem("");
    }
  };
  return (
    <div>
      <form onSubmit={handleAddItem}>
        <input
          type="text"
          name="title"
          placeholder="Title"
          onChange={handleTitleChange}
        />

        <input
          type="text"
          placeholder="New Item"
          onChange={handleNewItemChange}
          value={newItem}
        />
      </form>
    </div>
  );
};

export default CreateItemList;

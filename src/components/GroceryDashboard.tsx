const GroceryDashboard = ({ lists }) => {
  return (
    <div className="lists">
      {lists &&
        lists.map((item) => (
          <>
            <h3>{item.title}</h3>
            <div key={item.id}>
              <li className={item.checked ? "list-item-checked" : "list-item"}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  className="input-list-checkbox"
                />
                {item.name}
              </li>
            </div>
          </>
        ))}
    </div>
  );
};

export default GroceryDashboard;

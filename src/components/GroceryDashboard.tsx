import { GroceryLists, GroceryList, Item } from "../types";

const GroceryDashboard = ({ lists }: GroceryLists) => {
  return (
    <>
      <h2>Grocery List Dashboard</h2>
      <div className="lists">
        {lists &&
          lists?.map((newList: GroceryList) => (
            <>
              <h3>{newList.title}</h3>
              <div key={newList.id}>
                <ul>
                  {newList.contents.map((item: Item) => (
                    <li>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        className={
                          item.checked ? "list-item-checked" : "list-item"
                        }
                      />
                      {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ))}
      </div>
    </>
  );
};

export default GroceryDashboard;

const GroceryDashboard = ({ lists }) => {
  // console.log(lists);
  // const mappedLists = lists.map((listItem) => {
  //   console.log(listItem.id);
  //   console.log(listItem.title);
  // });
  // console.log("tests");
  return (
    <>
      <div>Grocery List Dashboard</div>
      <div className="lists">
        {lists &&
          lists?.map((newList) => (
            <>
              <h3>{newList.title}</h3>
              <div key={newList.id}>
                <ul>
                  {newList.contents.map((item) => (
                    <li>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        className={
                          newList.checked ? "list-item-checked" : "list-item"
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

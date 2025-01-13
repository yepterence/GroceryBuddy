import "./styles/theme.css";

import Header from "./components/Header";
import CreateItemList from "./components/CreateItemList";
import GroceryDashboard from "./components/GroceryDashboard";
import { useListStore } from "./store/applicationStore";

export const App = () => {
  const { groceryLists } = useListStore();
  console.log({ groceryLists });
  return (
    <>
      <Header />
      <CreateItemList />
      <GroceryDashboard lists={groceryLists} />
    </>
  );
};

export default App;

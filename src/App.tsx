import "./styles/theme.css";

import Header from "./components/Header";
import CreateItemList from "./components/CreateItemList";
import GroceryDashboard from "./components/GroceryDashboard";

export const App = () => {
  return (
    <>
      <Header />
      <CreateItemList />
      <GroceryDashboard />
    </>
  );
};

export default App;

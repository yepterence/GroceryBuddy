import "./styles/theme.css";

import Header from "./components/Header";
import { SearchBar } from "./components/SearchBar";
import CreateItemList from "./components/CreateItemList";
import GroceryDashboard from "./components/GroceryDashboard";
import { useListStore } from "./store/applicationStore";

export const App = () => {
  const { groceryLists } = useListStore();
  return (
    <>
      <Header />
      <main className="page">
        <section className="welcome">
          <h2>Good things start with a list.</h2>
          <p>Plan your next shop, pick things up, and keep life moving.</p>
          <SearchBar />
        </section>
        <section className="create-card">
          <div className="section-heading">
            <h2>Create a list</h2>
            <p>Start with the essentials.</p>
          </div>
          <CreateItemList />
        </section>
        <GroceryDashboard lists={groceryLists} />
      </main>
    </>
  );
};

export default App;

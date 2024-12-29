import Basket from "../assets/basket.svg";
import { SearchBar } from "./SearchBar";

const Header = () => {
  const logo = <img src={Basket} alt="logo" />;
  return (
    <div className="header">
      {logo}
      <h3>GroceryBuddy</h3>
      <SearchBar />
    </div>
  );
};

export default Header;

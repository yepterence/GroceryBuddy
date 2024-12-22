import Basket from "../assets/basket.svg";

const Header = () => {
  const logo = <img src={Basket} alt="logo" />;
  return (
    <div className="header">
      {logo}
      <h3>GroceryBuddy</h3>
    </div>
  );
};

export default Header;

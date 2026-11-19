import SearchIcon from "../assets/search.svg";
import "../styles/theme.css";

export const SearchBar = () => {
  return (
    <div className="search">
      <img src={SearchIcon} alt="" width={20} height={20} />
      <input
        type="text"
        className="search-bar"
        placeholder="Search lists or items"
        aria-label="Search lists or items"
      />
    </div>
  );
};

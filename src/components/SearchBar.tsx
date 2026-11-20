import SearchIcon from "../assets/search.svg";
import "../styles/theme.css";
import { useSearchQueryStore } from "../store/applicationStore";

export const SearchBar = () => {
  const searchTerm = useSearchQueryStore((state) => state.searchTerm);
  const setSearchTerm = useSearchQueryStore((state) => state.setSearchTerm);

  return (
    <div className="search">
      <img src={SearchIcon} alt="" width={20} height={20} />
      <input
        type="text"
        className="search-bar"
        placeholder="Search lists or items"
        aria-label="Search lists or items"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );
};

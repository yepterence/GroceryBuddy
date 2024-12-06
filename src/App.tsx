import { useState } from "react";

import "./App.css";

let GroceryItems = [
  { category: "Vegetables", name: "Zucchini", checked: false },
  { category: "Vegetables", name: "Peppers", checked: false },
  { category: "Vegetables", name: "Peas", checked: false },
  { category: "Vegetables", name: "Carrots", checked: false },
  { category: "Vegetables", name: "Onions", checked: false },
  { category: "Vegetables", name: "Radish", checked: false },
];

function FilterableGroceryItems({ products }) {
  const [filterText, setFilterText] = useState("");
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  return (
    <>
      <SearchBar filterText={filterText} unchecked={uncheckedOnly} />
      <GroceryItemTable products={products} />
    </>
  );
}
function GroceryCategoryRow({ category }) {
  return (
    <tr>
      <th colSpan="2">{category}</th>
    </tr>
  );
}

function GroceryItemRow({ product }) {
  const name = product.checked ? (
    product.name
  ) : (
    <span style={{ color: "red" }}>{product.name}</span>
  );
  return (
    <tr>
      <td>
        <input type="checkbox" />
        {name}
      </td>
      <td>{product.price}</td>
    </tr>
  );
}

function GroceryItemTable({ products }) {
  const rows = [];
  let lastCategory = null;
  products.forEach((product) => {
    if (product.category !== lastCategory) {
      rows.push(
        <GroceryCategoryRow
          category={product.category}
          key={product.category}
        />
      );
    }

    rows.push(<GroceryItemRow product={product} key={product.name} />);
    lastCategory = product.category;
  });
  return (
    <table>
      <tbody>{rows}</tbody>
    </table>
  );
}
function SearchBar() {
  return (
    <form>
      <input type="text" placeholder="Search.." />
      <label>
        <input type="checkbox" />
        Only show unchecked items
      </label>
    </form>
  );
}

export default function App() {
  return <FilterableGroceryItems products={GroceryItems} />;
}

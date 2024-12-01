import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

let GroceryItems = [
  { category: "Vegetables", name: "Zucchini", checked: false },
  { category: "Vegetables", name: "Peppers", checked: false },
  { category: "Vegetables", name: "Peas", checked: false },
  { category: "Vegetables", name: "Carrots", checked: false },
  { category: "Vegetables", name: "Onions", checked: false },
  { category: "Vegetables", name: "Radish", checked: false },
];
function App() {
  function ProductCategoryRow({ category }) {
    return (
      <tr>
        <th colSpan="2">{category}</th>
      </tr>
    );
  }

  function ProductRow({ product }) {
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

  function ProductTable({ products }) {
    const rows = [];
    let lastCategory = null;
    products.forEach((product) => {
      if (product.category !== lastCategory) {
        rows.push(
          <ProductCategoryRow
            category={product.category}
            key={product.category}
          />
        );
      }

      rows.push(<ProductRow product={product} key={product.name} />);
      lastCategory = product.category;
    });
    return (
      <table>
        <tbody>{rows}</tbody>
      </table>
    );
  }

  return (
    <>
      <ProductTable products={GroceryItems} />
    </>
  );
}

export default App;

import { useState } from "react";

import "./styles/theme.css";

import { Products } from "./types";
import { SearchBar } from "./components/SearchBar";
import Header from "./components/Header";
import CreateItemList from "./components/CreateItemList";

let GroceryItems = [
  { category: "Vegetables", name: "Zucchini", checked: false },
  { category: "Vegetables", name: "Peppers", checked: false },
  { category: "Vegetables", name: "Peas", checked: false },
  { category: "Vegetables", name: "Carrots", checked: false },
  { category: "Vegetables", name: "Onions", checked: false },
  { category: "Vegetables", name: "Radish", checked: false },
];
export const App = () => {
  return (
    <>
      <Header />
      <SearchBar />
      <CreateItemList />
    </>
  );
  // const FilterableGroceryItem = ( products: Products ) => {
  //   const [filterText, setFilterText] = useState("");
  //   const [uncheckedOnly, setUncheckedOnly] = useState(false);
  //   return (
  //     <>
  //       <SearchBar filterText={filterText} unchecked={uncheckedOnly} />
  //       <GroceryItemTable products={products} />
  //     </>
  //   );
  // }
  // const GroceryCategoryRow = ( category: String ) => {
  //   return (
  //     <tr>
  //       <th colSpan="2">{category}</th>
  //     </tr>
  //   );
  // }
  // const GroceryItemRow = ( product: Product ) {
  //   const name = product.checked ? (
  //     product.name
  //   ) : (
  //     <span style={{ color: "red" }}>{product.name}</span>
  //   );
  //   return (
  //     <tr>
  //       <td>
  //         <input type="checkbox" />
  //         {name}
  //       </td>
  //       <td>{product.price}</td>
  //     </tr>
  //   );
  // }
  // const GroceryItemTable = ( products: Products ) => {
  //   const rows = [];
  //   let lastCategory = null;
  //   products.forEach((product) => {
  //     if (product.category !== lastCategory) {
  //       rows.push(
  //         <GroceryCategoryRow
  //           category={product.category}
  //           key={product.category}
  //         />
  //       );
  //     }
  //     rows.push(<GroceryItemRow product={product} key={product.name} />);
  //     lastCategory = product.category;
  //   });
  //   return (
  //     <table>
  //       <tbody>{rows}</tbody>
  //     </table>
  //   );
  // }
};

export default App;

export interface Item {
  id: string;
  name: string;
  checked: boolean;
}

export interface GroceryList {
  id: string;
  title: string;
  contents: Item[];
}

export interface GroceryLists {
  lists: GroceryList[];
}

export interface DropdownDetailsProps {
  price: string;
  store: string;
  brand: string;
}

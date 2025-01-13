import { create } from "zustand";

interface Item {
  id: string;
  name: string;
  checked: boolean;
}

interface GroceryList {
  title: string;
  items: Item[];
}

interface ListStore {
  groceryLists: { groceryList: GroceryList }[];
  addGroceryList: (gorceryList: GroceryList) => void;
}

export const useListStore = create<ListStore>((set) => ({
  groceryLists: [],
  addGroceryList: (groceryList: GroceryList) =>
    set((state) => ({
      groceryLists: [...state.groceryLists, { groceryList }],
    })),
}));

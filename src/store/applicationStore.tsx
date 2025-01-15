import { create } from "zustand";

interface Item {
  id: string;
  name: string;
  checked: boolean;
}

interface GroceryList {
  id: string;
  title: string;
  items: Item[];
}

interface ListStore {
  groceryLists: GroceryList[];
  addGroceryList: (gorceryList: GroceryList) => void;
}

export const useListStore = create<ListStore>((set) => ({
  groceryLists: [],
  addGroceryList: (groceryList: GroceryList) => {
    set((state) => {
      return {
        ...state,
        groceryLists: [...state.groceryLists, groceryList],
      };
    });
  },
}));

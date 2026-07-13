import { create, StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { GroceryList } from "../types";

interface ListStore {
  groceryLists: GroceryList[];
  addGroceryList: (groceryList: GroceryList) => void;
  toggleItemChecked: (listId: string, itemId: string) => void;
  updateListTitle: (listId: string, title: string) => void;
  removeItem: (listId: string, itemId: string) => void;
  deleteList: (listId: string) => void;
}

const store: StateCreator<ListStore> = (set) => ({
  groceryLists: [],
  addGroceryList: (groceryList) => {
    set((state) => ({
      groceryLists: [...state.groceryLists, groceryList],
    }));
  },
  toggleItemChecked: (listId: string, itemId: string) => {
    set((state) => ({
      groceryLists: state.groceryLists.map((list) =>
        list.id !== listId
          ? list
          : {
              ...list,
              contents: list.contents.map((item) =>
                item.id === itemId ? { ...item, checked: !item.checked } : item
              ),
            }
      ),
    }));
  },
  updateListTitle: (listId: string, title: string) => {
    set((state) => ({
      groceryLists: state.groceryLists.map((list) =>
        list.id === listId ? { ...list, title } : list
      ),
    }));
  },
  removeItem: (listId: string, itemId: string) => {
    set((state) => ({
      groceryLists: state.groceryLists.map((list) =>
        list.id === listId
          ? {
              ...list,
              contents: list.contents.filter((item) => item.id !== itemId),
            }
          : list
      ),
    }));
  },
  deleteList: (listId: string) => {
    set((state) => ({
      groceryLists: state.groceryLists.filter((list) => list.id !== listId),
    }));
  },
});

export const useListStore = create<ListStore>()(
  persist(store, { name: "grocery-list" }),
);

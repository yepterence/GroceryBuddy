import { beforeEach, describe, expect, it } from "vitest";
import { useListStore } from "./applicationStore";

const STORAGE_KEY = "grocery-list";

describe("applicationStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useListStore.setState({ groceryLists: [] });
  });

  it("adds a grocery list", () => {
    useListStore.getState().addGroceryList({
      id: "list-1",
      title: "Weekly",
      contents: [],
    });

    expect(useListStore.getState().groceryLists).toHaveLength(1);
    expect(useListStore.getState().groceryLists[0].title).toBe("Weekly");
  });

  it("appends an item onto one list", () => {
    useListStore.getState().addGroceryList({
      id: "list-1",
      title: "Weekly",
      contents: [],
    });

    useListStore.getState().addItemToList("list-1", {
      id: "item-1",
      name: "Milk",
      checked: false,
      source: "manual",
    });

    expect(useListStore.getState().groceryLists[0].contents).toEqual([
      { id: "item-1", name: "Milk", checked: false, source: "manual" },
    ]);
  });

  it("persists lists into localStorage", () => {
    useListStore.getState().addGroceryList({
      id: "list-2",
      title: "Fresh produce",
      contents: [],
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.groceryLists).toHaveLength(1);
    expect(parsed.state.groceryLists[0].title).toBe("Fresh produce");
  });
});

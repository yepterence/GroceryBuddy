import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateItemList from "./CreateItemList";
import { useListStore } from "../store/applicationStore";

describe("CreateItemList", () => {
  beforeEach(() => {
    localStorage.clear();
    useListStore.setState({ groceryLists: [] });
  });

  it("adds a list to the store when submitting", async () => {
    render(<CreateItemList />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Title"), "Saturday trip");
    await user.type(screen.getByPlaceholderText("New Item"), "Milk");
    fireEvent.keyDown(screen.getByPlaceholderText("New Item"), { key: "Enter" });
    await user.click(screen.getByRole("button", { name: "Add" }));

    const lists = useListStore.getState().groceryLists;
    expect(lists).toHaveLength(1);
    expect(lists[0].title).toBe("Saturday trip");
    expect(lists[0].contents).toHaveLength(1);
    expect(lists[0].contents[0].name).toBe("Milk");
  });
});

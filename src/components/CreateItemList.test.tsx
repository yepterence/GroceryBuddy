import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateItemList from "./CreateItemList";
import { useListStore } from "../store/applicationStore";
import { createList } from "../requests";

vi.mock("../requests", () => ({ createList: vi.fn() }));

const savedList = {
  id: "server-list-id",
  title: "Saturday trip",
  contents: [{ id: "server-item-id", name: "Milk", checked: false }],
};

const fillForm = async (title = "Saturday trip", item = "Milk") => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Title"), title);
  await user.type(screen.getByPlaceholderText("New Item"), item);
  fireEvent.keyDown(screen.getByPlaceholderText("New Item"), { key: "Enter" });
  return user;
};

describe("CreateItemList", () => {
  beforeEach(() => {
    localStorage.clear();
    useListStore.setState({ groceryLists: [] });
    vi.mocked(createList).mockResolvedValue(savedList);
  });

  it("saves the list through the API and stores the server's copy", async () => {
    render(<CreateItemList />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(useListStore.getState().groceryLists).toHaveLength(1),
    );
    expect(createList).toHaveBeenCalledWith("Saturday trip", ["Milk"]);
    // The store holds what the server returned (real ids), not locally made ones.
    expect(useListStore.getState().groceryLists[0]).toEqual(savedList);
  });

  it("clears the form after a successful save", async () => {
    render(<CreateItemList />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Title")).toHaveValue(""),
    );
    expect(screen.queryByText("Milk")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error and keeps the form when the save fails", async () => {
    vi.mocked(createList).mockRejectedValue(
      new Error("database unavailable, try again shortly"),
    );
    render(<CreateItemList />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "database unavailable, try again shortly",
    );
    expect(useListStore.getState().groceryLists).toHaveLength(0);
    // Nothing is lost, so the user can just retry.
    expect(screen.getByPlaceholderText("Title")).toHaveValue("Saturday trip");
    expect(screen.getByText("Milk")).toBeInTheDocument();
  });

  it("lets the user dismiss the error banner", async () => {
    vi.mocked(createList).mockRejectedValue(new Error("boom"));
    render(<CreateItemList />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Dismiss error" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Dismissing the message must not throw away what the user typed.
    expect(screen.getByPlaceholderText("Title")).toHaveValue("Saturday trip");
  });

  it("clears an old error when a retry succeeds", async () => {
    vi.mocked(createList).mockRejectedValueOnce(new Error("boom"));
    render(<CreateItemList />);
    const user = await fillForm();

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");

    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(useListStore.getState().groceryLists).toHaveLength(1);
  });

  it("disables the Add button while the save is in flight", async () => {
    let finish: (value: typeof savedList) => void = () => {};
    vi.mocked(createList).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<CreateItemList />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    finish(savedList);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add" })).toBeEnabled(),
    );
  });
});

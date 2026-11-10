import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateItemList from "./CreateItemList";
import { useListStore } from "../store/applicationStore";
import { createList, fetchRepurchaseSuggestions, recordOutcome } from "../requests";
import { Suggestion } from "../types";

vi.mock("../requests", () => ({
  createList: vi.fn(),
  fetchRepurchaseSuggestions: vi.fn(),
  recordOutcome: vi.fn(),
}));

const suggestion = (name: string, score: number): Suggestion => ({
  type: "repurchase",
  payload: {
    item_name: name,
    inclusion_count: 4,
    last_included_at: "2026-11-01T12:00:00+00:00",
    cadence_days: 7,
    next_due_at: "2026-11-08T12:00:00+00:00",
  },
  reason: `You've added ${name} to a list 4x; last time 9d ago.`,
  score,
});

const oatMilk = suggestion("oat milk", 0.9);
const eggs = suggestion("eggs", 0.7);

const offer = (...suggestions: Suggestion[]) =>
  vi.mocked(fetchRepurchaseSuggestions).mockResolvedValue({
    suggestions,
    knownItemNames: suggestions.map((s) => s.payload.item_name),
  });

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
    vi.mocked(createList).mockReset().mockResolvedValue(savedList);
    vi.mocked(recordOutcome).mockReset().mockResolvedValue(undefined);
    offer();
  });

  it("saves the list through the API and stores the server's copy", async () => {
    render(<CreateItemList />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(useListStore.getState().groceryLists).toHaveLength(1),
    );
    expect(createList).toHaveBeenCalledWith("Saturday trip", [
      { name: "Milk", source: "manual" },
    ]);
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

describe("CreateItemList suggestions", () => {
  beforeEach(() => {
    localStorage.clear();
    useListStore.setState({ groceryLists: [] });
    vi.mocked(createList).mockReset().mockResolvedValue(savedList);
    vi.mocked(recordOutcome).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const newItemInput = () => screen.getByPlaceholderText("New Item");

  const addItems = async (user: ReturnType<typeof userEvent.setup>, ...names: string[]) => {
    for (const name of names) await user.type(newItemInput(), `${name}{Enter}`);
  };

  const outcomes = (action: "accepted" | "dismissed") =>
    vi.mocked(recordOutcome).mock.calls.filter(([, a]) => a === action);

  it("shows nothing until the draft has two Items, then the top Suggestion and why", async () => {
    offer(oatMilk, eggs);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await waitFor(() => expect(fetchRepurchaseSuggestions).toHaveBeenCalled());

    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
    await addItems(user, "Bread");
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();

    await addItems(user, "Butter");
    const bubble = await screen.findByRole("group", { name: "Suggestion" });
    expect(bubble).toHaveTextContent("oat milk");
    expect(bubble).toHaveTextContent(oatMilk.reason);
    expect(bubble).not.toHaveTextContent("eggs");
  });

  it("skips a Suggestion already on the draft", async () => {
    offer(oatMilk, eggs);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await addItems(user, "Oat  Milk", "Bread");

    expect(await screen.findByRole("group", { name: "Suggestion" })).toHaveTextContent("eggs");
  });

  it("accepting one Suggestion adds exactly one Item and saves it as a suggestion", async () => {
    offer(oatMilk);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await user.type(screen.getByPlaceholderText("Title"), "Weekly");
    await addItems(user, "Bread", "Butter");

    await user.click(await screen.findByRole("button", { name: "Add oat milk" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent("Added to Weekly");
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(outcomes("accepted")).toHaveLength(1));
    expect(createList).toHaveBeenCalledWith("Weekly", [
      { name: "Bread", source: "manual" },
      { name: "Butter", source: "manual" },
      { name: "oat milk", source: "suggestion" },
    ]);
    expect(recordOutcome).toHaveBeenCalledWith(oatMilk, "accepted");
  });

  it("accepting several Suggestions one at a time adds each as its own Item", async () => {
    offer(oatMilk, eggs);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await addItems(user, "Bread", "Butter");

    await user.click(await screen.findByRole("button", { name: "Add oat milk" }));
    expect(screen.getByRole("status")).toHaveTextContent("Added to this list");
    await user.click(await screen.findByRole("button", { name: "Add eggs" }));

    const names = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(names).toEqual(["Bread", "Butter", "oat milk", "eggs"]);
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
  });

  it("dismissing sends a dismissed Outcome and moves to the next Suggestion", async () => {
    offer(oatMilk, eggs);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await addItems(user, "Bread", "Butter");
    await screen.findByRole("button", { name: "Add oat milk" });

    await user.click(screen.getByRole("button", { name: "Dismiss suggestion" }));

    expect(recordOutcome).toHaveBeenCalledWith(oatMilk, "dismissed");
    expect(await screen.findByRole("group", { name: "Suggestion" })).toHaveTextContent("eggs");
    await user.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
  });

  it("saving does not dismiss Suggestions the Shopper left alone", async () => {
    offer(oatMilk, eggs);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await addItems(user, "Bread", "Butter");
    await screen.findByRole("group", { name: "Suggestion" });

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(useListStore.getState().groceryLists).toHaveLength(1));
    expect(recordOutcome).not.toHaveBeenCalled();
    // The cleared draft has no Items, so the Suggestion is hidden again.
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
  });

  it("typing over a Suggestion dismisses it once and keeps the typed text", async () => {
    offer(oatMilk, eggs);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await addItems(user, "Bread", "Butter");
    await screen.findByRole("button", { name: "Add oat milk" });

    await user.type(newItemInput(), "jam");

    expect(outcomes("dismissed")).toEqual([[oatMilk, "dismissed"]]);
    expect(newItemInput()).toHaveValue("jam");
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();

    await user.clear(newItemInput());
    expect(await screen.findByRole("group", { name: "Suggestion" })).toHaveTextContent("eggs");
    expect(outcomes("dismissed")).toHaveLength(1);
  });

  it("typing the dismissed Item's own name saves it as a manual Addition", async () => {
    offer(oatMilk);
    const user = userEvent.setup();
    render(<CreateItemList />);
    await addItems(user, "Bread", "Butter");
    await screen.findByRole("button", { name: "Add oat milk" });

    await addItems(user, "oat milk");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createList).toHaveBeenCalled());
    expect(vi.mocked(createList).mock.calls[0][1]).toContainEqual({
      name: "oat milk",
      source: "manual",
    });
    expect(outcomes("accepted")).toHaveLength(0);
  });

  it("collapses to a chip after 10 seconds without dismissing; the chip restarts the timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    offer(oatMilk);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CreateItemList />);
    await addItems(user, "Bread", "Butter");
    await screen.findByRole("group", { name: "Suggestion" });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const chip = screen.getByRole("button", { name: "Show suggestion: oat milk" });
    expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
    expect(recordOutcome).not.toHaveBeenCalled();

    await user.click(chip);
    expect(screen.getByRole("group", { name: "Suggestion" })).toHaveTextContent("oat milk");

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(screen.getByRole("group", { name: "Suggestion" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("button", { name: "Show suggestion: oat milk" })).toBeInTheDocument();
    expect(recordOutcome).not.toHaveBeenCalled();
  });
});

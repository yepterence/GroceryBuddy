import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GroceryDashboard from "./GroceryDashboard";
import CreateItemList from "./CreateItemList";
import { useListStore, useSearchQueryStore } from "../store/applicationStore";
import {
  addItem,
  createList,
  fetchLists,
  fetchRepurchaseSuggestions,
  recordOutcome,
  removeItem,
  removeList,
  setItemChecked,
} from "../requests";
import { Suggestion } from "../types";
import { GroceryList } from "../types";

vi.mock("../requests", () => ({
  createList: vi.fn(),
  fetchLists: vi.fn(),
  removeItem: vi.fn(),
  removeList: vi.fn(),
  setItemChecked: vi.fn(),
  addItem: vi.fn(),
  fetchRepurchaseSuggestions: vi.fn(async () => ({ suggestions: [], knownItemNames: [] })),
  recordOutcome: vi.fn(),
}));

const weekly: GroceryList = {
  id: "list-1",
  title: "Weekly",
  contents: [
    { id: "item-1", name: "Milk", checked: false },
    { id: "item-2", name: "Eggs", checked: true },
  ],
};

// A fresh client per test (and per simulated page load) so no cache leaks between them;
// retries are off so failures show immediately.
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
let client = makeClient();

// App passes the store's lists down as a prop; mirror that here.
const Harness = () => {
  const lists = useListStore((state) => state.groceryLists);
  return (
    <QueryClientProvider client={client}>
      <GroceryDashboard lists={lists} />
    </QueryClientProvider>
  );
};

describe("GroceryDashboard", () => {
  beforeEach(() => {
    client = makeClient();
    localStorage.clear();
    useListStore.setState({ groceryLists: [] });
    useSearchQueryStore.setState({ searchTerm: "" });
    vi.mocked(fetchLists).mockResolvedValue([weekly]);
    vi.mocked(removeList).mockResolvedValue(undefined);
    vi.mocked(removeItem).mockResolvedValue(undefined);
    vi.mocked(setItemChecked).mockResolvedValue({
      id: "item-1",
      name: "Milk",
      checked: true,
    });
  });

  describe("searching", () => {
    const party: GroceryList = {
      id: "list-2",
      title: "Party",
      contents: [{ id: "item-3", name: "Chips", checked: false }],
    };

    const renderWithTwoLists = async () => {
      vi.mocked(fetchLists).mockResolvedValue([weekly, party]);
      render(<Harness />);
      await screen.findByText("Weekly");
    };

    const search = (term: string) => useSearchQueryStore.setState({ searchTerm: term });

    it("shows every list when the term is empty", async () => {
      await renderWithTwoLists();

      expect(screen.getByText("Weekly")).toBeInTheDocument();
      expect(screen.getByText("Party")).toBeInTheDocument();
      expect(document.querySelector(".list-item-match")).toBeNull();
    });

    it("matches a list by title, case-insensitively and trimmed", async () => {
      await renderWithTwoLists();

      act(() => search("  PARTY "));

      expect(screen.getByRole("heading", { name: "Party" })).toBeInTheDocument();
      expect(screen.queryByText("Weekly")).not.toBeInTheDocument();
      expect(document.querySelector(".list-item-match")).toBeNull();
    });

    it("highlights the term inside the title", async () => {
      await renderWithTwoLists();

      act(() => search("art"));

      const marks = screen.getByRole("heading", { name: "Party" }).querySelectorAll("mark");
      expect(marks).toHaveLength(1);
      expect(marks[0]).toHaveTextContent("art");
    });

    it("shows the list containing a matching item and highlights that item", async () => {
      await renderWithTwoLists();

      act(() => search("milk"));

      expect(screen.getByText("Weekly")).toBeInTheDocument();
      expect(screen.queryByText("Party")).not.toBeInTheDocument();
      expect(screen.getByText("Eggs")).toBeInTheDocument();
      expect(screen.getByText("Milk").closest("li")).toHaveClass("list-item-match");
      expect(screen.getByText("Eggs").closest("li")).not.toHaveClass("list-item-match");
    });

    it("shows No match found when nothing matches", async () => {
      await renderWithTwoLists();

      act(() => search("zzz"));

      expect(screen.getByText("No match found")).toBeInTheDocument();
      expect(screen.queryByText("Weekly")).not.toBeInTheDocument();
    });

    it("restores every list when the search is cleared, without touching the store", async () => {
      await renderWithTwoLists();

      act(() => search("zzz"));
      act(() => search(""));

      expect(screen.getByText("Weekly")).toBeInTheDocument();
      expect(screen.getByText("Party")).toBeInTheDocument();
      expect(screen.queryByText("No match found")).not.toBeInTheDocument();
      expect(useListStore.getState().groceryLists).toHaveLength(2);
    });
  });

  describe("loading saved lists", () => {
    it("fetches lists on mount and shows them", async () => {
      render(<Harness />);

      expect(await screen.findByText("Weekly")).toBeInTheDocument();
      expect(fetchLists).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Milk")).toBeInTheDocument();
      expect(screen.getByText("Eggs")).toBeInTheDocument();
      expect(useListStore.getState().groceryLists).toEqual([weekly]);
    });

    it("replaces stale local lists with what the server has", async () => {
      useListStore.setState({
        groceryLists: [{ id: "old", title: "Local only", contents: [] }],
      });
      render(<Harness />);

      expect(await screen.findByText("Weekly")).toBeInTheDocument();
      expect(screen.queryByText("Local only")).not.toBeInTheDocument();
    });

    it("shows an error when the lists cannot be loaded", async () => {
      vi.mocked(fetchLists).mockRejectedValue(
        new Error("Could not reach the server. Check your connection."),
      );
      render(<Harness />);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not reach the server",
      );
    });

    it("lets the user dismiss the load error", async () => {
      vi.mocked(fetchLists).mockRejectedValue(new Error("offline"));
      render(<Harness />);
      await screen.findByRole("alert");

      await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss error" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("keeps showing cached lists when loading fails", async () => {
      useListStore.setState({ groceryLists: [weekly] });
      vi.mocked(fetchLists).mockRejectedValue(new Error("offline"));
      render(<Harness />);

      expect(await screen.findByRole("alert")).toHaveTextContent("offline");
      expect(screen.getByText("Weekly")).toBeInTheDocument();
    });
  });

  describe("checking items", () => {
    it("saves the new checked state, then updates the item", async () => {
      render(<Harness />);
      await screen.findByText("Weekly");
      const user = userEvent.setup();

      const [milkBox] = screen.getAllByRole("checkbox");
      expect(milkBox).not.toBeChecked();
      await user.click(milkBox);

      expect(setItemChecked).toHaveBeenCalledWith("item-1", true);
      await waitFor(() => expect(screen.getAllByRole("checkbox")[0]).toBeChecked());
    });

    it("unchecks a checked item", async () => {
      render(<Harness />);
      await screen.findByText("Weekly");
      const user = userEvent.setup();

      await user.click(screen.getAllByRole("checkbox")[1]);

      expect(setItemChecked).toHaveBeenCalledWith("item-2", false);
      await waitFor(() =>
        expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked(),
      );
    });

    it("leaves the item unchanged and shows an error if saving fails", async () => {
      vi.mocked(setItemChecked).mockRejectedValue(new Error("item not found"));
      render(<Harness />);
      await screen.findByText("Weekly");
      const user = userEvent.setup();

      await user.click(screen.getAllByRole("checkbox")[0]);

      expect(await screen.findByRole("alert")).toHaveTextContent("item not found");
      expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
    });
  });

  describe("deleting lists", () => {
    it("deletes through the API, then removes the list", async () => {
      render(<Harness />);
      await screen.findByText("Weekly");
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Delete Weekly" }));

      expect(removeList).toHaveBeenCalledWith("list-1");
      await waitFor(() =>
        expect(screen.queryByText("Weekly")).not.toBeInTheDocument(),
      );
      expect(useListStore.getState().groceryLists).toEqual([]);
    });

    it("keeps the list and shows an error if the delete fails", async () => {
      vi.mocked(removeList).mockRejectedValue(new Error("list not found"));
      render(<Harness />);
      await screen.findByText("Weekly");
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Delete Weekly" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("list not found");
      expect(screen.getByText("Weekly")).toBeInTheDocument();
    });
  });

  describe("removing an item", () => {
    it("deletes the line through the API, then drops it from the list", async () => {
      render(<Harness />);
      await screen.findByText("Milk");
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Remove Milk" }));

      expect(removeItem).toHaveBeenCalledWith("item-1");
      await waitFor(() => expect(screen.queryByText("Milk")).not.toBeInTheDocument());
      expect(screen.getByText("Eggs")).toBeInTheDocument();
    });

    it("keeps the line and shows an error if the remove fails", async () => {
      vi.mocked(removeItem).mockRejectedValue(new Error("item not found"));
      render(<Harness />);
      await screen.findByText("Milk");
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Remove Milk" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("item not found");
      expect(screen.getByText("Milk")).toBeInTheDocument();
    });
  });

  describe("adding an item to a saved list", () => {
    const suggestion = (name: string): Suggestion => ({
      type: "repurchase",
      payload: {
        item_name: name,
        inclusion_count: 4,
        last_included_at: "2026-11-01T12:00:00+00:00",
        cadence_days: 7,
        next_due_at: "2026-11-08T12:00:00+00:00",
      },
      reason: `You've added ${name} to a list 4x; last time 9d ago.`,
      score: 0.9,
    });
    const oatMilk = suggestion("oat milk");

    const saturday: GroceryList = {
      id: "list-3",
      title: "Saturday trip",
      contents: [
        { id: "b1", name: "doodh", checked: false, source: "manual" },
        { id: "b2", name: "atta", checked: false, source: "manual" },
      ],
    };

    beforeEach(() => {
      vi.mocked(addItem).mockReset();
      vi.mocked(recordOutcome).mockReset().mockResolvedValue(undefined);
      vi.mocked(fetchRepurchaseSuggestions)
        .mockReset()
        .mockResolvedValue({ suggestions: [], knownItemNames: [] });
    });

    const openSlot = async (title: string) => {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: `Add item to ${title}` }));
      return user;
    };

    it("saves a typed Item on that list", async () => {
      vi.mocked(addItem).mockResolvedValue({
        id: "item-9",
        name: "Cheese",
        checked: false,
        source: "manual",
      });
      render(<Harness />);
      await screen.findByText("Weekly");

      const user = await openSlot("Weekly");
      const input = screen.getByRole("textbox", { name: "New item on Weekly" });
      await user.type(input, "Cheese");
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => expect(screen.getByText("Cheese")).toBeInTheDocument());
      expect(addItem).toHaveBeenCalledWith("list-1", "Cheese", "manual");
    });

    it("offers a Suggestion on a grocery list and adds it with one tap", async () => {
      vi.mocked(fetchRepurchaseSuggestions).mockResolvedValue({
        suggestions: [oatMilk],
        knownItemNames: [],
      });
      vi.mocked(addItem).mockResolvedValue({
        id: "item-9",
        name: "oat milk",
        checked: false,
        source: "suggestion",
      });
      render(<Harness />);
      await screen.findByText("Weekly");

      const user = await openSlot("Weekly");

      await waitFor(() =>
        expect(fetchRepurchaseSuggestions).toHaveBeenCalledWith("list-1"),
      );
      await user.click(await screen.findByRole("button", { name: "Add oat milk" }));

      expect(addItem).toHaveBeenCalledWith("list-1", "oat milk", "suggestion");
      expect(recordOutcome).toHaveBeenCalledWith(oatMilk, "accepted");
      expect(await screen.findByRole("status")).toHaveTextContent("Added to Weekly");
      expect(screen.getByText("oat milk")).toBeInTheDocument();
    });

    it("hides Suggestions on an event list", async () => {
      vi.mocked(fetchLists).mockResolvedValue([
        { id: "list-2", title: "Birthday party", contents: [] },
      ]);
      vi.mocked(fetchRepurchaseSuggestions).mockResolvedValue({
        suggestions: [oatMilk],
        knownItemNames: ["milk", "eggs"],
      });
      render(<Harness />);
      await screen.findByText("Birthday party");

      await openSlot("Birthday party");
      await waitFor(() => expect(fetchRepurchaseSuggestions).toHaveBeenCalled());

      expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
    });

    it("uses familiar Items from other lists, and ignores this list's own", async () => {
      vi.mocked(fetchLists).mockResolvedValue([saturday]);
      vi.mocked(fetchRepurchaseSuggestions).mockResolvedValue({
        suggestions: [oatMilk],
        knownItemNames: [],
      });
      const first = render(<Harness />);
      await screen.findByText("Saturday trip");
      await openSlot("Saturday trip");
      await waitFor(() => expect(fetchRepurchaseSuggestions).toHaveBeenCalledWith("list-3"));
      expect(screen.queryByRole("group", { name: "Suggestion" })).not.toBeInTheDocument();
      first.unmount();

      client = makeClient();
      vi.mocked(fetchRepurchaseSuggestions).mockResolvedValue({
        suggestions: [oatMilk],
        knownItemNames: ["doodh", "atta"],
      });
      render(<Harness />);
      await screen.findByText("Saturday trip");
      await openSlot("Saturday trip");

      expect(await screen.findByRole("group", { name: "Suggestion" })).toHaveTextContent(
        "oat milk",
      );
    });

    it("lays the suggestion bubble after the new-item field on the same row", async () => {
      vi.mocked(fetchRepurchaseSuggestions).mockResolvedValue({
        suggestions: [oatMilk],
        knownItemNames: [],
      });
      render(<Harness />);
      await screen.findByText("Weekly");
      await openSlot("Weekly");
      await waitFor(() =>
        expect(fetchRepurchaseSuggestions).toHaveBeenCalledWith("list-1"),
      );

      const input = screen.getByRole("textbox", { name: "New item on Weekly" });
      const row = input.closest("li");
      expect(row).toHaveClass("composer-row");
      const suggestion = await screen.findByRole("group", { name: "Suggestion" });
      expect(input.compareDocumentPosition(suggestion)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  describe("adding a list and refreshing the page", () => {
    // A tiny fake server, so a "refresh" can read back what was saved.
    let server: GroceryList[];

    // Same wiring as App: the create form above the dashboard.
    const Page = () => (
      <>
        <CreateItemList />
        <Harness />
      </>
    );

    // A page reload starts with an empty query cache.
    const reloadPage = () => {
      client = makeClient();
    };

    const addList = async (title: string, item: string) => {
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText("Title"), title);
      await user.type(screen.getByPlaceholderText("New Item"), item);
      fireEvent.keyDown(screen.getByPlaceholderText("New Item"), { key: "Enter" });
      await user.click(screen.getByRole("button", { name: "Create list" }));
    };

    // A reload wipes memory but keeps localStorage, which zustand's persist restores.
    const simulateReload = async () => {
      const persisted = localStorage.getItem("grocery-list");
      useListStore.setState({ groceryLists: [] });
      if (persisted) localStorage.setItem("grocery-list", persisted);
      await useListStore.persist.rehydrate();
    };

    beforeEach(() => {
      server = [];
      vi.mocked(fetchLists).mockImplementation(async () => [...server]);
      vi.mocked(createList).mockImplementation(async (title, items) => {
        const n = server.length + 1;
        const saved: GroceryList = {
          id: `list-${n}`,
          title,
          contents: items.map(({ name }, i) => ({
            id: `item-${n}-${i}`,
            name,
            checked: false,
          })),
        };
        server.push(saved);
        return saved;
      });
    });

    it("shows a newly created list on the dashboard", async () => {
      render(<Page />);
      await waitFor(() => expect(fetchLists).toHaveBeenCalled());

      await addList("Saturday trip", "Bread");

      expect(
        await screen.findByRole("heading", { level: 3, name: "Saturday trip" }),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole("listitem").some((li) => li.textContent?.replace(/×/g, "") === "Bread"),
      ).toBe(true);
      expect(createList).toHaveBeenCalledWith("Saturday trip", [
        { name: "Bread", source: "manual" },
      ]);
    });

    it("writes the new list to the local cache", async () => {
      render(<Page />);
      await addList("Saturday trip", "Bread");
      await screen.findByRole("heading", { level: 3, name: "Saturday trip" });

      const cached = JSON.parse(localStorage.getItem("grocery-list")!);
      expect(cached.state.groceryLists.map((l: GroceryList) => l.title)).toEqual([
        "Saturday trip",
      ]);
    });

    it("still shows the list after a refresh, loaded from the server", async () => {
      const first = render(<Page />);
      await addList("Saturday trip", "Bread");
      await screen.findByRole("heading", { level: 3, name: "Saturday trip" });
      first.unmount();

      // Strictest case: a fresh browser with no local cache at all.
      reloadPage();
      localStorage.clear();
      useListStore.setState({ groceryLists: [] });
      render(<Page />);

      expect(
        await screen.findByRole("heading", { level: 3, name: "Saturday trip" }),
      ).toBeInTheDocument();
      expect(createList).toHaveBeenCalledTimes(1); // restored, not saved again
    });

    it("shows the cached list after a refresh even if the server is unreachable", async () => {
      const first = render(<Page />);
      await addList("Saturday trip", "Bread");
      await screen.findByRole("heading", { level: 3, name: "Saturday trip" });
      first.unmount();

      vi.mocked(fetchLists).mockRejectedValue(new Error("Could not reach the server"));
      reloadPage();
      await simulateReload();
      render(<Page />);

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
      expect(
        screen.getByRole("heading", { level: 3, name: "Saturday trip" }),
      ).toBeInTheDocument();
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GroceryDashboard from "./GroceryDashboard";
import CreateItemList from "./CreateItemList";
import { useListStore } from "../store/applicationStore";
import { createList, fetchLists, removeList, setItemChecked } from "../requests";
import { GroceryList } from "../types";

vi.mock("../requests", () => ({
  createList: vi.fn(),
  fetchLists: vi.fn(),
  removeList: vi.fn(),
  setItemChecked: vi.fn(),
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
    vi.mocked(fetchLists).mockResolvedValue([weekly]);
    vi.mocked(removeList).mockResolvedValue(undefined);
    vi.mocked(setItemChecked).mockResolvedValue({
      id: "item-1",
      name: "Milk",
      checked: true,
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
      await user.click(screen.getByRole("button", { name: "Add" }));
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
      vi.mocked(createList).mockImplementation(async (title, names) => {
        const n = server.length + 1;
        const saved: GroceryList = {
          id: `list-${n}`,
          title,
          contents: names.map((name, i) => ({ id: `item-${n}-${i}`, name, checked: false })),
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
      expect(screen.getByRole("listitem")).toHaveTextContent("Bread");
      expect(createList).toHaveBeenCalledWith("Saturday trip", ["Bread"]);
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

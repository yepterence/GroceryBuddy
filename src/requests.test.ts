import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  addItem,
  createList,
  fetchList,
  fetchLists,
  getUserId,
  removeList,
  setItemChecked,
} from "./requests";

const apiList = {
  id: "list-1",
  title: "Weekly",
  items: [{ id: "item-1", name: "Milk", checked: false, created_at: "2026-10-20" }],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const fetchMock = vi.fn();

// Method, URL and parsed JSON body of the Nth fetch call.
const call = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  };
};

describe("requests", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getUserId", () => {
    it("creates an id once and reuses it", () => {
      const first = getUserId();
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(getUserId()).toBe(first);
      expect(localStorage.getItem("grocery-buddy-user-id")).toBe(first);
    });
  });

  describe("createList", () => {
    it("POSTs the title, item names and user id, and maps items to contents", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: "success", list: apiList }, 201));

      const list = await createList("Weekly", ["Milk"]);

      const sent = call();
      expect(sent.url).toBe("/api/lists");
      expect(sent.method).toBe("POST");
      expect(sent.body).toEqual({
        user_id: getUserId(),
        title: "Weekly",
        items: ["Milk"],
      });
      expect(list).toEqual({
        id: "list-1",
        title: "Weekly",
        contents: [{ id: "item-1", name: "Milk", checked: false }],
      });
    });

    it("sends a JSON content type", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ list: apiList }, 201));
      await createList("Weekly", []);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
    });
  });

  describe("fetchLists", () => {
    it("GETs the lists for this user", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: "success", lists: [apiList] }));

      const lists = await fetchLists();

      const sent = call();
      expect(sent.method).toBe("GET");
      expect(sent.url).toBe(`/api/lists?user_id=${getUserId()}`);
      expect(lists).toHaveLength(1);
      expect(lists[0].contents[0].name).toBe("Milk");
    });

    it("returns an empty array when the user has no lists", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: "success", lists: [] }));
      expect(await fetchLists()).toEqual([]);
    });
  });

  describe("fetchList", () => {
    it("GETs one list by id", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ list: apiList }));

      const list = await fetchList("list-1");

      expect(call().url).toBe(`/api/lists/list-1?user_id=${getUserId()}`);
      expect(list.title).toBe("Weekly");
    });

    it("rejects with a 404 ApiError for a list that is not yours", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ status: "error", message: "list not found" }, 404),
      );

      await expect(fetchList("nope")).rejects.toMatchObject({
        name: "ApiError",
        status: 404,
        message: "list not found",
      });
    });
  });

  describe("removeList", () => {
    it("DELETEs the list", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: "success" }));

      await removeList("list-1");

      expect(call().method).toBe("DELETE");
      expect(call().url).toBe(`/api/lists/list-1?user_id=${getUserId()}`);
    });
  });

  describe("addItem", () => {
    it("POSTs the item name to the list", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ item: { id: "item-9", name: "Cheese", checked: false } }, 201),
      );

      const item = await addItem("list-1", "Cheese");

      expect(call().url).toBe("/api/lists/list-1/items");
      expect(call().method).toBe("POST");
      expect(call().body).toEqual({ user_id: getUserId(), name: "Cheese" });
      expect(item).toEqual({ id: "item-9", name: "Cheese", checked: false });
    });
  });

  describe("setItemChecked", () => {
    it("PATCHes the checked state", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ item: { id: "item-1", name: "Milk", checked: true } }),
      );

      const item = await setItemChecked("item-1", true);

      expect(call().url).toBe("/api/items/item-1");
      expect(call().method).toBe("PATCH");
      expect(call().body).toEqual({ user_id: getUserId(), checked: true });
      expect(item.checked).toBe(true);
    });
  });

  describe("errors", () => {
    it("uses the server's message", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ status: "error", message: "title is required" }, 400),
      );

      const error = await createList("", []).catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(400);
      expect(error.message).toBe("title is required");
    });

    it("surfaces a 503 when the database is down", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { status: "error", message: "database unavailable, try again shortly" },
          503,
        ),
      );

      await expect(fetchLists()).rejects.toMatchObject({
        status: 503,
        message: "database unavailable, try again shortly",
      });
    });

    it("falls back to a generic message for non-JSON error responses", async () => {
      fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

      await expect(fetchLists()).rejects.toMatchObject({
        status: 502,
        message: "Request failed (502)",
      });
    });

    it("reports status 0 when the server cannot be reached", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(fetchLists()).rejects.toMatchObject({
        name: "ApiError",
        status: 0,
        message: expect.stringContaining("Could not reach the server"),
      });
    });
  });
});

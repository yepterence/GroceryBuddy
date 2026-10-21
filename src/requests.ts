import { GroceryList, Item } from "./types";

// In dev, Vite proxies /api to the Sanic server (see vite.config.ts), so no CORS
// setup is needed. Override with VITE_API_URL to call the API directly.
const API_BASE: string = import.meta.env.VITE_API_URL ?? "/api";

const USER_ID_KEY = "grocery-buddy-user-id";

/** Error from the API or the network. `status` is 0 when the server was unreachable. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Shapes returned by the API (api/api.py). The UI calls an item list `contents`.
interface ApiItem {
  id: string;
  name: string;
  checked: boolean;
}

interface ApiList {
  id: string;
  title: string;
  items: ApiItem[];
}

/**
 * There is no login yet: the API scopes every row by an anonymous user id, so this
 * browser generates one on first use and keeps it. Clearing site data creates a new
 * (empty) user. Real auth must replace this before production.
 */
export const getUserId = (): string => {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    // needs a secure context: https, or http on localhost.
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
};

const toItem = (item: ApiItem): Item => ({
  id: item.id,
  name: item.name,
  checked: item.checked,
});

const toList = (list: ApiList): GroceryList => ({
  id: list.id,
  title: list.title,
  contents: list.items.map(toItem),
});

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page); fall through to the status check.
  }

  if (!response.ok) {
    const message =
      (body as { message?: string } | null)?.message ??
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return body as T;
};

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const userQuery = () => `user_id=${encodeURIComponent(getUserId())}`;

/** POST /lists: save a list and its items. */
export const createList = async (
  title: string,
  itemNames: string[],
): Promise<GroceryList> => {
  const data = await request<{ list: ApiList }>(
    "/lists",
    jsonInit("POST", { user_id: getUserId(), title, items: itemNames }),
  );
  return toList(data.list);
};

/** GET /lists: all of this user's lists. */
export const fetchLists = async (): Promise<GroceryList[]> => {
  const data = await request<{ lists: ApiList[] }>(`/lists?${userQuery()}`);
  return data.lists.map(toList);
};

/** GET /lists/<id>: one list. Rejects with status 404 if it is not this user's. */
export const fetchList = async (listId: string): Promise<GroceryList> => {
  const data = await request<{ list: ApiList }>(
    `/lists/${encodeURIComponent(listId)}?${userQuery()}`,
  );
  return toList(data.list);
};

/** DELETE /lists/<id>. */
export const removeList = async (listId: string): Promise<void> => {
  await request<unknown>(`/lists/${encodeURIComponent(listId)}?${userQuery()}`, {
    method: "DELETE",
  });
};

/** POST /lists/<id>/items: add an item to an existing list. */
export const addItem = async (listId: string, name: string): Promise<Item> => {
  const data = await request<{ item: ApiItem }>(
    `/lists/${encodeURIComponent(listId)}/items`,
    jsonInit("POST", { user_id: getUserId(), name }),
  );
  return toItem(data.item);
};

/** PATCH /items/<id>: check or uncheck an item. */
export const setItemChecked = async (
  itemId: string,
  checked: boolean,
): Promise<Item> => {
  const data = await request<{ item: ApiItem }>(
    `/items/${encodeURIComponent(itemId)}`,
    jsonInit("PATCH", { user_id: getUserId(), checked }),
  );
  return toItem(data.item);
};

import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GroceryLists, GroceryList, Item } from "../types";
import { useListStore } from "../store/applicationStore";
import { fetchLists, removeList, setItemChecked } from "../requests";
import { LISTS_QUERY_KEY } from "../queryClient";
import Banner from "./Banner";

const messageFrom = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const GroceryDashboard = ({ lists }: GroceryLists) => {
  const setGroceryLists = useListStore((state) => state.setGroceryLists);
  const toggleItemChecked = useListStore((state) => state.toggleItemChecked);
  const deleteList = useListStore((state) => state.deleteList);
  // Errors from check/delete actions.
  const [actionError, setActionError] = useState<string | null>(null);
  // The load error the user already dismissed (compared by identity, so a new
  // failure shows again).
  const [dismissedLoadError, setDismissedLoadError] = useState<unknown>(null);

  // Load this user's saved lists from the API. TanStack Query handles the loading
  // state, caching, one retry, and refetching when the window regains focus.
  const { data: savedLists, error: loadError } = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => fetchLists(),
  });

  // The store still drives the UI (and the offline cache); mirror the server's
  // lists into it whenever fresh data arrives.
  useEffect(() => {
    if (savedLists) setGroceryLists(savedLists);
  }, [savedLists, setGroceryLists]);

  const loadErrorMessage =
    loadError && loadError !== dismissedLoadError
      ? messageFrom(loadError, "Could not load your lists.")
      : null;

  const dismissError = () => {
    setActionError(null);
    setDismissedLoadError(loadError);
  };

  // Persist first; only update the UI once the server confirmed the change.
  const handleToggle = async (listId: string, item: Item) => {
    setActionError(null);
    try {
      await setItemChecked(item.id, !item.checked);
      toggleItemChecked(listId, item.id);
    } catch (err) {
      setActionError(messageFrom(err, "Could not update the item."));
    }
  };

  const handleDelete = async (listId: string) => {
    setActionError(null);
    try {
      await removeList(listId);
      deleteList(listId);
    } catch (err) {
      setActionError(messageFrom(err, "Could not delete the list."));
    }
  };

  return (
    <>
      <h2>Grocery List Dashboard</h2>
      <Banner
        type="error"
        message={actionError ?? loadErrorMessage}
        onDismiss={dismissError}
      />
      <div className="lists">
        {lists &&
          lists.map((newList: GroceryList) => (
            <Fragment key={newList.id}>
              <h3>{newList.title}</h3>
              <button
                type="button"
                aria-label={`Delete ${newList.title}`}
                onClick={() => handleDelete(newList.id)}
              >
                Delete
              </button>
              <div>
                <ul>
                  {newList.contents.map((item: Item) => (
                    <li key={item.id}>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        className={
                          item.checked ? "list-item-checked" : "list-item"
                        }
                        onChange={() => handleToggle(newList.id, item)}
                      />
                      {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            </Fragment>
          ))}
      </div>
    </>
  );
};

export default GroceryDashboard;

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "./SearchBar";
import { useSearchQueryStore } from "../store/applicationStore";

describe("SearchBar", () => {
  beforeEach(() => {
    useSearchQueryStore.setState({ searchTerm: "" });
  });

  it("writes what the user types into the search store", async () => {
    render(<SearchBar />);

    await userEvent.type(screen.getByLabelText("Search lists or items"), "milk");

    expect(useSearchQueryStore.getState().searchTerm).toBe("milk");
    expect(screen.getByLabelText("Search lists or items")).toHaveValue("milk");
  });
});

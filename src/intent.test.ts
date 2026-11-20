import { describe, expect, it } from "vitest";
import seasonalEvents from "./data/seasonal-events.json";
import { hasGroceryIntent, nextSeasonalCompanion, seasonalCompanions } from "./intent";
import { ItemSource } from "./types";

const item = (name: string, source: ItemSource = "manual") => ({ name, source });

const intent = (
  title: string,
  items: { name: string; source?: ItemSource }[],
  knownItemNames: string[],
) => hasGroceryIntent({ title, items, knownItemNames });

describe("seasonal events will refer to maintained list to produce recommendations", () => {
  it("names each occasion with one word, 1 to 10 items, and party last", () => {
    const events = Object.keys(seasonalEvents);
    expect(new Set(events).size).toBe(events.length);
    expect(events[events.length - 1]).toBe("party");
    for (const [event, items] of Object.entries(seasonalEvents)) {
      expect(event).toMatch(/^[a-z0-9]+$/);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(10);
      for (const name of items) {
        expect(name.length).toBeGreaterThan(0);
        expect(name).toBe(name.trim());
      }
    }
  });
});

describe("hasGroceryIntent", () => {
  describe("title", () => {
    it("shows Suggestions when the title names a grocery run", () => {
      expect(intent("Weekly shop", [], [])).toBe(true);
      expect(intent("Saturday groceries", [], [])).toBe(true);
      expect(intent("COSTCO", [], [])).toBe(true);
    });

    it("keeps weekly re-purchase off an occasion title until grocery items are on the list", () => {
      expect(intent("Christmas party", [], [])).toBe(false);
      expect(seasonalCompanions("Christmas party")).toEqual(
        expect.arrayContaining(["turkey", "cranberry sauce", "chips"]),
      );
      expect(intent("Christmas party", [item("milk"), item("bread")], [])).toBe(true);
      expect(intent("Birthday groceries", [], [])).toBe(true);
    });

    it("matches whole words, so workshop is not a shop", () => {
      expect(intent("workshop", [], [])).toBe(false);
      expect(intent("shopping list", [], [])).toBe(false);
      expect(intent("the shop", [], [])).toBe(true);
    });

    it("falls through to the items when the title is a date or another language", () => {
      const known = [item("milk"), item("bread")];
      expect(intent("Nov 13", known, ["milk", "bread"])).toBe(true);
      expect(intent("2026-11-13", [item("doodh"), item("atta")], [])).toBe(false);
      expect(intent("2026-11-13", known, [])).toBe(true);
      expect(intent("doodh sabzi", known, ["milk", "bread"])).toBe(true);
      expect(intent("किराना", known, ["milk", "bread"])).toBe(true);
      expect(intent("每周买菜", known, ["milk", "bread"])).toBe(true);
      expect(intent("每周买菜", [], [])).toBe(false);
    });
  });

  describe("items the Shopper typed", () => {
    it("shows Suggestions once at least half of two typed Items were added before", () => {
      expect(intent("Saturday trip", [item("doodh"), item("atta")], ["doodh"])).toBe(true);
      expect(intent("Saturday trip", [item("doodh")], ["doodh"])).toBe(false);
      expect(
        intent("Saturday trip", [item("doodh"), item("atta"), item("tape")], ["doodh"]),
      ).toBe(false);
    });

    it("suggests the next Thanksgiving item that is not already on the list", () => {
      const onList = ["turkey", "stuffing", "corn", "cheese"];
      expect(nextSeasonalCompanion("Thanksgiving", onList)).toBe("cranberries");
      expect(nextSeasonalCompanion("Thanksgiving", onList)).not.toBe("bread");
      expect(nextSeasonalCompanion("Thanksgiving", [...onList, "milk"])).toBe("cranberries");
      expect(
        nextSeasonalCompanion("Thanksgiving", [...onList, "milk", "cranberries"]),
      ).toBe("potatoes");
    });

    it("starts re-purchase once a mixed list contains grocery items", () => {
      expect(intent("Garage run", [item("nails"), item("screws")], [])).toBe(false);
      expect(intent("Garage run", [item("nails"), item("screws"), item("milk")], [])).toBe(
        false,
      );
      expect(
        intent("Garage run", [item("nails"), item("screws"), item("milk"), item("bread")], []),
      ).toBe(true);
      expect(
        intent("Christmas party", [item("nails"), item("screws"), item("Milk"), item("bread")], []),
      ).toBe(true);
    });

    it("ignores accepted Suggestions, so accepting one cannot raise intent", () => {
      const items = [
        item("milk"),
        item("oat milk", "suggestion"),
        item("eggs", "suggestion"),
      ];
      expect(intent("Saturday trip", items, ["milk", "oat milk", "eggs"])).toBe(false);
      expect(intent("Saturday trip", [...items, item("bread")], ["milk", "bread"])).toBe(true);
    });

    it("treats an Item with no source as typed", () => {
      expect(
        intent("Saturday trip", [{ name: "milk" }, { name: "bread" }], ["milk", "bread"]),
      ).toBe(true);
    });

    it("hides Suggestions for a new Shopper when the items are not groceries", () => {
      expect(intent("Saturday trip", [item("doodh"), item("atta")], [])).toBe(false);
      expect(intent("Saturday trip", [item("milk"), item("bread")], [])).toBe(true);
      expect(intent("Weekly", [], [])).toBe(true);
    });

    it("hides Suggestions for gibberish", () => {
      expect(intent("", [item("asdf qwer"), item("zzzx")], ["milk", "bread"])).toBe(false);
    });

    it("counts Items in other languages once this Shopper has added them before", () => {
      expect(intent("", [item("doodh"), item("atta")], ["doodh", "atta"])).toBe(true);
      expect(intent("", [item("牛奶"), item("米饭")], ["牛奶", "米饭"])).toBe(true);
      expect(intent("每周买菜", [item("牛奶"), item("米饭")], ["牛奶", "米饭"])).toBe(true);
    });

    it("matches Items ignoring capitalization and extra spaces", () => {
      expect(intent("", [item("Oat  Milk"), item("EGGS")], ["oat milk", "eggs"])).toBe(true);
    });
  });
});

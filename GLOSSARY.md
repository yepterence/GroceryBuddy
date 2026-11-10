# Grocery Buddy

A shopping-list app that learns what a shopper buys repeatedly and when they are likely to need it again, and prices those items against local flyers.

## Language

### People

**Shopper**:
The one person whose lists and buying habits the app tracks. In v1 a Shopper exists only on one device, so a new device or cleared browser data starts a new Shopper with no history.
_Avoid_: User, account, customer, household

### Lists and items

**Grocery list**:
A named collection of items a Shopper intends to buy. A Shopper can keep several at once.
_Avoid_: Note, cart

**Item**:
A thing a Shopper buys, identified by its name ignoring capitalization and extra spaces. `Milk` and `milk` are the same Item; `2% milk` and `lactose-free milk` are different Items.
_Avoid_: Product, SKU, food

**Label**:
A descriptive tag on an Item, such as its family (`milk`) or an attribute (`2%`, `lactose-free`). Labels describe an Item; they never make two Items the same.
_Avoid_: Category, synonym, variant id

**Open item**:
An Item that is unchecked on at least one of the Shopper's Grocery lists. The app does not suggest re-buying an Open item.
_Avoid_: Active item, item on an active list

**Checked off**:
The Shopper's mark that an Item on a list is done. It is the closest signal to "bought" but is unreliable, because shoppers often forget to tick items.
_Avoid_: Acquired, purchased

### Buying habits

**Addition**:
One act of putting an Item on a Grocery list, at a moment in time, either typed by the Shopper or made by accepting a Suggestion. Every Addition is kept forever, even after its list is deleted.
_Avoid_: List inclusion, inclusion event, add

**Inclusion**:
A group of Additions of the same Item made within 12 hours of the group's first Addition, counted as one occasion of needing that Item. Adding milk to two lists in one sitting is two Additions but one Inclusion.
_Avoid_: Session, add, list inclusion

**Cadence**:
The typical number of days between a Shopper's Inclusions of an Item. It is unknown until the Item has at least two Inclusions.
_Avoid_: Frequency, interval

### Suggestions

**Suggestion**:
An Item the app proposes while the Shopper is building a Grocery list, with a reason and a score. Accepting it puts the Item on that same list. A re-purchase Suggestion is always one of the Shopper's own Items that is due again.
_Avoid_: Recommendation (in UI copy), tip

**Grocery intent**:
How strongly a Grocery list being built looks like a regular grocery run, judged from its title and the Items added so far. Suggestions appear only when it is high enough.
_Avoid_: Purpose, list type, category

**Outcome**:
What the Shopper did with a Suggestion they saw: accepted it onto a list or dismissed it.
_Avoid_: Feedback, response

# Accepted suggestions count toward Cadence, tagged with their source

An Addition made by accepting a re-purchase Suggestion counts toward Inclusions and Cadence exactly like a manual Addition, and each Addition records its source (`manual` or `suggestion`). We considered excluding accepted suggestions to avoid the recommender reinforcing itself, but then an Item the Shopper accepts every week never advances its last Inclusion, looks ever more overdue, and its score climbs instead of settling. The self-reinforcement risk is small because a Suggestion only appears once an Item is already due; the source tag keeps the option to down-weight it later from acceptance data.

## Consequences

- `list_inclusion` gains a `source` column. There is no migration tool, so local data is reset (see ADR 0001).
- This reverses the earlier rule in PRD 02 F5 and `docs/tradeoffs.md` §3.

# The v1 Shopper is an anonymous id held by one device

In v1 a Shopper is a random UUID the browser creates and keeps in `localStorage`; the API trusts whatever id the client sends. We chose this over building authentication now so the portfolio slice could ship, and over modelling a Household because list sharing does not exist yet. This is temporary: authentication (a session proves the caller owns the id) must be built before any production deployment and before the mobile version, which is the planned final step.

## Consequences

- Clearing browser data or switching devices starts a new Shopper and loses their history.
- Anyone who learns a Shopper's id can read and change that Shopper's lists.
- The `user_id` foreign keys stay when auth arrives; only how the id is proven changes (PRD 01 §10).
- Location is never stored on the server while the id is unauthenticated. The postal code for flyer prices stays on the device and is sent with each price request.
- On iPhone, Safari may delete `localStorage` for a site not used for about 7 days unless it is added to the Home Screen, so the Shopper can disappear on its own. Another reason auth must precede mobile.

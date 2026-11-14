# UI layer

Page Objects and shared components.

- `pages/` — one class per page. Exposes intent-level actions and read-only
  queries (`bookTickets()`, `getBookingReference()`), never assertions.
- `components/` — widgets that appear on multiple pages (header, nav, dialogs).

Locators live here and nowhere else, so a markup change has exactly one
place to be fixed. Populated in Phase 2 after exploring the application.

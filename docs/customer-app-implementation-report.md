# Customer App implementation report

Implementation date: 24 July 2026

## Summary

The existing blue/white mobile design, rounded cards, typography, header, quick actions, and five-tab navigation were preserved. Business data for the primary customer journeys now comes from one provider. Production builds use the authenticated customer API; local development uses an explicit fictional record source and never silently falls back after an API failure.

## Main files changed

- Customer data/auth layer: `src/app/context/CustomerDataContext.tsx`, `src/app/lib/api.ts`, `src/app/lib/dateTime.ts`, `src/app/lib/status.ts`, and `src/app/types.ts`.
- Customer routes/screens: Home, Bookings/detail, booking flow, Parts/orders, Reminders, Vehicles/history, Invoices, Notifications, Repair Progress, Profile/personal info, and support.
- Backend: `backend/api.php`, `backend/connection.php`, migration `002_customer_company_access.sql`, and guarded database utility scripts.
- Admin: `MAW_AdminPanel/src/app/lib/api.ts` now sends credentialed session requests.
- Validation/documentation: Customer App TypeScript configuration, this report, the audit, and screenshot artifacts.

## API endpoints

Added:

- `customer-login`
- `customer-logout`
- `customer-bootstrap`
- `customer-create-booking`
- `customer-create-parts-order`
- `customer-mark-notifications-read`

Retired with HTTP 410:

- `login`
- `get-home-data`
- `get-vehicles`
- `add-vehicle`
- `get-bookings`
- `add-booking`
- `get-parts`
- `get-notifications`

## Customer-to-company access logic

- Login requires a real password hash and a non-null company relation.
- The server stores customer/contact ID, company ID, source table, and CSRF token in the session.
- Request `userId` and `company_id` values are no longer accepted by new customer endpoints.
- Vehicles are queried by authenticated `company_id`.
- Bookings are joined to a contact/user in the authenticated company.
- Work Orders are queried by authenticated `job.company_id`.
- Invoices and notifications return records only when secure company/customer ownership columns exist.
- Booking creation validates that the selected vehicle belongs to the authenticated company.
- Parts ordering recomputes prices and availability server-side and does not reduce stock when adding to cart or placing an unfulfilled order.
- Inaccessible records return 404/403-style responses; unconfigured ownership mappings fail closed.

## Work Order mapping

| Admin canonical status | Customer label |
|---|---|
| `scheduled` | Booking Confirmed |
| `checked_in` | Vehicle Checked In |
| `inspected` | Inspection Completed |
| `approved` | Repair Approved |
| `waiting_for_parts` | Waiting for Parts |
| `parts_ready` | Parts Ready |
| `under_repair` | Under Repair |
| `ready_for_collection` | Ready for Collection |
| `collected` | Completed / Collected |

Only customer-safe Work Order fields are serialized. Technician comments, cost prices, margins, internal priority, bay, and staff data are not returned.

## Reminder and booking calculations

- Date-only and database-local values are parsed as Malaysia time (`Asia/Kuala_Lumpur`).
- A booking is upcoming only when its timestamp is in the future and status is `pending` or `confirmed`.
- The 15 March 2026 booking remains visible as converted history and is not selected by Home.
- The 5 June 2026 reminder displays `Overdue — 49 days overdue` on 24 July 2026.
- `50,000 - 45,230` is derived as `4,770 km left`.

## Parts orders

- The local customer flow persists through the shared provider.
- The newer database flow creates a pending record in `bookings`/`booking_items`, the same source read by Admin Parts Orders when the newer schema is active.
- Item identity, price, stock, and quantity are validated server-side inside a transaction.
- Stock is not decremented on cart or pending-order creation.
- The legacy database path returns 409 until a real customer-owned Parts Orders table is approved; it does not repurpose internal `job_parts`.

## Invoices

- Newer-schema invoices remain linked to completed service bookings.
- Legacy invoices are returned only when `company_id` or a company-scoped `customer_id` is available.
- Only selling totals, service items, tax, and labour totals are serialized; internal cost/profit fields are omitted.
- Fake PDF-download success actions were removed. Browser printing remains available.

## Notifications

- Badge count is derived from unread notification records.
- Mark-all-read uses a CSRF-protected ownership-scoped update.
- Related record metadata and action routes are supported.
- If a legacy notification table has no enforceable recipient/company ownership, it returns no customer records.
- Notification preference controls were removed from Profile until persistence/channel support exists.

## Security changes

- Removed committed database-password defaults and remote-staging auto-connection.
- Removed the same committed credential from database utility scripts, disabled production-to-staging sync, and added explicit staging confirmation gates to drop/clear/migration utilities.
- Database configuration now fails closed when environment credentials are absent.
- Restricted CORS to configured/local allowed origins and enabled credentialed sessions.
- Added secure cookie defaults and session ID rotation.
- Removed the universal customer password.
- Added CSRF validation to customer mutations and previously uncovered admin mutations.
- Removed internal details from fatal/database connection responses.
- Retired insecure legacy customer endpoint modes with HTTP 410.

## Validation results

- Customer App TypeScript: `pnpm typecheck` — passed.
- Customer App production build: `pnpm build` — passed; existing bundle-size warning remains.
- Admin Panel production build: `pnpm build` — passed; existing bundle-size warning remains.
- Backend PHP lint: all PHP files — passed.
- Date/status assertions — passed:
  - past booking is not upcoming;
  - future confirmed booking is upcoming;
  - 5 June to 24 July is 49 days overdue;
  - mileage remaining is 4,770 km.
- Browser verification:
  - login and Home navigation passed;
  - no Vite error overlay or page errors;
  - meaningful content rendered;
  - no horizontal document overflow at 320, 375, 390, 430, or 768 px.
- API safe-failure test with all DB environment variables removed:
  - customer/admin endpoints returned HTTP 503 with `Database configuration is unavailable`;
  - no remote database connection was attempted.

Live multi-company API tests were not run because no approved disposable database credentials were supplied. Tenant isolation was validated by code paths and browser-local fictional records, not by querying production or staging.

## Screenshots

- [Home](../MAW_CustomerApp/artifacts/screenshots/home-cleanup-390.png)
- [Home at 320 px](../MAW_CustomerApp/artifacts/screenshots/home-320.png)
- [My Bookings](../MAW_CustomerApp/artifacts/screenshots/my-bookings.png)
- [Booking Detail](../MAW_CustomerApp/artifacts/screenshots/booking-detail.png)
- [Repair Progress](../MAW_CustomerApp/artifacts/screenshots/repair-progress.png)
- [Parts](../MAW_CustomerApp/artifacts/screenshots/parts.png)
- [My Orders](../MAW_CustomerApp/artifacts/screenshots/my-orders.png)
- [Service Reminders](../MAW_CustomerApp/artifacts/screenshots/service-reminders.png)
- [Vehicle Detail](../MAW_CustomerApp/artifacts/screenshots/vehicle-detail.png)
- [My Invoices](../MAW_CustomerApp/artifacts/screenshots/my-invoices.png)
- [Notifications](../MAW_CustomerApp/artifacts/screenshots/notifications.png)
- [Profile](../MAW_CustomerApp/artifacts/screenshots/profile.png)

## Known limitations

- The approved operational schema needs a dedicated customer-owned Parts Orders relation before legacy parts ordering can be enabled.
- Quotation approval and online payment were not fabricated.
- Service-history detail remains screen-local pending an approved customer-visible service-history endpoint.
- A real API runtime test requires a disposable, non-production database with at least two companies and approved credentials.
- The migration was added for review only and was not executed.

## Production safety

No production or staging database was connected to, read, copied, migrated, or modified. No passwords were reset. No destructive command or migration was run.

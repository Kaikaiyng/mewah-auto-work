# Customer App alignment audit

Audit date: 24 July 2026  
Scope: repository inspection only. No database connection was made.

## 1. Architecture

- Customer App: Vite 6, React 18, React Router 7, Tailwind CSS, shadcn/Radix components, and Capacitor Android/iOS wrappers.
- Routing: client-side browser routes in `MAW_CustomerApp/src/app/routes.tsx`; the five primary tabs share `MobileLayout`.
- Admin Panel: a separate Vite/React application using the same PHP entry point.
- Backend: one PHP router, `backend/api.php`, with a MySQL connection selected by environment/host.

## 2. API and database relationship

- Before this change, the Customer App had no API client or API environment configuration and did not call the backend.
- The Admin Panel called `api/api.php` through `MAW_AdminPanel/src/app/lib/api.ts`.
- Both applications were intended to use the same PHP backend, but the backend supported two competing record sets:
  - operational/legacy tables: `company`, `customer`, `customer_vehicle`, `customer_appointment`, `job`, `parts`, `customer_invoice`, and `customer_notification`;
  - newer duplicate tables: `users`, `vehicles`, `bookings`, `booking_items`, `spare_parts`, and `notifications`.
- Admin endpoints preferred the operational tables when present. Old customer endpoints only queried the newer tables. The applications could therefore display unrelated records even when pointed at the same database.
- No evidence of a separate customer database view was found.

## 3. Initial customer identity model

- Frontend login accepted any non-empty email/password and navigated to Home.
- No customer route guard, authenticated user state, session check, bearer token, or CSRF token existed.
- The fixture `User` represented a personal owner and had no company, contact role, account reference, or permissions.
- Backend customer endpoints accepted `userId` from the request and defaulted to user 1.
- Backend login had a universal `DEMO-ONLY-NOT-A-SECRET` fallback.

## 4. Hardcoded-data audit

The initial business data source was `MAW_CustomerApp/src/app/data/mockData.ts`, with additional screen-local values.

| Area | Initial hardcoding |
|---|---|
| Home | user, first vehicle, next booking, notifications |
| Bookings/detail | booking list; several cards always used vehicle index 0; mechanic notes exposed |
| Booking flow | service catalogue, location, vehicle list; confirmation displayed without persistence |
| Parts/orders | catalogue, images, orders; checkout mutated a module array after a timeout |
| Reminders | one reminder, service dates, last-service values |
| Vehicles/history | all vehicles plus screen-local service history |
| Invoices | derived from completed fixture bookings |
| Notifications | local list and local read state |
| Profile/personal info | local user; blank `customerId`; mutations were in-memory only |
| Addresses | local addresses; save handler only logged to console |
| Support | frontend-only contact actions |
| Settings | local toggles with success messages and no backend |

## 5. Security and tenant-isolation audit

Initial findings:

- Critical: arbitrary `userId` on customer reads and writes.
- Critical: unauthenticated customer endpoints defaulted to user 1.
- Critical: universal customer-password fallback.
- High: no company ownership checks for vehicles, bookings, invoices, orders, or notifications.
- High: `Access-Control-Allow-Origin: *`.
- High: database credentials were committed and local PHP connected to a remote staging host by default.
- High: connection and fatal responses exposed database/server details.
- Medium: multiple admin mutations lacked CSRF checks.
- Medium: admin fetches did not explicitly include credentials for cross-origin configured deployments.

Initial conclusion: another company’s data could not be proven inaccessible; the code allowed insecure direct-object access.

## 6. Initial Admin Panel mismatches

- Company/contact roles and permissions were absent from the Customer App.
- Admin operational tables and customer fixture/newer tables were not aligned.
- Booking repair state was mixed into booking statuses.
- No customer repair-progress route existed.
- Parts orders could be “placed” without reaching Admin Parts Orders.
- Invoices and notifications did not come from Admin records.
- Vehicle reminders were a single fixture rather than vehicle maintenance fields.

## 7. Confirmed visible defects

- 15 March 2026 was selected as an upcoming booking after that date.
- 5 June 2026 produced a negative “days left” value.
- Customer ID rendered blank.
- Brake Pads used an invalid image URL without a controlled fallback.
- `40's Trailer` was displayed.
- unit and registration identifiers were not consistently labelled.
- Bookings subtitle described service history.
- notification count was local-only.

## 8. Minimal implementation plan

1. Add a single Customer App data provider and explicit local/API source selection.
2. Centralise Malaysia date/time, upcoming-booking, and reminder calculations.
3. Correct identity, vehicle labels, booking statuses, images, and profile content.
4. Add customer-safe notifications and repair progress.
5. Add authenticated session/CSRF customer endpoints.
6. Enforce company ownership in every customer query and mutation.
7. Retire insecure legacy customer endpoint modes.
8. Add an optional reviewed migration for the newer schema; do not run it.
9. Build, typecheck, lint, and visually verify at the requested widths.

## 9. Expected frontend files

- Customer App types, data context, API/date/status helpers, routes, and primary screens.
- Admin API client only for credentialed requests.
- Existing visual components and design tokens remain unchanged.

## 10. Expected backend endpoints

- `customer-login`
- `customer-logout`
- `customer-bootstrap`
- `customer-create-booking`
- `customer-create-parts-order`
- `customer-mark-notifications-read`

Old `login`, `get-home-data`, `get-vehicles`, `add-vehicle`, `get-bookings`, `add-booking`, `get-parts`, and `get-notifications` modes should be retired.

## 11. Database changes and compatibility risks

- Operational tables already contain the core company model; no migration is required merely to read those records.
- The newer schema needs `company_id`, contact metadata, notification ownership/deep-link fields, and service-reminder fields.
- The supplied migration must be reviewed against the actual non-production schema before use.
- Legacy Parts Orders lack a clearly customer-owned order table in the inspected code. Reusing `job_parts` would expose workshop job consumption, so customer order creation must fail closed until a proper mapping is approved.
- Legacy notification and invoice tables can only be returned when an ownership column allows secure company/customer scoping.

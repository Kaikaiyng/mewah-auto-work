# Customer App Functional Shell

## Architecture

Customer screens read and mutate customer records only through `CustomerDataContext`, which delegates to the `CustomerService` contract.

- `LocalCustomerService` is the current stateful in-memory implementation.
- `ApiCustomerService` is the future Admin Panel API adapter.
- Booking, Work Order, Parts Order, Invoice, Reminder, Notification, Profile, Address, and preference mutations return a new shared customer snapshot.
- No staging or production database is used by this implementation.

## Customer to Admin module mapping

| Customer feature | Future Admin source |
| --- | --- |
| Home | Bookings, Work Orders, Notifications |
| My Vehicles | Vehicles |
| My Bookings | Bookings |
| Repair Progress | Work Orders |
| Parts catalogue | Parts Inventory |
| My Orders | Parts Orders |
| Service Reminders | Vehicle maintenance schedule |
| My Invoices | Invoices |
| Notifications | Customer Notifications |
| Profile | Contacts & Drivers, Companies |

## Implemented local workflows

- Booking: vehicle, company contact/driver, service, workshop, date, time, reported problem, notes, and reminder reference; creates a Pending booking and notification.
- Booking management: cancel, reschedule, local Pending → Confirmed → Converted preview, linked Work Order, and Repair Progress navigation.
- Repair Progress: customer-safe status, dated timeline, booking and vehicle references, expected completion, diagnosis summary, visible work, estimate, and workshop contact.
- Vehicle: overview, upcoming booking, current repair, reminder, service history, invoices, and vehicle-prefilled booking.
- Reminder: Due Soon/Overdue/Booked/Completed model and vehicle/service/reminder-prefilled booking without repeating vehicle selection.
- Parts: catalogue search/filter, product detail, cart quantities/removal/subtotal, delivery or pickup, notes, order creation, notification, order list/detail, and timeline.
- Invoice: list/detail, invoice status, issued/due dates, item/labour/tax/discount totals, paid amount, balance, and payment instructions.
- Notification: unread badge, mark-one-read on click, mark-all-read, and record deep links.
- Profile: shared name/phone changes, addresses, notification preferences, vehicle/invoice navigation, support, and logout.
- Permission gates: bookings, cancellations, rescheduling, repairs, parts, invoices, notifications, and vehicle visibility contract.

## Future Admin API support

The Admin Panel will need:

1. Contact Portal Access: enabled state, login email, portal role, accessible vehicles, and permissions.
2. Work Order Customer Visibility: customer-visible status/update timestamp, expected completion, ready-for-collection message, and customer-safe timeline.
3. Vehicle Maintenance Schedule: next service date/mileage/engine hours and reminder rules.
4. Parts Order Processing: customer order, items, fulfilment method, status, and timeline.
5. Customer Notifications: recipient, related record, delivery channel/status, and action route.

Replacing `LocalCustomerService` with `ApiCustomerService` should be sufficient once those endpoints support every method in `CustomerService`.

## Verification

- Customer TypeScript: passed.
- Customer production build: passed.
- Responsive horizontal-overflow matrix: passed at 320, 375, 390, 430, and 768 px on Home, Repair Progress, and Invoice Detail.
- Browser workflows: booking creation, status conversion, linked repair, reminder start, parts checkout/order detail, notification deep link/read state, and shared profile update passed.
- Browser console/page errors: none after the final workflow runs.
- Screenshots: `MAW_CustomerApp/artifacts/screenshots`.
- Admin shared code, PHP, and databases were not changed for this functional-shell phase.

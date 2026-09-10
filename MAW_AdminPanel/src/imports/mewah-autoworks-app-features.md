# Mewah AutoWorks Mobile Application - Feature Specification

## 🏠 1. Home
- Welcome header (User profile, Logo)
- Language switcher (English / Malay / Chinese)
- Notification bell (Unread badge, notification dropdown drawer)
- Quick action buttons:
  - 📋 Book Service
  - 📦 Buy Parts
  - 🛡️ Insurance Renewal
  - 📞 Roadside Assistance
- Next service booking card (Date, Time, Location)

## 📅 2. Bookings
### Booking List:
- Upcoming
- Completed
- Service category, date, vehicle plate, status badge
### Booking Details:
- Booking reference number, status indicator
- Vehicle information, service category
- Date, time slot, location
- Notes (Customer notes, technician notes)
- View invoice action button
### 5-Step Booking Flow:
1. Select Vehicle
2. Select Service Type (General Service, Oil Change, Brake Service, Engine Repair, etc.)
3. Select Date & Time (Location: Pasir Gudang HQ)
4. Problem Description & Notes
5. Confirmation & Submission

## 🔧 3. Parts Marketplace
### Categories:
- All Parts
- Oil & Filters
- Brake Components
- Engine Parts
- Accessories
### Parts Catalog:
- Part photo, SKU, description, unit price
- Stock availability indicator
- Add to Cart action
### Cart & Checkout:
- Line item list, quantity controls
- Subtotal, tax calculation, grand total
- Checkout and delivery destination selection
### Parts Orders:
- Order list (Ready, Completed)
- Order detail card (Order #, Shipping Address, Line Items, Total)
- Invoice / Delivery Order PDF download

## 🔔 4. Maintenance Reminders
### Vehicle Service Reminders:
- Next service due date
- Recommended odometer mileage
- Service category
- Notification toggle
### Document Expiration Reminders:
- 🛡️ Insurance Expiry Date
- 🚗 Road Tax Expiry Date
- ✅ PUSPAKOM Inspection Expiry Date

## 👤 5. Profile & Fleet Management
### Account Information:
- Full name, email, contact number
- Profile edit dialog
### Equipment / Vehicle Management:
- Fleet vehicle listing
- Add new vehicle request
- Vehicle technical specifications:
  - Unit No / Vehicle ID
  - Registration Number (Plate)
  - Equipment Type (e.g., 40ft Trailer, Prime Mover)
  - Make & Model (Volvo, Scania, Mercedes-Benz, etc.)
  - Current Mileage
  - Manufacture Year
  - Chassis Number (VIN)
  - Engine Number
  - Insurance Expiry
  - Road Tax Expiry
  - PUSPAKOM Expiry
### Service History:
- Complete historical service logs per vehicle
### Delivery Address Management:
- Saved shipping address list
- Add / Edit / Delete address
- Set primary default address
### Invoices:
- View completed work order invoices
- Itemized breakdown (Labor, Parts, Taxes)
- PDF download

## 🆘 6. Support & Ancillary Features
### Insurance Renewal:
- Submit insurance renewal request
- Select vehicle
- Upload required documents
### Roadside Assistance:
- Emergency breakdown assistance request
- Select vehicle & current GPS location
- Problem description & contact number
### Customer Support:
- Frequently Asked Questions (FAQ)
- Direct support channels (WhatsApp, Phone, Email)

## 🔐 7. Authentication
- Corporate account & Customer login
- Password authentication
- Persistent session storage

## 🎨 8. UI / UX Design Language
- Deep navy brand theme (`#1e3a8a`)
- Mobile-first, single-screen responsive viewport layout (`~100dvh`)
- Multilingual interface support (EN / MS / ZH)
- High-density compact data rows
- Segmented tab navigation and bottom sheet drawers

---

## 🖥️ Recommended Admin Operations Modules
1. **Dashboard**: Today's bookings, pending orders, revenue metrics, operational health.
2. **Customer Management**: Company profiles, debtor codes, credit terms, company users.
3. **Vehicle Management**: Fleet specs, grant verification, document compliance, rejection workflow.
4. **Booking Management**: Schedule overview, bay allocation, work order conversion.
5. **Parts Inventory**: Stock catalog, bin locations, audit ledger (`part_stock_transactions`), shortage enforcement.
6. **Orders Management**: Customer parts orders, delivery orders, fulfillment queues.
7. **Invoice Management**: Work order invoices, AutoCount accounting synchronization, PDF generation.
8. **Audit Trail**: Append-only operational mutation logging.
9. **Staff & Roles**: RBAC role assignment, workshop technician job dispatching.
10. **System Settings**: Labor rates, tax codes, system key-value configurations.
# Mewah Auto Work (MAW) — Comprehensive Technical & System Documentation

> **Authoritative System Specification & Architectural Reference**
>
> **Document Version**: 2.7.0 (Comprehensive Enterprise Specification)
>
> **Last Verified Against Repository State**: 2026-09-09
>
> **Scope**: MAW Admin Panel, MAW Customer App, Workshop Floor Mode, Shared PHP API, MySQL Database Migrations (001–046), AutoCount Accounting Integration, vehicle compliance documents, delivery addresses, unified invoice workspace, Parts Shortage Gatekeeping & Back Order Inline Bypass, Inventory Stock Adjustment Audit Ledger, Single-Screen Mobile Architecture, Multi-Table Excel Export, Super Admin Audit Trail & App Logs Engine, Work Order Walk-in Intake Refinement, Dropdown Stacking Context Cascade, and Dual-Environment Distribution Packaging.

---

## 1. System Overview & Core Objectives

**Mewah Auto Work (MAW)** is an enterprise workshop management platform purpose-built for heavy commercial transport fleets (container haulage, prime movers, trailers, rigid trucks) and general commercial vehicles.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         SYSTEM ARCHITECTURE TOPOLOGY                     │
│                                                                          │
│   ┌───────────────────────────────┐     ┌──────────────────────────────┐ │
│   │        MAW Admin Panel        │     │       MAW Customer App       │ │
│   │   (Web Management Portal)     │     │     (Web & Mobile PWA/App)   │ │
│   │  React 18 + Vite + Tailwind 4 │     │ React 18 + Vite + Tailwind 4 │ │
│   │    MUI, Radix UI, Recharts    │     │   Capacitor 8 (iOS/Android)  │ │
│   └───────────────┬───────────────┘     └──────────────┬───────────────┘ │
│                   │ (HTTPS / X-MAW-Portal: admin)      │                 │
│                   │                                    │ (X-MAW-Portal:  │
│                   │                                    │  customer)      │
│                   ▼                                    ▼                 │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │                         Shared PHP API Gateway                     │ │
│   │  - Entry Point: api.php                                            │ │
│   │  - Auth & Partitioned Sessions (MAWADMINSESSID / MAWCUSTOMERSESSID)│ │
│   │  - RBAC & Customer Company Data Isolation Guard                    │ │
│   │  - State Machine Enforcers & Transactional Outbox Queues           │ │
│   │  - Auto Environment & DB Switcher (connection.php)                 │ │
│   └─────────────────────────────────┬──────────────────────────────────┘ │
│                                     │ (MySQL / MariaDB Connection)       │
│                                     ▼                                    │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │                 MySQL Database (Staging / Production)              │ │
│   │  - Vehicles, Bookings, Work Orders, Parts, Quotations, Invoices    │ │
│   │  - Canonical Invoice Outbox: autocount_invoice_sync_queue          │ │
│   │  - Delivery Order Outbox: autocount_parts_order_sync_queue         │ │
│   │  - Purchase Order Outbox: autocount_purchase_order_sync_queue      │ │
│   └───────────────────────────────▲────────────────────────────────────┘ │
│                                   │ (MySQL TCP / Direct SDK Ingestion)   │
│   ┌───────────────────────────────┴────────────────────────────────────┐ │
│   │               AutoCount Sync Program (.NET / C# Service)           │ │
│   │  - Runs on Windows AutoCount On-Premise / Server Host              │ │
│   │  - Direct AutoCount SDK Integration (AutoCount.Invoicing.dll, etc.)│ │
│   │  - Master Data Ingestion: Debtor, Creditor, Item Master, Projects  │ │
│   └───────────────────────────────▲────────────────────────────────────┘ │
│                                   │ (Direct COM/SDK API)                 │
│   ┌───────────────────────────────┴────────────────────────────────────┐ │
│   │                   AutoCount Accounting System                      │ │
│   │   (Official Financial Source of Truth, Official DocNo, Tax/GL)     │ │
│   └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Core Business Objectives & Boundaries
1. **Operational Workflows (MAW Domain)**: End-to-end management of customer vehicle records, scheduled bookings, on-site walk-ins, work order job sheets, quotation drafting & approval, technician job clocking with before/after inspection photos, parts inventory requisitions, supplier purchase orders (PO), customer parts ordering, and workshop internal invoice generation.
2. **Financial Accounting (AutoCount Domain)**: Serves as the official single source of truth for formal tax invoices, official invoice numbering (`DocNo`), e-Invoice UUIDs, accounts receivable (Debtor ledger), accounts payable (Creditor ledger), payments, and credit balances.
3. **Outbox Synchronization**: Operational records in MAW generate transactional outbox entries in canonical queue tables (`autocount_invoice_sync_queue`, `autocount_parts_order_sync_queue`, `autocount_purchase_order_sync_queue`), which are processed asynchronously via the AutoCount integration endpoints.

---

## 2. Technical Architecture & Verified Stack

The following versions have been verified directly against source code and lockfiles:

| Layer / Application | Technology | Verified Version | Notes / Dependencies |
| :--- | :--- | :--- | :--- |
| **Admin Panel** | React / Web Application | `0.2.0` (React 18.3.1) | Single-page admin portal |
| | Vite | `6.3.5` | Bundler & dev server (Port `5173`) |
| | TailwindCSS | `4.1.12` | `@tailwindcss/vite` |
| | Material UI | `7.3.5` | `@mui/material`, `@mui/icons-material` |
| | Radix UI | Various (`1.1.2`–`2.2.6`)| Accessible primitive components |
| | Recharts | `2.15.2` | Operational & revenue dashboards |
| | React Router | `7.13.0` | Client-side routing with role guards |
| **Customer App** | React | `18.3.1` | Mobile-first customer & workshop app |
| | TypeScript | `5.8.3` | Enforced strict typing (`pnpm typecheck`)|
| | Vite | `6.3.5` | Bundler & dev server (Port `5174`) |
| | TailwindCSS | `4.1.12` | Mobile utility styling |
| | Capacitor | `8.4.1` | iOS & Android native shell (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/camera` `8.2.2`) |
| | React Router | `7.13.0` | Deep link enabled |
| **Shared Backend** | PHP Engine | `8.1+` | Frameworkless high-performance JSON API (`api.php`) |
| | MySQL / MariaDB | `8.0+` / `10.5+` | Engine `InnoDB`, Charset `utf8mb4` |
| | Package Manager | `pnpm` | Lockfile `pnpm-lock.yaml` enforced |
| **AutoCount Sync**| C# / .NET | `.NET Framework 4.8` | Windows Forms & Background Worker Thread |
| | AutoCount SDK | Referenced Assembly | Repository references `AutoCount.Invoicing.dll`, `AutoCount.ARAP.dll`, `AutoCount.Stock.dll`; runtime loaded dynamically |
| | MySQL Driver | `MySql.Data.dll` | Direct SQL connection with connection pooling |

---

## 3. Application Boundaries & Responsibilities

### 3.1 MAW Admin Panel
- **Access URL**: Staging: `/staging/`, Production: `/` on `workshop.example.com`
- **Responsibilities**:
  - Review, schedule, and check-in customer vehicle Bookings.
  - Register Walk-in vehicles directly into active Work Orders.
  - Full Work Order lifecycle dispatching, mechanic assignment, and bay management.
  - Parts inventory catalogue, pricing, safety stock thresholds, and stock movements.
  - Supplier Purchase Orders (PO) management and stock receiving.
  - Customer parts purchase order processing and fulfillment.
  - Work order quotation drafting, item pricing, and issuing.
  - Workshop internal invoice generation and AutoCount synchronization management.
  - Unified invoice and AutoCount pending/failed sync queue workspace under `/invoices`.
  - Vehicle compliance document review with authenticated image/PDF preview, approval, and rejection history.
  - AutoCount synchronization health monitor, outbox error logs, and manual retry triggers.
  - Staff user management, role-based access control (RBAC), and administrative audit trail.

### 3.2 MAW Customer App
- **Access URL**: Staging: `/staging/`, Production: `/` on `workshop.example.com` (also packaged via Capacitor for iOS/Android).
- **Responsibilities**:
  - Company-scoped authenticated dashboard for corporate fleet managers.
  - Fleet management: vehicle specifications, Puspakom inspection reminders, road tax expiry.
  - Insurance, Road Tax, and PUSPAKOM renewal upload (PDF/image), status tracking, and in-app preview.
  - Persistent delivery-address management used by parts-order checkout.
  - New vehicle registration (with VOC/Grant registration document photo upload for admin approval).
  - 5-step maintenance & repair booking workflow.
  - Live repair progress tracking with real-time stage progression.
  - Inspection photo gallery (viewing mechanic-uploaded photos flagged as customer-visible).
  - Quotation online review: one-click Approve or Reject with customer feedback notes.
  - Spare parts e-commerce catalogue, shopping cart, and delivery/pickup orders.
  - Historical invoice repository with PDF downloads.
  - Native Android back handling: non-home screens return to Home; Home requires a second press within two seconds to exit.

### 3.3 Workshop / Mechanic Mode (`/workshop/jobs`)
- **Architecture**: Built directly into the MAW Customer App bundle, activated through a **Unified Login** screen.
- **Access Mechanism**:
  - The login screen (`LoginScreen.tsx`) first attempts customer authentication. If customer credentials fail, it automatically attempts staff workshop authentication (`mode=workshop-login`).
  - Upon successful staff authentication, the user is redirected to `/workshop/jobs`.
- **Responsibilities**:
  - View assigned work orders filtered by bay, priority, and technician assignment.
  - Clock job lifecycle stages (`inspected`, `under_repair`, `ready_for_collection`).
  - Request parts from inventory for active work orders.
  - Capture and upload vehicle inspection photos (before, during, and after repair) using native camera integration.

### 3.4 Shared Backend API (`backend/api.php`)
- **Architecture**: Single-entry point RESTful API handling both JSON payloads and `multipart/form-data` uploads.
- **Responsibilities**:
  - Dual-portal session management and CSRF validation for customer/workshop actions.
  - Server-side role authorization and strict Company Data Isolation enforcement.
  - Transactional stage transitions and business rule validation.
  - Photo upload handling, MIME-type verification, and secure path streaming.
  - Transactional Outbox event dispatching for AutoCount integrations.
  - Centralized JSON application logging (`storage/logs/app-YYYY-MM.log`) and administrative audit logging (`admin_audit_log`).

### 3.5 AutoCount Sync Program
- **Architecture**: WinForms desktop application with background worker threads deployed on the Windows server hosting AutoCount.
- **Responsibilities**:
  - Ingests Debtor (Company) and Creditor (Supplier) master data from AutoCount into MAW.
  - Ingests Item Master catalogue, stock quantities, and base pricing from AutoCount into MAW.
  - Ingests vehicle project codes (`[Project]`) from AutoCount into MAW. The operational Projects screen is currently hidden from navigation, while ingestion and stored mappings remain available for compatibility.
  - Ingests formal AutoCount Sales Invoice headers and details into MAW.
  - Provides endpoints for outbox queue processing (`autocount_invoice_sync_queue`, `autocount_parts_order_sync_queue`, `autocount_purchase_order_sync_queue`).

---

## 4. Environment Isolation & Network Routing

### 4.1 Environment Matrix

| Environment | Frontend Entry URL | API Endpoint | Database Name |
| :--- | :--- | :--- | :--- |
| **Local Dev** | `http://localhost:5173` (Admin)<br>`http://localhost:5174` (Customer) | Vite Dev Proxy &rarr; Staging API | `mewahautoworksystem_staging` |
| **Staging** | `https://workshop.example.com/staging/`<br>`https://workshop.example.com/staging/` | `/staging/api_staging/api.php` | `mewahautoworksystem_staging` |
| **Production**| `https://workshop.example.com/`<br>`https://workshop.example.com/` | `/api/api.php` | `mewahautoworksystem` |

### 4.2 Dynamic Database Resolution (`backend/connection.php`)
1. **CLI / Localhost**: Requests on `localhost`, `127.0.0.1`, or CLI default to `staging`.
2. **Staging Directory**: Requests matching `/api_staging/` in URI or script path connect to `staging`.
3. **Fallback Policy**: All other requests resolve to `production`.
4. **Configuration Loading**: Looks for credentials in `MAW_DB_*` environment variables, then falls back to `/home/CPANEL_USER/maw_db_config.php`.

> [!WARNING]
> **Production Safety Note (Technical Debt - Risk: Medium)**: The fallback logic treats any non-staging host as `production`. If deploying to a new test host or custom domain without `/staging/` in the path, it will connect to the production database unless overridden by `MAW_DB_CONFIG_FILE` or environment variables.

---

## 5. System of Record / Source of Truth Matrix

| Domain / Data Entity | MAW Operational System | AutoCount Accounting | Actual Synchronization Direction | Master Authority / Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Workshop Workflow & Stages** | **Source of Truth** | No record | None | Managed entirely in MAW |
| **Vehicle Inspection Photos** | **Source of Truth** | No record | None | Stored on MAW web-access-restricted storage |
| **Customer Bookings** | **Source of Truth** | No record | None | Operational scheduling in MAW |
| **Quotation & Approval** | **Source of Truth** | Optional reference | None | Customer approvals signed off in MAW |
| **Official Invoice Number (`DocNo`)** | Read-only mirror (`invoice_no` / `autocount_invoice_no`)| **Source of Truth** | AutoCount &rarr; MAW | Generated solely by AutoCount |
| **Official Tax / e-Invoice Status**| Read-only mirror (`e_invoice_uuid`) | **Source of Truth** | AutoCount &rarr; MAW | Submitted to LHDN via AutoCount |
| **General Ledger & Debtor Balance**| Operational cached view | **Source of Truth** | AutoCount &rarr; MAW | Accounting ledgers live in AutoCount |
| **Debtor (Customer Company)** | Operational reference & contact details | **Source of Truth** for Credit Terms & Limits | **AutoCount &rarr; MAW** | Master sync pushes AutoCount `Debtor` to MAW `company` |
| **Creditor (Suppliers)** | Operational reference | **Source of Truth** | **AutoCount &rarr; MAW** | Master sync pushes AutoCount `Creditor` to MAW `suppliers` |
| **Item Master (Parts Catalog)** | Operational pricing & photos | **Source of Truth** for ItemCode, UOM, Base Cost | **AutoCount &rarr; MAW** | Master sync pushes AutoCount Item Master to MAW `parts` |
| **Inventory Quantity on Hand** | Real-time workshop stock card | **Source of Truth** for accounting balance | **AutoCount &rarr; MAW** (Periodic) | PO receiving in MAW updates stock; AutoCount stock sync periodic |

---

## 6. Core Business Entities & Domain Rules

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             CORE ENTITY MAP                              │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────┐           │
│   │                         Company                          │           │
│   │        (Debtor Code, Credit Limit, Payment Terms)        │           │
│   └───────────────┬──────────────────────────┬───────────────┘           │
│                   │ 1:N                      │ 1:N                       │
│                   ▼                          ▼                           │
│     ┌───────────────────────────┐      ┌───────────────────────────┐     │
│     │       Company User        │      │          Vehicle          │     │
│     │   (Customer App Login)    │      │  (Plate, Chassis, Grant)  │     │
│     └───────────────────────────┘      └─────────────┬─────────────┘     │
│                                                      │ 1:N               │
│                                                      ▼                   │
│                                        ┌───────────────────────────┐     │
│                                        │          Driver           │     │
│                                        │ (Operational Record Only) │     │
│                                        └─────────────┬─────────────┘     │
│                                                      │                   │
│                                                      ▼                   │
│       ┌──────────────────────────────────────────────────────────┐       │
│       │                    Work Order / Job                      │       │
│       │        (Stage Lifecycle, Photos, Parts, Quotation)       │       │
│       └───────────────┬──────────────────────────┬───────────────┘       │
│                       │ 1:1                      │ 1:1                   │
│                       ▼                          ▼                       │
│     ┌───────────────────────────┐      ┌───────────────────────────┐     │
│     │   Work Order Quotation    │      │    Work Order Invoice     │     │
│     │ (Items, Labor, Approvals) │      │  (MAW Ref -> AutoCount)   │     │
│     └───────────────────────────┘      └─────────────┬─────────────┘     │
│                                                      │ 1:1               │
│                                                      ▼                   │
│                                        ┌───────────────────────────┐     │
│                                        │  AutoCount Outbox Queue   │     │
│                                        │ (autocount_invoice_sync_  │     │
│                                        │  queue)                   │     │
│                                        └───────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Domain Rules:
1. **Company (B2B Tenant)**: The top-level account. All vehicles, bookings, work orders, quotations, and invoices belong to a `Company`.
2. **Company User**: Individual login accounts associated with a `Company`. All users within the same company have visibility over the entire company fleet.
3. **Driver (Compatibility-Only)**: Legacy operational driver records have no login credentials. Driver navigation, vehicle/work-order display fields, form fields, selectors, and exports are currently hidden because Driver is not part of the active workflow. The database/API model remains intact for historical-data and integration compatibility; `/drivers` redirects to `/equipment`.
4. **Vehicle Verification & Re-submission**:
   - Vehicles added by **Admins** are automatically `approved`.
   - Vehicles added by **Customers** enter `pending_verification` status and require Admin approval (grant/VOC document review) before bookings can be placed.
   - If **Rejected** by Admin, an audit-logged rejection reason is recorded. In the Customer App, the vehicle is flagged as `rejected` with the rejection reason clearly displayed. The customer can review the feedback, update registration parameters, re-upload documents, and trigger a **Re-submission** (`customer-resubmit-vehicle`), which resets the status to `pending_verification` for Admin re-verification.
5. **Work Order Initiation**:
   - Can originate from a customer **Booking** via the Admin check-in action.
   - Can originate directly as an on-site **Walk-in** (`checked_in`), without a prior booking.

---

## 7. Functional Module Breakdown

### 7.1 Admin Panel Modules (`/`)
- **Dashboard (`/`)**: High-level KPIs, work orders by stage, revenue summaries, pending vehicle approvals, and stock shortage alerts.
- **Work Orders (`/work-orders`)**: Detailed job management, stage tracking, quotation builder, mechanic assignment, parts allocation, and inspection photos.
- **Bookings (`/bookings`)**: Manage appointment slots, accept/reject booking requests, and convert appointments to work orders.
- **Companies (`/companies`)**: Manage corporate client accounts, credit terms, and AutoCount Debtor Code mappings.
- **Customers (`/customers`)**: Manage login credentials and company affiliations for customer users.
- **Vehicles (`/equipment`)**: Commercial vehicle profiles, specs, grant verification, compliance expiry marking, and customer-uploaded compliance document review.
- **Parts Inventory (`/parts`)**: Stock levels, bin locations, cost/sell prices, and AutoCount Item mappings.
- **Customer Orders (`/orders`)**: Fulfill customer parts orders and push DOs to the AutoCount sync queue.
- **Purchase Orders (`/purchase-orders`)**: MAW is the operational source for drafting/confirming supplier POs, generating downloadable PDF documents for manual WhatsApp delivery, tracking ETAs, and receiving parts. Confirmation queues an accounting copy to AutoCount asynchronously.
- **Invoices (`/invoices`)**: One integrated workspace for issuing invoices and viewing `All`, `Bill Done / Issued`, `Pending Sync`, `Sync Failed`, `Synced to AutoCount`, `Outstanding`, and `Paid`. Pending queue KPIs, Work Order Invoice/Parts Order DO filters, batch sync selection, and retry context are rendered in this same page. Legacy `/pending-sync-invoices` redirects to `/invoices?view=pending_sync`. Issued Work Order Invoice/DO and Parts Order Invoice/DO documents support direct `.pdf` download in addition to browser printing; unsynced documents use the stable MAW reference and show the AutoCount number after synchronization.
- **AutoCount Sync (`/autocount-sync`)**: Real-time queue health, sync failures, retry dispatcher, and payload inspector.
- **Staff Management (`/staff`)**: Manage staff profiles, roles, and assignable workshop technicians.
- **Audit Trail (`/audit-trail`)**: View administrative action history with actor tracking and payload diffs.
- **Application Logs (`/app-logs`)**: In-browser inspection of backend logs (`app-YYYY-MM.log`).

**Intentionally hidden navigation modules**:
- **Drivers**: hidden across the Admin UI and all driver choices; backend data remains for compatibility only.
- **AutoCount Projects**: hidden from Sidebar because it is not used by the current workshop flow. The `/projects` route, AutoCount ingestion, vehicle project fields, API, and database records are retained, so hiding it does not change Booking, Walk-in, Work Order, Invoice, or sync behavior.

### 7.2 Customer App Modules
- **Home (`/home`)**: Active work order cards, booking quick-actions, and fleet compliance countdowns.
- **Booking Flow (`/booking/*`)**: 5-step wizard (Vehicle &rarr; Service Category &rarr; Date/Time &rarr; Issue/Photos &rarr; Confirmation).
- **Live Repair Progress (`/repair-progress/:id`)**: Visual stepper of work order stages, technician inspection photos, and quotation approval sheet.
- **Vehicles (`/vehicles`)**: Fleet list, individual vehicle maintenance history, expiry dates, renewal upload/review status, and authenticated in-app preview for images and PDFs.
- **Register Vehicle (`/add-vehicle`)**: Submit new vehicle details with grant/VOC photo attachment.
- **Parts Marketplace (`/parts`, `/cart`, `/cart/checkout`)**: Browse parts, add to cart, and checkout with delivery address selection.
- **Delivery Addresses (`/delivery-addresses`)**: Add, edit, delete, and choose a default address; the same records are visible and editable in Admin Company User details.
- **Invoices (`/invoices`, `/invoice/:id`)**: Historical workshop invoices with PDF view and download.
- **Compliance Reminders (`/reminders`)**: Inspection schedules, Puspakom due dates, and road tax renewals.
- **Android Back Behavior**: modal/screen handlers receive the first opportunity to close; otherwise a non-home back press uses a sliding route transition to Home. On Home (and workshop root), the first press shows a bilingual exit hint and a second press within two seconds exits the native app.

### 7.3 Workshop Floor Mode (`/workshop/jobs`)
- **Mechanic Job Board**: Real-time listing of active work orders assigned to the logged-in mechanic or workshop floor.
- **Stage Progression**: Advance jobs from `inspected` &rarr; `under_repair` &rarr; `ready_for_collection`.
- **Photo Upload**: Multi-photo upload tagged by category (`before`, `during`, `after`, `parts`) with customer visibility toggle.
- **Parts Requisition**: Request workshop parts from inventory directly to the job sheet.

---

## 8. Authentication & Session Management

### 8.1 Dual-Session Partitioning
To prevent session clashing during local development and multi-tab usage on shared domains, session cookies are explicitly partitioned using the `X-MAW-Portal` header:
- **Admin Portal**: Cookie Name = `MAWADMINSESSID` (sent with `X-MAW-Portal: admin`).
- **Customer Portal / Workshop**: Cookie Name = `MAWCUSTOMERSESSID` (sent with `X-MAW-Portal: customer`).
- **Fallback**: If `X-MAW-Portal` header is missing, standard default session name (`PHPSESSID`) is used.

### 8.2 Session Security & Lifetimes
- **Lifetime**: Configured for 365 days permanent session (`MAW_SESSION_COOKIE_LIFETIME = 31536000`). All portals share this setting in `connection.php`.
- **Session Regeneration**: `session_regenerate_id(true)` is executed upon successful login across Admin, Customer, and Workshop portals.
- **HttpOnly**: Enforced (`ini_set('session.cookie_httponly', '1')`).
- **Secure Flag**: Enabled dynamically on HTTPS connections (`ini_set('session.cookie_secure', '1')`).
- **SameSite**: `None` on HTTPS (to support Capacitor mobile webviews); `Lax` on HTTP.

> [!WARNING]
> **Session Security Risk (Technical Debt - Risk: Medium)**: All portals share a 365-day session lifetime. While persistent sessions provide convenience on mobile client apps, admin workstation sessions should enforce an 8–12 hour idle timeout.

### 8.3 CSRF Protection Scope
- **Customer Portal**: All state-modifying requests (`customer-create-vehicle`, `customer-create-booking`, `customer-create-parts-order`, `customer-respond-quotation`, `customer-logout`) strictly validate `X-CSRF-Token` against `$_SESSION['customer_csrf_token']` via `hash_equals()`.
- **Workshop Mode**: `workshop-upload-photo` and `workshop-assign-technician` validate `X-CSRF-Token`.
- **Admin Portal (Technical Debt - Risk: Medium)**: General Admin mutations rely on cookie authentication and role guards, but do **not** enforce CSRF token validation.

---

## 9. RBAC & Permission Matrix

Backend authorization is enforced in `api.php` via `requireAdminSession()`, `checkPermission()`, and `requireCustomerSession()`.

| Capability / API Action | Super Admin | Admin | Head Manager / Manager | Service Advisor | Receptionist | Foreman | Technician | Customer User |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Dashboard** | Yes | Yes | Yes | Yes | No | Yes | No | Company Only |
| **Check-in Booking / Walk-in** | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| **Create / Edit Work Order** | Yes | Yes | Yes | Yes | Yes | Yes | Update Only | No |
| **Issue Quotation** | Yes | Yes | Yes | Yes | No | No | No | No |
| **Approve Quotation (Admin Override)**| Yes | Yes | Yes | Yes | No | No | No | No |
| **Approve / Reject Quotation** | No | No | No | No | No | No | No | **Yes (Own Co)** |
| **Confirm Parts Ready** | Yes | Yes | Yes | No | No | No | No | No |
| **Clock Job to Under Repair** | Yes | Yes | Yes | Yes | No | Yes | Yes | No |
| **Upload Booking Issue Photos** | No | No | No | No | No | No | No | **Yes (Booking)** |
| **Upload Vehicle Grant Photos** | Yes | Yes | Yes | Yes | Yes | No | No | **Yes (Add Car)**|
| **Upload Workshop Inspection Photos**| Yes | Yes | Yes | Yes | Yes | Yes | **Yes** | **No** |
| **View Customer-Visible Photos** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | **Yes (Own Co)** |
| **Manage Parts & Prices** | Yes | Yes | Yes | View Only | No | View Only | View Only | View Only |
| **Create Purchase Order (PO)**| Yes | Yes | Yes | No | No | No | No | No |
| **Receive PO & Update Stock**| Yes | Yes | Yes | No | No | No | No | No |
| **Issue Workshop Invoice** | Yes | Yes | Yes | Yes | No | No | No | No |
| **Retry AutoCount Sync** | Yes | Yes | Yes | No | No | No | No | No |
| **View Audit Trail** | Yes | No | No | No | No | No | No | No |
| **View Application Logs** | Yes | No | No | No | No | No | No | No |
| **Manage Staff Accounts** | Yes | Yes | Yes | No | No | No | No | No |

---

## 10. Company-Level Data Isolation

MAW is an enterprise B2B multi-tenant fleet system. Data isolation rules:

1. **Server-Derived Identity**:
   - Customer authentication establishes `$_SESSION['customer_company_id']`.
   - All customer-facing queries in `api.php` (Vehicles, Bookings, Work Orders, Invoices, Parts Orders) **strictly filter by the session-derived `company_id`**.
2. **Anti-IDOR Policy**:
   - Request payloads containing arbitrary `company_id` values are ignored or rejected for non-superadmin customer sessions.
   - Access to vehicle histories or invoices validates that the target asset belongs to the authenticated customer's company.

---

## 11. Legacy / Canonical Status Mappings

To prevent confusion between database columns, API representations, and frontend labels, use this authoritative reference:

### 11.1 Booking Status Mapping

| Business / Canonical Status | Database Value (`customer_appointment.status` / `bookings.status`) | Frontend Display Label | Notes |
| :--- | :--- | :--- | :--- |
| `pending` | `pending` | Pending | Newly submitted by customer |
| `confirmed` | `upcoming` | Confirmed / Upcoming | Accepted by workshop scheduler |
| `in_progress` | `processing` / `converted` | In Progress / Converted | Checked-in and converted to Work Order |
| `completed` | `ready` / `completed` | Completed | Vehicle service finished |
| `cancelled` | `cancelled` | Cancelled | Cancelled by customer or admin |

> [!IMPORTANT]
> **AI Agent Invariant**: In the database, confirmed bookings are stored as `'upcoming'`. The helper `normalizedBookingLifecycleStatus()` translates `'upcoming'` &rarr; `'confirmed'`. Do NOT alter the database column value or create duplicate status columns.

### 11.2 Work Order Status Mapping

| Numeric Status (`job.status`) | Canonical Status String | Frontend Display Label | Lifecycle Meaning |
| :---: | :--- | :--- | :--- |
| `1` | `scheduled` | Scheduled | Appointment confirmed, vehicle not yet on-site |
| `3` | `checked_in` | Checked In | Vehicle physically arrived / Walk-in entry |
| `3` | `inspected` | Inspected | Initial mechanic diagnosis & inspection complete |
| `3` | `quotation_issued` | Quotation Issued | Quotation drafted and sent to customer |
| `3` | `approved` | Approved | Quotation approved by customer or admin |
| `3` | `parts_ready` | Parts Ready | All required spare parts are confirmed in stock |
| `4` | `under_repair` | Under Repair | Work currently in progress on workshop floor |
| `5` | `ready_for_collection` | Ready for Pickup | Repair completed, passed quality check |
| `7` | `collected` | Collected / Completed | Vehicle collected by customer/driver (Final) |

> [!NOTE]
> **Work Order Sub-stage Resolution**: The numeric column `job.status = 3` represents multiple active diagnostic and pre-repair stages. The canonical status is resolved dynamically in `api.php` from stage timestamps: `checkin_at`, `inspected_at`, `quotation_issued_at`, `approved_at`, `parts_ready_at`, `under_repair_at`, `completed_at`, and `collected_at`. Do not derive the detailed Work Order stage from `job.status` alone.

---

## 12. Business State Machines

### 12.1 Booking State Machine

```
   ┌─────────┐      Confirm       ┌───────────┐      Check-in      ┌───────────────────────┐
   │ pending ├───────────────────►│ confirmed ├───────────────────►│ Converted / In-Prog   │
   └────┬────┘                    └─────┬─────┘                    │ (Work Order Initiated)│
        │                               │                          └───────────────────────┘
        │ Cancel                        │ Cancel
        ▼                               ▼
   ┌───────────┐                  ┌───────────┐
   │ cancelled │                  │ cancelled │
   └───────────┘                  └───────────┘
```

| Current State | Target State | Trigger / Action | Allowed Roles | Preconditions & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `pending` | `confirmed` | `admin-update-booking` | Admin, Manager, Receptionist | Sets database status to `upcoming`. |
| `pending` | `cancelled` | `admin-update-booking` / Customer Cancel | Admin, Manager, Customer | Booking cancelled. |
| `confirmed` | `cancelled` | `admin-update-booking` | Admin, Manager | Booking cancelled. |
| `pending` / `confirmed` | Converted | `admin-check-in-booking` | Admin, Manager, Foreman | Converts booking to a new Work Order (`checked_in`). |

**Booking page UX rule**: opening `/bookings` from the Sidebar defaults to the unfiltered **Total Bookings** view. Pending bookings are surfaced by a Sidebar count badge and remain available through the Pending KPI/filter; the navigation link itself must not append `?status=Pending`.

---

### 12.2 Work Order State Machine

```
   ┌───────────────┐
   │   scheduled   │
   └───────┬───────┘
           │ Check-in (Admin)
           ▼
   ┌───────────────┐
   │  checked_in   │◄── [Walk-in Entry]
   └───────┬───────┘
           │ Complete Initial Diagnosis
           ▼
   ┌───────────────┐      Draft Quotation Issued      ┌──────────────────┐
   │   inspected   ├─────────────────────────────────►│ quotation_issued │
   └───────┬───────┘                                  └────────┬─────────┘
           │ Direct Approval                                   │ Customer / Admin Approve
           └─────────────────────┬─────────────────────────────┘
                                 ▼
                         ┌───────────────┐
                         │   approved    │
                         └───────┬───────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           │ (Parts Shortage)                          │ (Parts In Stock)
           ▼                                           ▼
   ┌───────────────┐                           ┌───────────────┐
   │  parts_ready  │                           │ under_repair  │
   └───────┬───────┘                           └───────┬───────┘
           │ All Parts Arrived                         │ Repair Completed
           └───────────────────────────────────────────►
                                                       │
                                                       ▼
                                               ┌──────────────────────┐
                                               │ ready_for_collection │
                                               └───────┬──────────────┘
                                                       │ Vehicle Collected (Admin)
                                                       ▼
                                               ┌──────────────────────┐
                                               │      collected       │ (Final State)
                                               └──────────────────────┘
```

| Current State | Allowed Next States | Guard / Preconditions | Allowed Roles | Side Effects / Timestamps Written |
| :--- | :--- | :--- | :--- | :--- |
| `scheduled` | `checked_in` | Vehicle physically arrived | Admin, Manager | `checkin_at = NOW()` |
| `checked_in` | `inspected` | Initial mechanic inspection complete | Admin, Foreman, Technician | `inspected_at = NOW()` |
| `inspected` | `quotation_issued` | Quotation issued to customer | Admin, Manager | `quotation_issued_at = NOW()` |
| `inspected` / `quotation_issued` | `approved` | Valid quotation with items approved by Customer or Admin | Admin, Manager, Customer | `approved_at = NOW()`, updates quotation status |
| `approved` | `parts_ready` | Work order has required parts and all required quantities are available in stock; blocked if parts shortage exists unless `is_back_order = 1` | Admin, Head Manager | `parts_ready_at = NOW()` |
| `approved` / `parts_ready` | `under_repair` | No parts are required (`parts_status = not_required`), or required parts are in stock; shortage strictly blocks transition from `approved` or `pending_parts` unless `is_back_order = 1` | Admin, Foreman, Technician | `under_repair_at = NOW()`, `parts_status = 'parts_ready'`; zero-part jobs do not require a manual Parts Ready action |
| `under_repair` | `ready_for_collection` | All repairs completed and QC passed | Admin, Foreman, Technician | `completed_at = NOW()` |
| `ready_for_collection` | `collected` | Handed over to driver/customer | Admin | `collected_at = NOW()` (Final) |

#### QC Meaning of Approved, Parts Ready, and Under Repair

These stages are not duplicates:

1. **Approved** records customer/admin authorization to perform the quoted work. It is a commercial approval gate, not proof that inventory is available and not proof that work has started.
2. **Parts Ready** is a conditional inventory gate. It only has operational meaning when the quotation/work order requires parts. For pure labour, inspection, or diagnostic work, the system records `parts_status = not_required` and the stage is skipped.
3. **Under Repair** records that physical workshop work has actually started. It may only follow approval plus either Parts Ready, Parts Not Required, or an explicit Back Order bypass.

The end-to-end expected path is:

- **Booking**: Scheduled &rarr; Checked In &rarr; Inspected &rarr; Quotation Issued &rarr; Approved &rarr; [Parts Ready only when required] &rarr; Under Repair &rarr; Ready for Collection &rarr; Collected.
- **Walk-in**: Checked In &rarr; Inspected &rarr; Quotation Issued &rarr; Approved &rarr; [Parts Ready only when required] &rarr; Under Repair &rarr; Ready for Collection &rarr; Collected.

#### Parts Shortage Gatekeeping & Back Order Policy
- **Purpose**: Strictly prevents work orders with unfulfilled parts requirements from advancing to repair without physical inventory or an explicit administrative bypass.
- **Flag**: `job.is_back_order` (TINYINT 1/0) & `work_order_invoice.is_back_order` (TINYINT 1/0).
- **Strict Shortage Gatekeeper**:
  1. If any required part has a quantity shortage (`shortageQuantity > 0`) and `is_back_order` is false, `getAllowedNextStatuses()` completely disables transitions to `parts_ready` and `under_repair`.
  2. The status dialog displays a warning banner: `"Parts shortage detected. Stock receiving or Back Order required to start repair."`
  3. The status modal header displays an amber alert: `"Inventory Shortage Detected · Repair On Hold"`.
- **Inline Back Order Authorization**:
  1. The status transition dialog features an inline toggle: `"Enable Back Order (Bypass Shortage) — Authorize repair execution while awaiting parts arrival"`.
  2. Toggling Back Order on immediately satisfies the gatekeeper, allowing the job to advance directly to `under_repair`.
  3. When `is_back_order = 1`, the status modal renders a purple badge: `"Back Order Bypass Active · Inventory shortage bypassed"`.
- **Dynamic Real-Time Stock Resolution (Zero Stale DB Dependency)**:
  1. In `backend/modules/work_orders.php`, stage transitions compute real-time stock balances dynamically via `automaticPartsStatusFromOverview($overview)` rather than relying on stale cached values in `job.parts_status`.
  2. When stock is received via Purchase Orders or adjusted via the Stock Ledger, the transition button immediately activates without requiring manual status workarounds.
- **Automatic Parts Status Commitment & Rollback**:
  1. Advancing to `under_repair` automatically sets `parts_status = 'parts_ready'` in the database.
  2. Rolling back a work order to `approved` cleanly resets `parts_status` to `'not_required'` or recalculates live shortage.
- **Post-Repair Parts Immutability**:
  1. Once a work order reaches `ready_for_collection` or `collected`, editing or deleting required parts is locked in the Admin UI and backend to preserve physical inventory audit integrity.
- **Parts Acknowledgment Timestamp Synchronization**:
  1. Advancing a work order lifecycle status or saving parts configurations in the Admin Panel automatically updates `parts_acknowledged_at = NOW()`, stamps `parts_acknowledged_by = adminId`, and records an updated `acknowledged_parts_snapshot`.
  2. Purchase Order submissions and stock arrivals similarly synchronize `parts_acknowledged_at`.
  3. A 2-second grace threshold prevents clock tick race conditions, ensuring that normal administrative status updates and inventory fulfillment never trigger false `New Parts · Review` warnings.

---

### 12.3 Quotation State Machine
- **States**: `draft` &rarr; `issued` &rarr; `approved` | `rejected`
- **Revisions**: If a customer rejects an issued quotation, the Admin can update line items and re-issue (`issued`), resetting approval timestamps.
- **Work Order Binding**: A Work Order cannot transition from `inspected`/`quotation_issued` to `approved` without an approved quotation.

---

### 12.4 Complete Invoice State Machine

The invoice system maintains two distinct lifecycles:

#### A. MAW Business Invoice Lifecycle (`work_order_invoice.status`)
```
   ┌─────────┐      Issue Invoice      ┌──────────┐      Record Payment      ┌────────┐
   │  draft  ├────────────────────────►│  issued  ├─────────────────────────►│  paid  │
   └────┬────┘                         └────┬─────┘   (Offline Invoices Only)└────────┘
        │                                   │
        │ Cancel                            │ Void / Cancel
        ▼                                   ▼
   ┌───────────┐                       ┌───────────┐
   │ cancelled │                       │   void    │
   └───────────┘                       └───────────┘
```

| Current Status | Target Status | Trigger | Preconditions & Guards |
| :--- | :--- | :--- | :--- |
| `draft` | `issued` | `admin-issue-work-order-invoice` | Work Order completed; line items validated; automatically enqueues outbox record |
| `issued` | `paid` | `admin-record-work-order-invoice-payment` | Only permitted when `sync_status = 'not_queued'` (offline invoices) |
| `draft` | `cancelled` | `admin-cancel-work-order-invoice` | Unsynced draft cancelled |
| `issued` | `void` | `admin-void-work-order-invoice` | Only allowed if AutoCount sync status is NOT `synced` |

#### B. AutoCount Invoice Sync Lifecycle (`work_order_invoice.sync_status` & `autocount_invoice_sync_queue.status`)
```
   ┌────────────┐      Invoice Issued      ┌─────────┐      Worker Pick      ┌────────────┐
   │ not_queued ├─────────────────────────►│ pending ├──────────────────────►│ processing │
   └────────────┘                          └────▲────┘                       └─────┬──────┘
                                                │                                  │
                                                │ Retry Trigger                    │
                                                │                           ┌──────┴──────┐
                                                │                           ▼             ▼
                                         ┌──────┴──────┐              ┌───────────┐ ┌───────────┐
                                         │   failed    │◄─────────────┤  failed   │ │ succeeded │
                                         └─────────────┘  Sync Error  └───────────┘ └───────────┘
```

| Queue Status (`autocount_invoice_sync_queue`) | Sync Status (`work_order_invoice`) | Trigger / Event | Side Effects / Data Written |
| :--- | :--- | :--- | :--- |
| `pending` | `pending` | Invoice issued in MAW | Inserted into `autocount_invoice_sync_queue` |
| `processing` | `processing` | AutoCount sync worker picks record | `locked_at = NOW()`, `attempt_count + 1` |
| `succeeded` | `synced` | Worker confirms AutoCount creation | Writes `invoice_no` (AutoCount DocNo), `e_invoice_uuid`, `synced_at = NOW()` |
| `failed` | `failed` | Worker catches AutoCount API error | Writes `error_message`, `sync_error`, unlocks row |

---

### 12.5 Purchase Order State Machine
- **Operational States**: `draft` &rarr; `pending_sync` / `ordered` &rarr; `partially_received` &rarr; `received`; eligible unreceived orders may be `cancelled`.
- **Primary Workflow**: Create and edit the PO in MAW &rarr; confirm and enqueue AutoCount &rarr; immediately download `MAW-PO-*.pdf` &rarr; manually send the PDF to the supplier through WhatsApp &rarr; record partial/full receiving in MAW.
- **PDF Authority**: The supplier PDF is generated from the confirmed MAW record and uses `internal_ref` as its stable PO reference. It does not wait for AutoCount. After sync, the AutoCount PO number is displayed as a secondary accounting reference.
- **Sync Independence**: `sync_status` (`queued`, `processing`, `synced`, `failed`) is separate from physical procurement. A queued or failed sync must not block PDF download or receiving. A late sync acknowledgement must preserve `partially_received` or `received` instead of reverting the PO to `ordered`.
- **WhatsApp Boundary**: MAW prepares the downloadable document; staff send it manually using WhatsApp. Direct WhatsApp API/message automation is not implemented.
- **Stock Impact**: Stock only increases upon calling `admin-receive-purchase-order`. Row locks (`FOR UPDATE`) calculate received deltas and update stock transactionally.

---

### 12.6 Parts Order State Machine
- **States**: `pending` &rarr; `confirmed` &rarr; `processing` &rarr; `shipped` | `ready_for_pickup` &rarr; `delivered` | `completed` | `cancelled`
- **AutoCount Link**: Dispatched orders enqueue an AutoCount Delivery Order (`autocount_parts_order_sync_queue`) to decrement inventory.

---

## 13. Database Architecture & Key Tables

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         DATABASE ENTITY RELATIONSHIPS                    │
│                                                                          │
│  company (id, autocount_debtor_code)                                     │
│   ├── users / customer (company_id) [Customer Login Users]               │
│   ├── customer_vehicle (company_id) [Vehicles]                           │
│   │    ├── vehicle_driver (vehicle_id) [Drivers]                         │
│   │    ├── customer_appointment / bookings (vehicle_id, company_id)      │
│   │    └── job (vehicle_id, company_id) [Work Orders]                    │
│   │         ├── work_order_photo (work_order_id)                         │
│   │         ├── work_order_quotation (work_order_id)                     │
│   │         │    └── work_order_quotation_item (quotation_id)            │
│   │         ├── work_order_part_requirement (work_order_id, part_id)     │
│   │         ├── purchase_order (work_order_id)                           │
│   │         │    └── purchase_order_item (purchase_order_id, part_id)    │
│   │         └── work_order_invoice (work_order_id, company_id)           │
│   │              ├── work_order_invoice_item (invoice_id)                │
│   │              └── autocount_invoice_sync_queue (invoice_id)           │
│   └── parts_orders (company_id, customer_id)                             │
│        ├── parts_order_items (order_id, part_id)                         │
│        └── autocount_parts_order_sync_queue (order_id)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Critical Tables & Indexes:
1. **`job` (Work Orders)**:
   - Primary Key: `id` | Unique: `job_card_no`
   - Key Fields: `company_id`, `vehicle_id`, `status` (1–7), `checkin_at`, `inspected_at`, `approved_at`, `under_repair_at`, `completed_at`, `collected_at`, `parts_status`.
2. **`work_order_invoice`**:
   - Primary Key: `id` | Unique: `internal_ref` (MAW internal tracking ID, e.g. `INV-202608-0001`).
   - Fields: `doc_type` (`INVOICE`, `DO`), `invoice_no` (Holds official AutoCount `DocNo` after sync), `autocount_do_no` (Holds official AutoCount `DO No`), `internal_ref`, `sync_status`, `synced_at`, `e_invoice_uuid`.
3. **`autocount_invoice_sync_queue`** (Canonical Table Name):
   - Primary Key: `id` | Unique Key: `(invoice_id, operation)`
   - Fields: `status` (`pending`, `processing`, `succeeded`, `failed`, `cancelled`), `attempt_count`, `locked_at`, `completed_at`, `error_message`, `response_payload`.
4. **`parts`**:
   - Primary Key: `id` | Unique: `sku` / `part_number` | Indexed: `autocount_item_code`
   - Stock Fields: `stock`, `min_stock`, `cost_price`, `selling_price`.
5. **`admin_audit_log`**:
   - Primary Key: `id` | Indexed: `(created_at, id)`, `(actor_id, created_at)`, `(action, created_at)`.
   - Application-level append-only schema recording actor, action, metadata diffs, IP, and timestamp.

---

## 14. Key Database Migrations

Migrations are sequentially applied SQL files located in `backend/migrations/`:

```
001_phase1_extensions.sql               -- Work order foundational columns & stages
002_customer_company_access.sql         -- Company-level multi-tenant isolation
003_vehicle_verification.sql            -- Customer vehicle verification workflows
004_vehicle_operational_status.sql      -- Vehicle operational status tracking
005_container_haulage_vehicle_fields.sql-- Container haulage prime mover & trailer specifications
006_staff_accounts.sql                  -- Staff roles, authentication, and assignable technicians
007_complete_vehicle_profile_fields.sql -- Heavy fleet specs (chassis, engine, BTM, BDM, axles)
008_complete_booking_fields.sql         -- Enhanced customer appointment scheduling fields
009_booking_checkin_work_order.sql      -- Booking check-in to active work order conversion
010_parts_inventory_fields.sql          -- Bin location, barcode, min/max safety stock levels
011_customer_parts_orders.sql           -- Customer App spare parts e-commerce orders
012_autocount_parts_import.sql          -- AutoCount item master catalogue ingestion schema
013_work_order_stage_timestamps.sql     -- Detailed lifecycle stage timestamps (checkin, inspected, etc.)
014_work_order_quotation_stage.sql      -- Quotation issuing and approval stage markers
015_work_order_quotations.sql           -- Work order quotation engine and line item tables
016_system_settings.sql                 -- Central system settings key-value store
017_quotation_service_types.sql         -- Service types and labour pricing defaults
018_work_order_invoices.sql             -- Internal work order invoice records and numbering
019_optional_vehicle_number.sql         -- Flexible vehicle registration numbering rules
020_work_order_parts_status.sql         -- Granular work order parts availability status tracking
021_company_users_and_drivers.sql       -- Separation of Company User logins vs. Driver data
022_walk_in_work_orders.sql             -- Direct Walk-in reception and immediate check-in execution
023_autocount_ready_workflow.sql        -- AutoCount invoice preparation flags and ready markers
024_maw_invoice_autocount_outbox.sql    -- Creates canonical table: autocount_invoice_sync_queue
025_purchase_orders.sql                 -- Creates purchase_order & autocount_purchase_order_sync_queue
026_autocount_item_master.sql           -- AutoCount item master synchronization mapping
027_work_order_photos.sql               -- Workshop inspection photo records & customer visibility
027_work_order_quotation_item_tax.sql   -- Quotation item tax codes, rates, and SST calculations
028_autocount_creditor_master.sql       -- Supplier creditor codes and AutoCount sync
029_work_order_part_requirements.sql    -- Explicit work order part requisitions and fulfillment
030_work_order_status_history.sql       -- Work order stage transition historical audit log
031_admin_audit_trail.sql               -- Creates admin_audit_log table
032_vehicle_autocount_preset.sql        -- Vehicle preset configurations for AutoCount alignment
033_mewahtrans_invoice_sync_preset.sql  -- Demo fleet invoice preset mappings
034_parts_order_autocount_do_queue.sql  -- Creates autocount_parts_order_sync_queue
035_work_order_doc_type_and_do_sync.sql -- Document type selection (Sales Invoice vs. Delivery Order)
036_vehicle_documents.sql               -- Compliance document files, expiry, review state, and upload history
037_customer_delivery_addresses.sql     -- Persistent Company User delivery-address JSON storage
037_job_customer_id_nullable.sql        -- Supports B2B fleet walk-ins without individual customer user
038_company_user_active_status.sql      -- Soft-disable active flag for company user accounts
038_job_actual_issue.sql                -- Adds actual_issue column for technician inspection findings
039_part_stock_transactions.sql         -- Immutable inventory movement & audit ledger (part_stock_transactions)
040_sync_vehicle_plates_and_invoices.sql-- Synchronizes vehicle registration plates across historical invoices
041_seed_vehicle_service_history_demo.sql-- Realistic commercial vehicle maintenance history simulation
042_sync_vehicle_profile_mileage_and_history.sql-- Harmonizes vehicle profile odometer readings with work order visits
043_enforce_single_active_work_order_per_vehicle.sql-- Enforces rule: Exactly one active workshop job per vehicle
044_enrich_realistic_demo_operations.sql-- Comprehensive 5-month operational staging demonstration dataset
045_vehicle_mileage_ledger_and_scale_indexes.sql-- Immutable vehicle_mileage_log and composite high-scale indexes
046_system_wide_scale_and_performance_indexes.sql-- High-concurrency composite indexes across all subsystems
```

---

## 15. API Architecture & Conventions

### 15.1 Request Protocol
- **Endpoint**: Single gateway `api.php?mode=<action_name>`.
- **Headers**:
  - `X-MAW-Portal`: `admin` | `customer` (Enforces session cookie partitioning).
  - `X-CSRF-Token`: Required for state-modifying customer/workshop actions.
  - `Content-Type`: `application/json` (or `multipart/form-data` for file uploads).

### 15.2 Standard Response Envelope
```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": { ... }
}
```

On error:
```json
{
  "success": false,
  "message": "Error description message.",
  "data": null
}
```

### 15.3 HTTP Status Codes
- `200 OK`: Request succeeded.
- `400 Bad Request`: Validation failure or malformed payload.
- `401 Unauthorized`: Missing or expired session cookie.
- `403 Forbidden`: Insufficient role permissions or CSRF token mismatch.
- `404 Not Found`: Target entity does not exist.
- `409 Conflict`: Invalid state machine transition or unfulfilled business guard.
- `422 Unprocessable Entity`: Semantic data validation failure.
- `500 Internal Server Error`: Unhandled server exception.
- `503 Service Unavailable`: Database down or configuration missing.

---

## 16. Inventory Authority & Reconciliation Rules

### 16.1 Operational vs. Accounting Inventory
1. **Purchasing & Inward Stock**:
   - Stock does **not** increase when a Purchase Order is created.
   - Stock only increases when `admin-receive-purchase-order` is executed. The delta between previously received quantity and newly received quantity is added to `parts.stock` inside a database transaction with row locks (`FOR UPDATE`).
2. **Workshop Part Consumption**:
   - Requisitioned parts attached to a Work Order require stock availability. If insufficient, `parts_status` becomes `pending_parts`, blocking repair commencement.
3. **Periodic AutoCount Synchronization**:
   - The AutoCount Sync Program (`StockBalanceSynchronization`) reads the AutoCount stock balance and writes it to `parts.stock` in MAW.
   - **Reconciliation Risk (Technical Debt - Risk: High)**: If a PO is received in MAW but not yet entered into AutoCount as a Goods Received Note (GRN), a subsequent AutoCount stock balance sync will overwrite MAW's stock quantity. Physical warehouse stock operations must be mirrored in AutoCount GRNs before sync cycles.

### 16.2 Strict Inventory Stock Adjustment & Audit Ledger Enforcement
To guarantee complete inventory traceability and eliminate unexplained stock variances:
1. **Disabled Direct Stock Editing**: The `Stock Quantity` input field on both the Standalone Part Detail View and the Edit Part Modal is `disabled` and grayed out (`cursor-not-allowed select-none bg-slate-100`). Direct inline editing of stock balance during general metadata editing is permanently locked.
2. **Dedicated Stock Ledger & History Action**: Stock quantities can only be modified via the `Stock Ledger & History` modal using the `Adjust in History ↗` direct link button.
3. **Mandatory Audit Reason**: Calling `admin-adjust-part-stock` strictly requires both an integer stock quantity and a non-empty audit reason explaining the variance (e.g. `Physical stock count correction`, `Damaged goods write-off`, `Supplier return`).
4. **Immutable Transaction Ledger**: Every adjustment writes an immutable record to `part_stock_transactions` with `transaction_type = 'manual_adjust'`, capturing previous stock, new stock, delta, reason, actor name, actor ID, and timestamp.
5. **Metadata Update Protection**: During regular part metadata updates (`admin-update-part` for selling price, cost price, description, bin location, or supplier), the system preserves the existing physical stock (`stock: editingPart.stock`), eliminating accidental stock overwrites.

---

## 17. Invoice Ownership & Financial Document Rules

### 17.1 Invoice Identification
- **`internal_ref`**: MAW unique internal tracking identifier (e.g. `INV-202608-0001`), generated at invoice creation and used as the idempotency reference for AutoCount sync.
- **`invoice_no`**: Stores the official AutoCount `DocNo` once synchronization succeeds.

### 17.2 Payment Status Ownership
- **Unqueued / Offline Invoices**: If an invoice is not queued to AutoCount (`sync_status = 'not_queued'`), MAW allows recording an operational payment via `admin-record-work-order-invoice-payment`.
- **Queued / Synced Invoices**: For all synced invoices, **AutoCount is the exclusive authority for payments and balance settlements**. Manual payment entry in MAW is blocked with error `Payment is maintained in AutoCount and must be returned through the sync program.`
- **AutoCount Payment Ingestion**: The endpoint `sync-update-autocount-invoice` ingests AutoCount outstanding balances and automatically sets `status = 'paid'` or `'partially_paid'`.
- **Invoice Immutability**: Synced invoices cannot be edited or voided in MAW. Voids and credit notes must originate in AutoCount and synchronize back to MAW.

### 17.3 Document Type Selection (Invoice vs. Delivery Order / DO)
- **Work Order Invoicing Options**: Workshop admins can choose whether a completed work order issues as a **Sales Invoice** (`doc_type = 'INVOICE'`) or a **Delivery Order** (`doc_type = 'DO'`).
- **Fleet Term Accounts Workflow**: For logistics companies operating on monthly term accounts, issuing as DO generates an AutoCount Delivery Order (`autocount_parts_order_sync_queue`) with signature lines for driver vehicle release. Finance consolidates all monthly DOs into one monthly invoice directly inside AutoCount.

### 17.4 Streamlined Invoices Workspace & Financial Document Layout
1. **Dedicated Table Columns**: The Invoices table in `/invoices` is streamlined into dedicated, high-readability columns:
   - `Invoice / DO #`: Displays primary MAW reference (e.g., `INV-202609-0001` or `DO-202609-0001`) with copy action, and official AutoCount `DocNo` badge when synced.
   - `Issue Date`: Formal document issuance date.
   - `Due Date`: Calculated based on company payment terms (`invoice_date + credit_terms`).
   - `Vehicle Plate & Model`: Vehicle registration number and equipment model.
   - `Customer / Company`: Company name and AutoCount Debtor Code.
   - `Total Amount`: Total payable formatted in MYR.
   - `Sync Status`: Visual status badge (`synced`, `pending`, `failed`, `not_queued`).
   - `Payment Status`: Visual pill (`paid`, `unpaid`, `partially_paid`).
   - `Actions`: View details, download PDF, retry sync.
2. **Unified Filter & Tab Architecture**: Removed top-heavy KPI summary cards; adopted the unified filter and tab card architecture matching the Vehicles/Equipment module.
3. **Conditional Tax Presentation**: Tax breakdown summaries in invoice dialogs and printed documents are conditionally displayed only when tax is incurred (`tax_amount > 0` or a non-zero SST rate applies). For zero-tax or tax-exempt transactions, the tax breakdown table is cleanly hidden.
4. **Direct Company Addressing**: Invoices and quotations are formally addressed directly to the client `Company` (with Debtor Code and business address), eliminating redundant individual user names from enterprise financial documents.

---

## 18. AutoCount Integration Architecture

| Sync Entity | Direction | MAW Table / Endpoint | AutoCount Object | Sync Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Debtor (Company)** | **AutoCount &rarr; MAW** | `company` | `Debtor` | Scheduled C# master sync |
| **Creditor (Supplier)**| **AutoCount &rarr; MAW** | `suppliers` | `Creditor` | Scheduled C# master sync |
| **Item Master (Parts)**| **AutoCount &rarr; MAW** | `parts` | `Item` | Scheduled C# master sync |
| **Project Codes** | **AutoCount &rarr; MAW** | `customer_vehicle` | `[Project]` | Maps haulage prime mover codes |
| **Sales Invoices (History)**| **AutoCount &rarr; MAW** | `accounting_invoice` | `Sales.Invoice` | Ingests official accounting invoices |
| **Workshop Invoice Queue** | **MAW &rarr; AutoCount** | `autocount_invoice_sync_queue` | `Sales.Invoice` | Outbox polling via `sync-pull-autocount-invoice` |
| **Parts Order DO Queue** | **MAW &rarr; AutoCount** | `autocount_parts_order_sync_queue`| `Sales.DeliveryOrder`| Outbox polling via `sync-pull-autocount-parts-order` |
| **Purchase Order Queue** | **MAW &rarr; AutoCount** | `autocount_purchase_order_sync_queue`| `Purchase.PurchaseOrder`| Outbox polling via `sync-pull-autocount-purchase-order` |

---

## 19. Transactional Outbox Pattern & Idempotency

### 19.1 Idempotency Matrix

| Document Type | Queue Table | Idempotency Key | AutoCount Pre-check Method | Duplicate Protection Level |
| :--- | :--- | :--- | :--- | :--- |
| **Workshop Invoice** | `autocount_invoice_sync_queue` | `(invoice_id, 'create')` & `internal_ref` | Worker checks existing `DocNo` / `RefNo` in AutoCount | **Database Unique + SDK Pre-check** |
| **Parts Order DO** | `autocount_parts_order_sync_queue` | `(order_id, 'create')` & `order_number` | Worker checks existing DO by `RefNo` | **Database Unique + SDK Pre-check** |
| **Purchase Order** | `autocount_purchase_order_sync_queue` | `(purchase_order_id, 'create')` & `internal_ref` | Checked by PO reference | **Database Unique + SDK Pre-check** |

### 19.2 Processing Rules
1. **Event Staging**: Outbox queue records are inserted inside the same database transaction as the business action.
2. **Safe Retries**: The unique constraints prevent duplicate queue items. Workers verify AutoCount existence before inserting to ensure network timeouts do not generate duplicate accounting documents.
3. **Locking**: Workers set `status = 'processing'` and timestamp `locked_at = NOW()` to prevent concurrent duplicate processing. Expired locks (>15 min) are automatically reclaimed.

### 19.3 Non-Stock & Free-Text Line Items Policy
To prevent sync failures on ad-hoc repairs, labour fees, and non-inventory parts:
1. **Track A (Standard Parts with `ItemCode`)**: Items matched in AutoCount `Item` master or MAW `parts.autocount_item_code` sync with their formal ItemCode and deduct AutoCount inventory.
2. **Track B (Non-Stock / Free-Text Items)**: Items without an `ItemCode` (e.g. labour charges, subcontract lathing, ad-hoc hardware) pass through with empty `itemCode` and preserve the full line `description`, `quantity`, and `amount`. AutoCount registers these as standard description lines without requiring an item master code or failing sync.

---

## 20. File & Media Storage Security

- **Storage Location**: `backend/storage/work-order-photos/`.
- **Direct HTTP Access Protection**:
  - `backend/storage/.htaccess` contains `Require all denied` / `Deny from all`. On Apache/cPanel hosts, direct browser requests are blocked at the web server level.
  - On Nginx hosts without `.htaccess` support, the `/storage/` directory must be explicitly configured as `internal` or denied.
- **PHP Streaming Gateway (`api.php?mode=work-order-photo&id=<id>`)**:
  - Validates authentication (staff role or matching customer company ownership).
  - Enforces Path Traversal Defense via `realpath()` ensuring resolved file paths remain strictly inside the storage directory root.
- **Upload Validation**:
  - File extension & MIME-type checks (JPEG, PNG, WebP).
- Maximum upload size: 10MB per photo.

### 20.1 Vehicle Compliance Documents

- **Migration**: `036_vehicle_documents.sql` creates `vehicle_document` with vehicle/type/expiry/file metadata, review status, rejection reason, uploader, reviewer, and timestamps.
- **Supported Types**: Insurance (`insurance`), Road Tax (`road_tax`), and PUSPAKOM (`puspakom`).
- **Upload Rules**: PDF, JPEG, PNG, WebP, HEIC, or HEIF; maximum 10 MB. Expiry cannot be before today or earlier than the vehicle's currently recorded expiry date. A replacement supersedes an earlier pending upload of the same type.
- **Review Lifecycle**: `pending` &rarr; `approved` or `rejected`; older pending versions may become `superseded`. Approval updates the vehicle's active compliance expiry; rejection requires a reason.
- **Storage**: binary files are kept under protected `backend/storage/vehicle-documents/YYYY/MM/`; the database stores metadata and relative path, not the file blob.
- **Viewing**: files are streamed through authenticated `api.php?mode=vehicle-document-file&id=<id>` with admin or same-company authorization. Images and PDFs open in an in-app/Admin modal preview; the UI must not use a new browser tab. PDF and image files share the same authorization/review pipeline, with different preview renderers.

### 20.2 Customer Delivery Addresses

- **Migration**: `037_customer_delivery_addresses.sql` adds `delivery_addresses LONGTEXT` to the active `customer` or legacy `users` account table.
- **Data Shape**: each record stores a unique ID, contact name, full address, normalized Malaysian contact phone, and `isDefault` flag. Maximum 20 addresses per account; exactly one default is maintained whenever at least one address exists.
- **Surfaces**: Customer App `/delivery-addresses` supports add/edit/delete/default selection and checkout consumption. Admin `/customers` details and Edit User display and manage the same persisted list.

---

## 21. Notification Architecture

- **Active Channels**:
  - In-App notifications and badge indicators on Admin Panel and Customer App.
  - Automated compliance reminders for Puspakom inspection due dates, insurance, and road tax renewals.
- **Planned Channels (Not Yet Implemented)**:
  - Automated WhatsApp notifications via WhatsApp Business API / webhook dispatcher.
  - SMS fallback notifications.

---

## 22. Administrative Audit Trail

- **Implementation**: Application-level append-only table `admin_audit_log`.
- **Tracked Events**: All state-modifying actions (`create`, `update`, `delete`, `issue`, `approve`, `receive`, `sync-retry`).
- **Metadata Protection**: Automatic sanitization (`auditSafeMetadata()`) redacts sensitive keys (passwords, tokens, cookies, secrets) before writing JSON metadata payloads.

---

## 23. Application Logs & Monitoring

- **Log File**: `backend/storage/logs/app-YYYY-MM.log`.
- **Format**: Structured JSON lines containing timestamp, log level (`FATAL`, `ERROR`, `WARN`, `INFO`), message, context, mode, client IP, and actor ID.
- **Slow Request Detection**: Automatically logs a `WARN` for any API request with execution time &ge; 2.0 seconds (`MAW_REQUEST_START`).
- **Fatal Error Trap**: PHP `register_shutdown_function()` captures unhandled fatal errors and writes them to the log with a 500 response.
- **Log Security**: `backend/storage/logs/.htaccess` enforces `Require all denied`.
- **Log Retention (Technical Debt - Risk: Low)**: Log files accumulate monthly without automated log rotation/cleanup scripts.

---

## 24. Developer Environment & Local Setup

### Prerequisites
- **Node.js**: v20+ LTS
- **Package Manager**: `pnpm` (`corepack enable`)
- **PHP**: PHP 8.1+ (with `mysqli` extension)

### Quick Start Commands

```bash
# 1. Start Admin Panel (Port 5173)
cd MAW_AdminPanel
pnpm install
pnpm dev

# 2. Start Customer App (Port 5174) in a separate terminal
cd MAW_CustomerApp
pnpm install
pnpm dev
```

*Both dev servers proxy `/api` requests to the remote Staging API by default.*

---

## 25. Build & Packaging Commands

### Admin Panel Packaging
```bash
cd MAW_AdminPanel
pnpm run pack                 # Builds both Production and Staging zip packages
pnpm run pack:production-only  # Builds AdminSystem_Update.zip
pnpm run pack:staging-only     # Builds AdminSystem_Update_Staging.zip
```

### Customer App Packaging
```bash
cd MAW_CustomerApp
pnpm typecheck            # TypeScript compiler check
pnpm run pack                 # Builds CustomerApp_Update.zip
```

---

## 26. Expected Production Deployment Architecture

```
Hosting Environment (cPanel / Linux)
├── /home/CPANEL_USER/
│   ├── maw_db_config.php            <-- Private Credentials (NOT in git)
│   └── public_html/
│       ├── index.html               <-- Admin Panel (Production)
│       ├── assets/
│       ├── staging/                 <-- Admin Panel (Staging)
│       │   ├── index.html
│       │   └── api_staging/
│       │       └── api.php          <-- Staging API Gateway
│       └── api/
│           ├── api.php              <-- Production API Gateway
│           └── storage/             <-- Web-access-restricted storage (.htaccess)
│
Windows Host (On-Premise / Sync Server)
└── C:\MAW_Sync\
    ├── Autocount_Sync_Program.exe   <-- C# WinForms / Worker Process
    ├── config.json                  <-- Server & DB Connection Config
    └── logs\                        <-- Sync Service Logs
```

---

## 27. Standard Operating Procedure (SOP): Production Deployment

### Step 1: Pre-Deployment Verification
1. Run `pnpm build` in `MAW_AdminPanel`.
2. Run `pnpm typecheck` and `pnpm build` in `MAW_CustomerApp`.
3. Confirm that all new migrations have been executed and verified in Staging.
4. Verify that the AutoCount Sync Service is healthy on Staging.

### Step 2: Production Preparation
1. Perform a full MySQL dump backup of `mewahautoworksystem`.
2. Confirm that the current production release zip is archived for fast rollback.

### Step 3: Deployment Execution
1. Run `php backend/run_migrations.php --status`, then apply pending migrations with the guarded runner after taking a verified backup.
2. Upload and extract `AdminSystem_Update.zip` to the production web root.
3. Upload and extract `CustomerApp_Update.zip` to the customer app web root.
4. The Admin release package deploys the API, migrations, and authenticated PDF receiver together.
5. Verify file permissions (`storage/` and `uploads/invoices/` must be writable: `0750`).

### Step 4: Post-Deployment Smoke Test
- Execute the [Production Smoke Test Checklist](#33-production-smoke-test-checklist).

---

## 28. Rollback & Failure Recovery

### Frontend Failure
- Immediately extract the previous release zip package (`AdminSystem_Update_Previous.zip` or `CustomerApp_Update_Previous.zip`) over the web root.

### Backend API Failure
- Revert `backend/api.php` to the previous Git commit.

### Database Migration Failure
- Restore the pre-deployment database dump taken in Step 2.

### AutoCount Sync Failure Recovery
> [!CRITICAL]
> **Duplicate Protection Rule**: Never manually re-queue or force-create an AutoCount document without first searching AutoCount by `internal_ref`. A timeout could have occurred *after* AutoCount successfully inserted the document.

---

## 29. Backup & Disaster Recovery

- **Current Status**: Manual database exports via cPanel / mysqldump before releases.
- **Recommended Formal Policy (Technical Debt - Risk: High)**:
  - Automated daily mysqldump cron with 30-day off-site retention.
  - Daily incremental backup of `backend/storage/work-order-photos/`.
  - Monthly automated backup restoration drills on a staging instance.

---

## 30. AutoCount Sync Service Operations

### 30.1 Application Runtime & Deployment
- **Operating Environment**: Windows Server / Windows 10+ running .NET Framework 4.8.
- **Application Type**: WinForms desktop application (`FormMain.cs`) with background worker threads.
- **Configuration**: Loaded from `config.json` via `ConfigManager.cs` (or fallback defaults in `StartupData.cs`).
- **Restart Procedure**: If synchronization freezes or encounters an unhandled COM/SDK exception, close the `Autocount_Sync_Program.exe` application window or terminate the process in Task Manager, then restart the application executable.

### 30.2 Queue Ingestion & Outbox Handlers

| Sync Operation / Queue | Pull Endpoint / Method | Trigger Mechanism | Polling / Execution Cadence | Error & Retry Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Debtor / Creditor / Items** | Direct C# SDK Ingestion | Scheduled Background Thread | Periodic / Manual button trigger | Logged to UI list box; retried next run |
| **Workshop Invoice Outbox** | `sync-pull-autocount-invoice` | Polling Worker / Admin Retry | Worker cycle / On-demand admin trigger | Records error in `autocount_invoice_sync_queue`; retriable |
| **Parts Order DO Outbox** | `sync-pull-autocount-parts-order` | Polling Worker / Admin Dispatch | Worker cycle / On-demand admin trigger | Sets status `failed`; retriable via Admin Panel |
| **Purchase Order Outbox** | `sync-pull-autocount-purchase-order` | Polling Worker / Admin Dispatch | Worker cycle / On-demand admin trigger | Sets status `failed`; retriable via Admin Panel |

*Note: Polling execution cadence depends on the server's background thread configuration in `config.json`.*

---

## 31. Testing & Regression Strategy

### 31.1 Build & Static Verification
- **Admin Panel**: `pnpm build` (Validates Vite compilation and bundling).
- **Customer App**: `pnpm typecheck` (TypeScript strict mode) & `pnpm build`.
- **Backend API**: Currently evaluated via end-to-end regression workflows (*Automated PHPUnit test suites not yet implemented*).

### 31.2 Critical Business Regression Flows
1. **Booking Check-in**: Customer Booking &rarr; Admin Check-in &rarr; Work Order created with initial status `checked_in`.
2. **Walk-in Entry**: Admin direct Walk-in &rarr; Work Order created directly with `checked_in`.
3. **Quotation & Approval Guard**: Work Order cannot clock to `approved` or `under_repair` without an approved quotation.
4. **Parts Readiness Guard**: Work Order cannot start repair while parts remain in `pending_parts` or `partially_arrived`.
5. **Workshop Clocking & Photos**: Mechanic clocks stages and uploads inspection photos with customer visibility flags.
6. **PO Inward Receiving**: PO receiving increments `parts.stock` transactionally (`FOR UPDATE`).
7. **Invoice Generation & Sync**: Issued invoice creates outbox record &rarr; AutoCount sync confirms `DocNo` &rarr; invoice becomes immutable.
8. **Multi-Tenant Isolation**: Customers cannot access vehicles, bookings, work orders, or invoices outside their company.

### 31.3 Security Regression Checks
- Test IDOR access by manipulating entity IDs belonging to other companies.
- Test Customer state-changing endpoints with missing or invalid `X-CSRF-Token`.
- Test path traversal attempts against photo streaming (`api.php?mode=work-order-photo`).
- Verify direct browser access to `/storage/` files is blocked by web server `.htaccess`.

---

## 32. Operational Troubleshooting Runbook

### Symptom: Customer Cannot Log In
1. Verify user exists in `customer` or `users` table and is linked to a valid `company_id`.
2. Verify account is active (`is_active = 1`).
3. Check `storage/logs/app-YYYY-MM.log` for `customer-login` error entries.

### Symptom: Customer Cannot See Vehicles
1. Verify vehicle records in `customer_vehicle` have `company_id` matching customer's company.
2. Check `verification_status` of the vehicles (`approved` vs `pending_verification`).

### Symptom: Work Order Cannot Advance to Under Repair
1. Check the Work Order's `parts_status`. If `pending_parts` or `partially_arrived`, the system blocks advancement until all required parts are marked `parts_ready`.

### Symptom: Invoice Stuck in "Pending AutoCount"
1. Open Admin Panel `/autocount-sync`.
2. Check `autocount_invoice_sync_queue` for error messages or network timeouts.
3. Verify the AutoCount Sync Program is running on the Windows server.

### Symptom: Parts Order DO Sync Stuck
1. Check `autocount_parts_order_sync_queue` for failed status and error message.
2. Confirm the Debtor Code exists and credit limit is not exceeded in AutoCount.

### Symptom: Purchase Order Sync Stuck
1. Check `autocount_purchase_order_sync_queue` for failed status.
2. Confirm supplier creditor code exists in AutoCount.
3. Retry the sync from Purchase Orders. PDF download, supplier communication, and MAW receiving may continue while the accounting sync is being repaired.

---

## 33. Production Smoke Test Checklist

- [ ] Admin login succeeds.
- [ ] Customer login succeeds; company fleet displays correctly.
- [ ] Workshop mechanic login succeeds via Unified Login.
- [ ] Admin dashboard loads active KPIs.
- [ ] Create test booking and convert to Work Order.
- [ ] Upload test inspection photo in Workshop mode and verify Customer visibility.
- [ ] Issue quotation and approve via Customer App.
- [ ] Confirm a test Purchase Order and verify an outbox row is created automatically.
- [ ] Download its PDF before AutoCount completes, verify supplier/items/totals, and confirm the file is suitable for manual WhatsApp delivery.
- [ ] Receive a queued/failed-sync Purchase Order and verify inventory count increases; later AutoCount acknowledgement must not regress the receiving status.
- [ ] Generate Work Order invoice and confirm outbox row creation.
- [ ] Verify `admin_audit_log` captured the actions.
- [ ] Verify `storage/logs/app-YYYY-MM.log` contains zero new fatal/500 errors.

---

## 34. Security & Production Standards

1. **No Credentials in Git**: Passwords, API tokens, and database credentials must never be committed.
2. **Prepared Statements & Parameter Binding**: All SQL queries taking user input must use parameter escaping or prepared statements.
3. **Strict CSRF Enforcement**: All state-modifying requests from customer and workshop clients must validate `X-CSRF-Token`.
4. **Directory Traversal Defense**: All file serving endpoints must resolve and validate realpaths within `storage/`.

---

## 35. Critical System Invariants — DO NOT BREAK

1. **Multi-Tenant Isolation**: Customers must **never** see or modify vehicles, bookings, work orders, or invoices belonging to another company.
2. **Single Accounting Source of Truth**: MAW must **never** fabricate official accounting invoice numbers; official `DocNo` originates from AutoCount.
3. **No Duplicate Syncing**: Retrying an AutoCount sync queue item must be idempotent and must **never** generate duplicate accounting invoices, DOs, or POs.
4. **Payment Authority Guard**: MAW operational payment status must not be recorded for synced invoices; AutoCount is the authoritative source for payments and debtor balances.
5. **Quotation Approval Guard**: A Work Order cannot start repair without an approved quotation.
6. **Parts Readiness Guard**: A Work Order cannot start repair while parts remain in `pending_parts` status.
7. **Immutable Invoices**: Invoices marked as `synced` in AutoCount cannot be modified or deleted in MAW.
8. **Application-Level Append-Only Audit Log**: Audit trail rows must never be updated or deleted.
9. **Canonical Booking Mapping**: In the database, confirmed bookings are stored as `'upcoming'`.

---

## 36. Known Risks, Limitations & Technical Debt

| Item | Severity | Description | Recommended Remediation |
| :--- | :---: | :--- | :--- |
| **Inventory Overwrite Risk** | **High** | AutoCount stock balance sync can overwrite MAW stock if POs/GRNs are not synchronized in real-time. | Transition to delta-based stock movement syncing rather than full balance overwriting. |
| **Backup Automation** | **High** | Backups are manual rather than automated on a formal schedule. | Implement automated daily off-site mysqldump and storage snapshot crons. |
| **Implicit Production DB Fallback** | **Medium** | `connection.php` defaults unknown hosts to `production`. | Enforce explicit `MAW_ENV` environment variable (fail closed on unknown host). |
| **Long Session Lifetime** | **Medium** | Admin sessions persist for 365 days without server-side idle timeout. | Introduce a 12-hour idle timeout for administrative staff sessions. |
| **Admin CSRF Coverage** | **Medium** | Admin mutations rely on cookie auth without CSRF token validation. | Add standard CSRF middleware across all `admin-` mutation endpoints. |
| **Monolithic `api.php` Architecture** | **Medium** | `backend/api.php` is a single file exceeding 13,000 lines. | Modularize route controllers into discrete handler files. |
| **Automated Backend Testing** | **Medium** | Backend lacks automated PHPUnit integration test suites. | Introduce automated CI tests for critical stage state machines and RBAC. |

---

## 37. Release & Change Management

- **Current Version**: `2.7.0` (Updated 2026-09-09)
- **Release Strategy**: Staging-First verification. All releases are packaged using the unified Vite builder script.
- **Unified Distribution Artifact**:
  - `MAW_AdminPanel/AdminSystem_Update.zip` — Unified distribution bundle containing both Production (`/`) and Staging (`/staging/`) builds.
  - Generated via: `node package-build.js --mode all` inside `MAW_AdminPanel/`.
  - Customer App Bundle: `MAW_CustomerApp/CustomerApp_Update.zip`.

---

## 38. Enterprise Operational & Audit Enhancements (v2.4.0)

### 38.1 Universal Excel Export Engine
- Standardized client-side `.xlsx` report generator using `exceljs` across all tabular administrative views:
  - **Work Orders**: Filtered/Full export with stage, parts status, dates, and amounts.
  - **Quotations & Invoices**: Financial itemization, tax breakdown, sync status, and customer debtor mappings.
  - **Customers & Vehicles**: Fleet master data, Puspakom expiry dates, road tax status, and contact records.
  - **Inventory & Suppliers**: SKU catalog, live stock balance, reorder levels, cost prices, and creditor ledgers.
  - **Audit Trail & Application Logs**: Security and technical diagnostic logs with actor, IP, timestamp, and message.

### 38.2 Zero-Part & Pure Labor Work Orders Flow
- Work orders containing 0 parts requisitions (e.g., pure inspection, diagnostic labor, or service labor) automatically evaluate `partsStatus` as `'not_required'`.
- This unblocks immediate stage progression to `Under Repair` (`under_repair`) without requiring theoretical warehouse stock arrival dates.
- Admin, Head Manager, Manager, and Service Advisor roles are authorized to override stock status during workflow transitions.

### 38.3 Database Audit Trail (`admin_audit_log`)
- Captures all state-mutating operations (`Create`, `Update`, `Approve`, `Issue`, `Sync`, `Delete`, `Auth`) with:
  - Actor context: ID, Name, Role, IP Address, User Agent.
  - Target Entity context: Module (`Workshop`, `Finance`, `Inventory`, `Security & Admin`, `Customer Data`), Entity ID, Entity Label (e.g. `WO-2026-000010 (JAA1234)`).
  - Sanitized request payload with automated redaction of sensitive credentials.
  - Interactive metric cards with one-click filtering by Date, Actor, Module, and Entity Type.

### 38.4 Production Application Logs (`storage/logs/app-YYYY-MM.log`)
- Structured JSON technical log engine writing to protected month-based log files.
- Captures unhandled fatal errors (`E_ERROR`, `E_PARSE`, `E_CORE_ERROR`), HTTP 5xx failures, API warnings (4xx), and slow requests (`>2s`).
- Code-level safety guard: `ini_set('display_errors', '0')` explicitly prevents PHP notices/warnings from corrupting JSON payloads.
- Super Admin viewer features: Live Auto-Refresh (10s/30s), Server Health Diagnostic Card, Level Badges (`FATAL`, `ERROR`, `WARN`, `INFO`), and raw `.log` streaming download.

---

## 39. Current Product Decisions & UX Consolidation (v2.5.0)

1. **Unified Finance Workspace**: Pending Sync is not a separate product module. `/invoices` owns invoice lifecycle and AutoCount queue views, with context-sensitive KPIs, filters, selection, and sync actions. Legacy links redirect into the appropriate tab.
2. **Consistent KPI Cards**: summary cards throughout the Admin Panel follow the Dashboard visual hierarchy for label, value, supporting text, icon container, spacing, border, and elevation. Page-specific colors may communicate status but should not change the typography scale.
3. **Booking Attention Badge**: Sidebar booking notification count represents pending booking cases. Clicking Bookings opens Total Bookings, not a silent Pending-only filter.
4. **Hidden Compatibility Modules**: Driver UI is fully hidden and AutoCount Projects navigation is hidden. This is presentation-only deactivation; no associated tables, columns, endpoints, sync ingestion, or historical values should be deleted without a dedicated migration and impact review.
5. **Vehicle Compliance UX**: expired values receive an explicit red marking in Admin vehicle lists. Renewal upload uses a modal, prevents past/retrograde expiry dates, persists file metadata in the database, and enters a document-level review queue. Vehicle-level approval controls and document-level approval controls must not be duplicated in the same visual section.
6. **Document Preview UX**: images use contained/full-size modal preview; PDFs use an embedded modal viewer or authenticated download fallback in the same dialog. Neither Admin nor Customer App intentionally opens a new tab.
7. **Delivery Address Ownership**: addresses belong to the Company User account, remain visible in both Customer App and Admin Panel, and are consumed by parts-order checkout.
8. **Native Android Back UX**: back closes screen-owned overlays first, then returns non-home routes to Home with the app's route transition. A second press within two seconds is required to exit from Home/root.

## 40. Work Orders Walk-in Intake & UI Stacking Context Architecture (v2.6.0)

### 40.1 Three-Step Walk-in Intake Flow Refactoring
The Walk-in Intake workflow in `/work-orders` was refactored to align with real commercial workshop receiving procedures:

1. **Step 01: Vehicle & Company Auto-Identification**:
   - High-performance searchable dropdown (`SearchableVehicleSelect`) supporting instant search by Plate No (`vehicle_no`) or fleet Unit No (`unit_no` like `V-45`, `108`).
   - Automatically populates associated Company (`company_id`), AutoCount Debtor Code (`debtor_code`), and resolves equipment classification (Trailer vs. Prime Mover).
2. **Step 02: Service Request & Vehicle-Linked Common Issues**:
   - **Service Type \***: New required dropdown (`Repair` [default], `Maintenance`, `Spare Part`). Persisted in database column `job.service_type` (`VARCHAR(100)`).
   - **Common Issue \***: Dynamic issue classification automatically scoped to the vehicle type determined in Step 01:
     - **Trailer (Skeletal / Semi-Trailer / Chassis)**: `Wear and Tear`, `Brake and Suspension`, `Body Work`.
     - **Prime Mover (Tractor / Heavy Rigid Truck)**: `Wear and Tear`, `Air Pressure`, `Wiring`, `Body Work`, `Suspension`, `Engine`, `Gearbox`.
   - **Zero Free-Text Inconsistency**: Removed free-form textarea and redundant tag pills; strictly enforced structured dropdown entry. Switching vehicle type automatically clears incompatible issue selections.
3. **Step 03: Pruned Check-in Parameters**:
   - **Retained Core Operational Attributes**: `Check-in Mileage` (km), `Check-in Time *` (`checkin_at`), `Priority Level` (`priority`: Normal / High / Urgent), and `Workshop Bay` (`bay`: Bay 1–4, Engine Bay, Trailer Bay).
   - **De-scoped Premature Inputs**:
     - *Back Order*: Removed from intake; back order occurs during parts fulfillment, not at intake. Defaults to `isBackOrder: false`.
     - *Expected Completion Date*: Removed from intake; completion dates cannot be reliably determined prior to inspection/quotation. Defaults to `estimatedOut: null`.
     - *Staff Assignment*: Removed technician and foreman pre-assignment at intake; assignment is deferred to subsequent workshop dispatch stages.

### 40.2 Universal Dropdown Stacking Context (Cascading Z-Index) Architecture
To permanently eradicate UI layering bugs where upward/downward dropdown menus were clipped by adjacent cards or containers:
1. **Enforce Downward Placement (`placement="bottom"`)**:
   - In [`admin-select.tsx`](MAW_AdminPanel/src/app/components/ui/admin-select.tsx), added `placement?: "bottom" | "top" | "auto"` (defaulting to `"bottom"`).
   - Eliminates erratic upward flips (`openUpward: true`) caused by tight modal viewports that drilled upward into parent stacking contexts.
2. **Eliminate Hover Z-Index Interference**:
   - Removed mouseover-driven z-index switching (`onMouseEnter`), which inverted stacking contexts when cursor traveled across card boundaries towards open dropdown items.
3. **Deterministic Stacking Cascade**:
   - **Step 01 Card**: Fixed at `relative z-30`. Dropdowns downward-extend over Step 02.
   - **Step 02 Card**: Fixed at `relative z-20`. Dropdowns downward-extend over Step 03.
   - **Step 03 Card**: Fixed at `relative z-10`. Dropdowns downward-extend over the modal footer.
   - **Modal Footer**: Normal flow (`z-0`), guaranteeing all above popups remain 100% visible and unclipped.

### 40.3 Work Order Lifecycle Stepper Streamlining
- Streamlined the 9-stage repair timeline (`Scheduled` ➔ `Collected`): removed redundant step numbers printed above status text labels, retaining clean sequence badges inside the circular stage icons (Checkmark ✓ for completed, Wrench 🔧 for current, integer 4–9 for pending).

---

## 41. Staging Operations Demo Simulation Suite & AutoCount Invoice Interconnection

### 41.1 Realistic Commercial Operations Seeding
To provide immediate, high-fidelity operational simulation for client demos and staging validation:
- **Historical Revenue & Pipeline**: Populated 5 months (May 2026 – September 2026) of operational history on `example_workshop` (~60 completed jobs, RM 74,000+ distributed revenue across 4 months, 22 concurrent in-workshop repairs, and 37 registered commercial fleet assets).
- **AutoCount Sales Invoices Linkage**: Synchronized AutoCount imported invoices (`autocount_invoice_item`) with corresponding MAW work orders and quotations, ensuring customer account balances, aging reports, and tax document download buttons reflect live financial data.
- **Demo Accounts**: Provided pre-configured fleet management logins for **MewahTrans Logistic Sdn Bhd** (`contact@example.com`), **Swift Haulage Sdn Bhd**, and **Vlog Trans Sdn Bhd** (unified password: `12345678`).

### 41.2 Environment Guard & Reversibility
- **Active DB Guard**: The seeder and reset commands verify `SELECT DATABASE()` contains `staging` and immediately abort if run on production.
- **One-Click Reset**: Complete reversal via `node backend/seed_staging_operations.js --reset` (tracked via `staging_operations_manifest.json`) or direct execution of `backend/reset_staging_operations.sql`.

---

## 42. Version 0.2.0 Release & Core Architecture Enhancements

### 42.1 Multi-Supplier Sourcing Traceability & Stock Movement Audit
- **Multi-Supplier Purchasing Intelligence**: Supports procurement of the same part across different suppliers over time at fluctuating unit costs. The Stock Ledger traces all purchase orders by both `part_id` and `item_code`/`sku`, calculating supplier-specific volume, last purchase price, and price variance ranges (min–max).
- **1-Click Supplier Isolation**: Added direct supplier filter buttons and dropdown in the inventory ledger to trace goods received from specific suppliers.
- **Complete Inflow/Outflow Transaction Logging**: Every stock modification (PO receiving, invoice issuance, invoice editing delta, invoice void restoration, physical count audit) writes immutable audit records to `part_stock_transactions`.
- **Work Order & PO Bidirectional Lifecycle Linking**:
  - Submitting PO for a work order automatically links internal PO ref and sets `parts_status = 'pending_parts'` (and advances `status = 'pending_parts'` if `approved`).
  - Receiving PO items automatically advances `parts_status = 'parts_ready'` (and advances `status = 'parts_ready'` if `pending_parts`) once all line items arrive.
  - Work Order Invoice issuance deducts physical stock and logs `job_consume` with linked work order number and customer debtor code.
  - Voiding an invoice restores inventory into stock atomically and logs `return` with the originating work order number.

### 42.2 Master Data Taxonomy & Rules Expansion
- Expanded central Master Data with **Tax Codes (SST)**, **Payment Terms (Credit Terms)**, **Workshop Bays (Pits & Hoists)**, and **Bin Locations (Storage Racks)**.
- Integrated into Work Order Invoices and Quotations with automated due date calculation (`invoiceDate + termDays`) and AutoCount tax code mapping.

### 42.3 System Settings Hub Consolidation
- Unified standalone "Service Types" and "Pricing" tabs into a consolidated **"Services & Pricing"** hub in System Settings.

### 42.4 AutoCount Synchronization Concurrency Guard
- Enforced `processing` state locking to reject modifications with HTTP 409 Conflict while AutoCount sync worker is active.
- Added corporate debtor code protection in `invoices.php` to prevent default cash debtor assignment.

### 42.5 Commercial Fleet Mileage Hardening & Maintenance Lifecycle
- **Numeric Mileage Sorting**: Resolved string sorting anomaly where `"100,000 km"` sorted ahead of `"50,000 km"` by stripping non-digit characters and sorting purely on numeric integer mileage values.
- **Container Chassis / Skeletal Trailer Handling**: Chassis trailers lacking odometers cleanly output `N/A (Chassis)` and sort gracefully without skewing mileage reports or triggering false maintenance alerts.
- **Automated Next Service Mileage & Interval Schedule**: When a work order is completed or collected (`syncVehicleLastServiceFromWorkOrder`), the vehicle's `last_service_mileage` is updated to current mileage and `next_service_mileage` is automatically scheduled to `current_mileage + 10,000 km` (commercial heavy vehicle service interval) with `next_service_date` extended by 3 months.
- **Predictive Service Alert Badges**: Fleet lists and vehicle profile cards dynamically evaluate `next_service_mileage` against current mileage:
  - `Overdue X km` (Red badge) when current mileage exceeds next service mileage.
  - `Due in X km` (Amber badge) when remaining mileage is 1,000 km or less.
- **Service Visit Mileage Delta Tracking**: The Vehicle History endpoint (`admin-vehicle-history`) computes exact `mileageDelta` (`+X,XXX km`) between consecutive workshop visits and flags abnormal gaps (>15,000 km) for inspection.
- **Odometer Rollback Prevention Guidance**: Both Booking check-in and Walk-in work order check-in modals display the vehicle's last recorded odometer baseline with real-time client-side and server-side rollback prevention guards.

### 42.6 Enterprise Fleet Scalability (1,000+ Vehicles) & Immutable Mileage Ledger
- **Immutable Vehicle Mileage Ledger (`vehicle_mileage_log`)**: Every odometer recording from work order check-in, walk-in reception, booking intake, profile modification, or inspection is permanently written to `vehicle_mileage_log` with vehicle ID, mileage reading, incremental delta, source tag, reference document, timestamp, and recorder identity.
- **Dedicated Odometer Audit Trail in Admin UI**: Fleet operators can view a vehicle's full historical odometer timeline under Vehicle Details > History > Odometer Audit Trail, with direct click-through links to originating work orders and delta tracking.
- **Migration `045_vehicle_mileage_ledger_and_scale_indexes.sql`**: Backfills all historical work order mileage readings into `vehicle_mileage_log` and establishes composite indexes on `customer_vehicle` (`company_id`, `registration_no`, `mileage`, `next_service_mileage`) and `job` (`vehicle_id`, `checkin_mileage`, `status`, `collected_at`).
- **High-Concurrency Query Elimination**: Removed heavy `GROUP_CONCAT` subqueries on `job` from the `admin-vehicles` main list endpoint. Vehicle mileage and service intervals are read directly from indexed `customer_vehicle` columns, reducing multi-thousand-row query times from hundreds of milliseconds to under 5ms.
- **Active Work Order Map Zero-Bottleneck Architecture**: Replaced high-cardinality `WHERE vehicle_id IN (...)` queries in `vehicleActiveWorkOrderMap` with direct active work order filtering (`status NOT IN (0, 10)`), guaranteeing instantaneous response times regardless of fleet size scaling to 5,000+ vehicles.
- **Document Fetch Chunking**: Implemented 500-item chunking in `vehicleDocumentMap` to eliminate MySQL packet overflow when retrieving document metadata across large fleet inventories.

### 42.7 Enterprise-Grade Scalability & Big-Data Architecture Across All Subsystems
- **Migration `046_system_wide_scale_and_performance_indexes.sql`**: Added high-performance composite indexes across core relational boundaries:
  - `work_order_invoice` (`invoice_date`, `status, invoice_date`)
  - `accounting_invoice` (`invoice_date`, `document_status, invoice_date`)
  - `purchase_order_item` (`item_code`)
  - `customer` (`company_id`)
  - `customer_appointment` (`appointment_at`, `company_id`)
- **Analytics Date-Window SQL Pushing (`backend/modules/analytics.php`)**:
  - `analyticsBookings`, `analyticsInvoices`, and `analyticsPartOrders` now accept `$startDate` parameters and apply SQL `WHERE date >= :start` clauses directly at the database engine level.
  - Historical data from months or years ago is no longer loaded into PHP RAM; analytics reports and operational dashboard calculations execute in under 30ms on 100,000+ row datasets.
- **Invoice Listing N+1 Query Elimination (`backend/modules/invoices.php`)**:
  - Eliminated row-by-row queries in `admin-invoices` for both `accounting_invoice` and `work_order_invoice`.
  - Introduced `invoiceWorkOrderContextMap` and batch item loading using 400-item chunked queries, cutting total database round-trips from ~3,000 queries down to 4 single queries per page.
  - Implemented 500-record query capping on list fetches.
- **Customer & Company Batch Aggregation (`backend/modules/customers.php`)**:
  - Replaced $O(N)$ correlated subqueries in `legacyCustomers` with pre-aggregated lookup maps for vehicle counts and booking activity using single `GROUP BY company_id` queries.
- **Work Orders Query Optimization (`backend/modules/work_orders.php`)**:
  - Conditional omission of `LEFT JOIN customer_vehicle` in count and status calculation queries when no plate/unit search filter is specified, eliminating expensive table join overhead on high-volume work order tables.

---

## 43. Enterprise Workshop Hardening, Audit-Enforced Inventory & Refined Lifecycle (v2.7.0)

### 43.1 Parts Shortage Gatekeeping, Real-time Stock Calculation & Inline Back Order Bypass
- **Elimination of Transition Deadlocks**: Previously, when required spare parts had shortages, attempting to advance a work order to `parts_ready` or `under_repair` could result in silent failures or confusing UI loops.
- **Strict Gatekeeper Rule**: In `work-orders.tsx` (`getAllowedNextStatuses`), if `hasShortage && !isBackOrder`, transitions from `approved` or `pending_parts` to `parts_ready` or `under_repair` are strictly forbidden.
- **Inline Back Order Authorization**: In the status update modal, an inline toggle allows authorized personnel to enable `Enable Back Order (Bypass Shortage) — Authorize repair execution while awaiting parts arrival`.
- **Warning & Alert Banners**:
  - Blocked status warning alert: `"Parts shortage detected. Stock receiving or Back Order required to start repair."`
  - Step summary banner: `"Inventory Shortage Detected · Repair On Hold"`.
  - Active Back Order badge: `"Back Order Bypass Active · Inventory shortage bypassed"`.
- **Live Inventory Calculation (No Stale DB Cache)**: In `backend/modules/work_orders.php`, stage advancement validates live inventory stock in real time via `$autoStatus = automaticPartsStatusFromOverview($overview)` rather than relying on stale cached values in `job.parts_status`. Receiving stock through POs or adjusting stock in the Stock Ledger is immediately recognized upon clicking the status transition button.
- **Automatic Parts Status Commit**: When a work order advances to `under_repair`, the system automatically commits `parts_status = 'parts_ready'` in the database.
- **Clean Stage Rollback**: Rolling back a work order to `approved` cleanly resets `parts_status` to `'not_required'` or recalculates live shortage.
- **Post-Repair Parts Requirement Immutability**: Once a work order reaches `ready_for_collection` or `collected`, editing or deleting required parts is strictly locked in the Admin UI and backend.

### 43.2 Audit-Enforced Inventory Stock Ledger
- **Disabled Direct Stock Field**: Direct input of stock numbers on the parts master (detail view and edit modal) is locked (`disabled`, `cursor-not-allowed`, grayed out). Direct stock edits without audit reasons are prevented.
- **Mandatory Audit Trail via Stock Ledger**: Stock adjustments can only be transacted in the `Stock Ledger & History` modal with a mandatory explanation reason (`admin-adjust-part-stock`).
- **Preserved Existing Stock on Metadata Save**: Submitting metadata updates (price, description, shelf location, supplier) preserves current physical stock (`stock: editingPart.stock`), eliminating accidental stock resets.
- **Immutable Transaction History**: All adjustments are logged into `part_stock_transactions` with `transaction_type = 'manual_adjust'`, actor ID, previous/new quantities, delta, and reason.

### 43.3 Streamlined Invoices Workspace & Conditional Tax Rendering
- **Table Streamlining**: Clean dedicated columns (Invoice / DO #, Issue Date, Due Date, Vehicle Plate & Model, Customer / Company, Total Amount, Sync Status, Payment Status, Actions).
- **Unified Filter Tabs**: Removed redundant top KPI cards; unified tab switching matching the Vehicles module.
- **Conditional SST Table**: The tax breakdown table in invoice dialogs renders only when tax is incurred (`tax_amount > 0` or non-zero tax rate).
- **Direct Company Invoicing**: Enterprise invoices and quotations are addressed directly to the corporate client (`Company`), eliminating unnecessary individual user contact info.

### 43.4 Rejected Vehicle Re-submission & Re-verification Workflow
- **Rejection Feedback**: When an Admin rejects a customer-registered vehicle, an audit-backed rejection reason is recorded.
- **Customer Remediation**: The Customer App displays the rejection notice and reason under vehicle details.
- **One-Click Re-submission (`customer-resubmit-vehicle`)**: Customers can update grant photos or specs and re-submit the vehicle, returning it to `pending_verification` for Admin re-evaluation.

### 43.5 Customer App Single-Screen & Filter-First Mobile Architecture (~100dvh)
- **Zero Long Scrolls**: Elimination of excessive vertical scrolling across all customer screens (`HomeScreen`, `FleetScreen`, `BookingSelectVehicle`, `VehicleDetailsScreen`, `PartsScreen`, `InvoicesScreen`, `VehicleHistoryScreen`, `NotificationsScreen`, `ProfileScreen`).
- **High-Density Rows**: Compact data rows (~48px–54px) providing high-yield operational visibility.
- **Compact Paging (`< 1 / X >`)**: Fixed page sizes (6–7 items) preventing DOM bloating and lag on mobile webviews.
- **Segmented Tabs & Bottom Drawers**: Complex multi-section views use horizontal segmented tabs and bottom sheet quick drawers.
- **Enhanced Quotation Review Card**: `CustomerQuotationCard.tsx` renders clear line-item breakdowns for parts and labor, providing one-click approve/reject actions with optional customer feedback.

---

## 44. Instructions for Future AI Coding Agents

Before making any code changes to the MAW codebase, you **MUST** follow these rules:

1. **Consult This Document First**: Always verify entity names, state machine transitions, and RBAC rules in this document before writing code.
2. **Respect Legacy / Canonical Mappings**:
   - Booking confirmed status is stored as `'upcoming'` in the database.
   - Work order stages are derived dynamically via timestamp fields (`checkin_at`, `inspected_at`, `approved_at`, etc.).
3. **Preserve Business Logic**: Never remove quotation approval guards, parts readiness checks, payment sync rules, or company isolation filters.
4. **Never Fabricate Data**: Do not invent database columns, API endpoints, or status strings that do not exist.
5. **Respect Database Migrations**: Never modify an existing migration file that has already been deployed. Always write a new `.sql` file in `backend/migrations/`.
6. **Maintain Session Partitioning**: Always preserve `X-MAW-Portal` header logic so local dev environments do not clash.
7. **Packaging Protocol (Do Not Prematurely Pack)**: When frontend modifications are made, test locally via Vite dev server. Do NOT automatically run build/packaging scripts (`package-build.js`) on every iteration until the user explicitly verifies and requests packaging.
8. **Update Documentation**: If your changes alter state machines, RBAC rules, or API endpoints, update this document immediately.


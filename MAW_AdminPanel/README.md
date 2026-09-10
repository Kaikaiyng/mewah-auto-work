# MAW Admin Panel

The MAW Admin Panel is the operational core of the Mewah Auto Work platform. It provides end-to-end administration for client companies, commercial fleet vehicles, staff accounts, service bookings, work orders, parts inventory, purchase orders (PO), customer parts orders, invoices, and AutoCount accounting sync health.

> 📖 **Master Technical Architecture & State Machine Specification**: Refer to the root [PROJECT_DOCUMENTATION.md](../PROJECT_DOCUMENTATION.md).

---

## Technology Stack & Runtime

- **Framework**: React 18.3.1 + Vite 6.3.5
- **Styling & Components**: TailwindCSS 4.1.12, Material UI 7.3.5, Radix UI Primitives, Recharts 2.15.2
- **Routing**: React Router 7.13.0
- **Backend API**: Shared PHP REST API Gateway (`backend/api.php`)

| Environment | API Gateway Endpoint | Database |
| :--- | :--- | :--- |
| **Development** | Vite proxy to Staging API | `mewahautoworksystem_staging` |
| **Staging** | `https://workshop.example.com/staging/api_staging/api.php` | `mewahautoworksystem_staging` |
| **Production** | `https://workshop.example.com/api/api.php` | `mewahautoworksystem` |

---

## Local Development Setup

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` launches the Vite development server on `http://localhost:5173/`. All `/api` requests are proxied directly to the online Staging API environment, ensuring full functionality without a local database setup.

---

## Core Modules & Features

1. **Dashboard (`/`)**: Real-time work order lifecycle distribution, pending vehicle verifications, low stock inventory alerts, and revenue metrics.
2. **Work Orders (`/work-orders`)**:
   - Create jobs from scheduled bookings or walk-in customer intakes (`checked_in`).
   - Lifecycle state machine: `scheduled` &rarr; `checked_in` &rarr; `inspected` &rarr; `quotation_issued` &rarr; `approved` &rarr; `parts_ready` &rarr; `under_repair` &rarr; `ready_for_collection` &rarr; `collected`.
   - **Shortage Enforcement & Back Order**: Progression to repair is blocked if parts are missing (`hasShortage = true`). The status modal includes an explicit inline `Enable Back Order (Bypass Shortage)` toggle. Real-time physical inventory checks unblock the order immediately upon receiving POs or adjusting stock in the ledger.
   - Inspection photo gallery with per-photo customer visibility controls.
3. **Bookings (`/bookings`)**: Customer service appointments, bay allocation, and conversion to active work orders. Clicking Bookings displays all entries by default, while the sidebar badge indicates pending requests.
4. **Companies (`/companies`)**: Corporate client profiles, AutoCount Debtor Code mappings, credit limits, and payment terms.
5. **Customers (`/customers`)**: Company Users management and shared delivery address configuration.
6. **Equipment / Vehicles (`/equipment`)**: Fleet technical specifications, vehicle grant verification, rejection workflows with re-submission audit tracking, and modal previews for Insurance, Road Tax, and PUSPAKOM compliance files (PDF and images).
7. **Parts (`/parts`)**: Master parts catalog, bin locations, safety stock thresholds, and AutoCount Item Code bindings. **Direct manual edits on stock quantities are disabled**; all adjustments must be performed through `Stock Ledger & History` (`Adjust in History ↗`) with an audit reason.
8. **Purchase Orders (`/purchase-orders`)**: Creation, submission, and receiving of supplier purchase orders. Approved POs enqueue for AutoCount synchronization and generate official PDFs for supplier communication via WhatsApp.
9. **Orders (`/orders`)**: Customer marketplace parts orders and AutoCount DO queue dispatching.
10. **Invoices (`/invoices`)**: Unified invoice management and pending sync queue. Features tab-based filtering without bulky cards, standard columnar layouts, and conditional tax breakdowns shown only when tax applies.
11. **AutoCount Sync (`/autocount-sync`)**: Outbox sync queue monitor, error logs, and manual retry controls for invoices, parts DOs, and purchase orders.
12. **Staff (`/staff`)**: Employee user accounts, roles, and workshop technician assignments.
13. **Audit Trail (`/audit-trail`)**: Append-only audit log recording actor identity, IP address, and before/after mutation diffs.
14. **App Logs (`/app-logs`)**: Real-time backend application error and operation log viewer.

### Hidden & Compatibility Modules

- **Drivers**: Hidden from the sidebar, vehicle views, and work orders. The `/drivers` URL redirects to `/equipment`. Database fields remain intact for backward compatibility.
- **AutoCount Projects**: Hidden from the navigation menu; project synchronization remains available for legacy system compatibility.
- **Pending Sync Standalone Page**: Redirects to `/invoices?view=pending_sync`.

---

## Role-Based Access Control (RBAC)

Permissions are enforced both in the UI and via backend session checks in `backend/api.php` (`requireAdminSession()` / `checkPermission()`):

| Role | Operational Scope |
| :--- | :--- |
| **Super Admin / Admin** | Unrestricted access across all operational modules, staff administration, and system settings. |
| **Head Manager / Manager** | Full work order lifecycle management, quotations, invoicing, PO receiving, and inventory control. |
| **Service Advisor** | Customer reception, walk-in intake, vehicle verification, quotation issuance, and customer communication. |
| **Receptionist** | Service appointment scheduling, basic customer registration, and manual payment logging. |
| **Foreman / Mechanic / Technician** | View assigned repair jobs, update repair milestones (`under_repair` / `ready_for_collection`), and upload photos. |

---

## Build & Packaging

Run the following commands inside `MAW_AdminPanel/`:

```bash
# Validate production build
pnpm build

# Generate both production and staging distribution ZIP archives
pnpm run pack

# Individual packages
pnpm run pack:production-only  # Creates AdminSystem_Update.zip
pnpm run pack:staging-only     # Creates AdminSystem_Update_Staging.zip
```

---

## Deployment Notes

1. Build outputs are placed in `dist/`, which Vite clears automatically prior to bundling.
2. The production package removes local proxy configuration and issues relative requests to `/api/api.php`.
3. The staging package configures the gateway path to `/staging/api_staging/api.php`.
4. Always verify frontend builds locally using `pnpm build` before uploading updates to servers.

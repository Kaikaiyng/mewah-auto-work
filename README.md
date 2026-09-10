# Mewah Auto Work (MAW)

Mewah Auto Work is a modern workshop and fleet management platform tailored for commercial transport fleets (prime movers, container trailers, lorries) and general commercial vehicles. The system consists of the **Admin Panel**, **Customer App (Customer Portal & Workshop Floor Mode)**, **PHP API Gateway**, and the **AutoCount Accounting Sync Service**.

This is a sanitized source-only portfolio snapshot. Live credentials, customer
exports, operational seed data, screenshots, installers, and proprietary assemblies
are not distributed. Configure your own backend and accounts before use. See
[SECURITY.md](SECURITY.md) for publication safeguards and outstanding incident follow-up.

> 📖 **Official Architecture & Specification Manual**: Refer to [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) (or [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md)).

---

## Core Architecture & Business Entities

- **Company**: Top-level multi-tenant entity, storing the AutoCount Debtor Code, credit limits, and payment credit terms.
- **Company User**: Authenticated users in the Customer App. All users belonging to the same Company share access to their company's fleet vehicles, bookings, work orders, invoices, and parts orders.
- **Driver (Legacy / Compatibility)**: Removed from active workflows; hidden across Admin menus, vehicle cards, work orders, and selectors. Database columns and legacy endpoints remain preserved for backward compatibility and historical AutoCount references.
- **Vehicle**: Belongs to a Company. Vehicles submitted by customers require administrator verification (`pending_verification` &rarr; `approved`), while vehicles created directly in the Admin Panel are automatically approved.
- **Work Order**: Created from scheduled Bookings or walk-in arrivals (`checked_in`). Work orders strictly transition through distinct lifecycle stages: `scheduled` &rarr; `checked_in` &rarr; `inspected` &rarr; `quotation_issued` &rarr; `approved` &rarr; `parts_ready` &rarr; `under_repair` &rarr; `ready_for_collection` &rarr; `collected`.
- **AutoCount Accounting Integration**: AutoCount serves as the legal single source of truth for official invoices (`DocNo`), e-Invoice UUIDs, general ledgers, and accounts receivable. MAW operations queue transactional outbox jobs:
  - Invoice sync queue: `autocount_invoice_sync_queue`
  - Parts delivery order (DO) queue: `autocount_parts_order_sync_queue`
  - Purchase order (PO) queue: `autocount_purchase_order_sync_queue`
- **Vehicle Compliance Documents**: Customer App uploads Insurance, Road Tax, and PUSPAKOM documents with expiration dates; Admin reviews and approves them within vehicle profiles.
- **Delivery Addresses**: Customer App and Admin Panel share persistent delivery address profiles per Company User.
- **Parts Inventory Security & Audit Ledger**: Direct manual edits on master part quantities are permanently disabled. All stock additions, deductions, and adjustments must be executed via `Stock Ledger & History` with mandatory audit reasons (`part_stock_transactions`).
- **Shortage Interception & Back Order Authorization**: If a work order lacks physical inventory, advancement to repair is blocked unless Back Order is authorized. Stock verification dynamically evaluates real-time stock balances across purchasing and ledger adjustments.
- **Database Migrations**: Incremental, sequential SQL migration files currently spanning `001` through `046_system_wide_scale_and_performance_indexes.sql`.

---

## Project Structure

```text
MewahAutoWork/
├── MAW_AdminPanel/          # Operations Admin Portal (React 18 + Vite + TailwindCSS 4 + MUI)
├── MAW_CustomerApp/         # Customer & Workshop Mobile/PWA (React 18 + Vite + Capacitor 8)
├── backend/                 # Shared PHP REST API, DB connection, and migrations (001-046)
├── Autocount_Sync_Program/  # Windows AutoCount C# synchronization service (.NET 4.8)
├── docs/                    # Architecture specifications, deployment guides, and reports
├── PROJECT_DOCUMENTATION.md # Master project documentation, state machines, and RBAC manual
└── SECURITY.md              # Credential handling and publication safeguards
```

---

## Environment & Database Mapping

| Environment | Admin Panel API | Customer App API | Database |
| :--- | :--- | :--- | :--- |
| **Local Development** | Vite proxy to Staging API | Vite proxy to Staging API | `mewahautoworksystem_staging` |
| **Staging** | `/staging/api_staging/api.php` | `/staging/api_staging/api.php` | `mewahautoworksystem_staging` |
| **Production** | `/api/api.php` | `/api/api.php` | `mewahautoworksystem` |

Reserved example URLs (not live deployments):
- Admin Panel Production: <https://workshop.example.com/>
- Admin Panel Staging: <https://workshop.example.com/staging/>
- Customer App Production: <https://workshop.example.com/>
- Customer App Staging: <https://workshop.example.com/staging/>

Backend database routing:
- Requests originating from `localhost`, `127.0.0.1`, CLI, or paths containing `/api_staging/` automatically connect to `staging`.
- All other requests connect to `production`.
- Full connection routing details are defined in [`backend/connection.php`](backend/connection.php).

---

## Development Prerequisites

- **Node.js**: v20+ LTS
- **Package Manager**: pnpm (locked via `pnpm-lock.yaml`)
- **PHP**: PHP 8.1+ (with `mysqli` and `gd` extensions enabled)
- **AutoCount Sync**: Windows 10 / Windows Server with .NET Framework 4.8

Enable pnpm via Corepack:
```bash
corepack enable
```

---

## Quick Start

### 1. Start Admin Panel (Port 5173)

```bash
cd MAW_AdminPanel
pnpm install
pnpm dev
```

### 2. Start Customer App (Port 5174)

In a separate terminal window:

```bash
cd MAW_CustomerApp
pnpm install
pnpm dev
```

Both development servers proxy `/api` to `http://127.0.0.1:8080` by default.
Configure your backend privately before signing in. Set `MAW_DEV_API_TARGET` and
`MAW_DEV_API_PATH` in the shell to use your own backend. No production service is
contacted by default. Copy each app's `.env.example` to an ignored `.env.local`.
Customer demo mode is available only during development with
`VITE_CUSTOMER_DATA_SOURCE=local`; it never provides access to a real backend.

---

## Build & Packaging Commands

### Admin Panel
Inside `MAW_AdminPanel/`:
- `pnpm build`: Compiles production frontend bundle.
- `pnpm run pack`: Packages both production and staging distribution ZIP archives.
- `pnpm run pack:production-only`: Generates `AdminSystem_Update.zip`.
- `pnpm run pack:staging-only`: Generates `AdminSystem_Update_Staging.zip`.

### Customer App
Inside `MAW_CustomerApp/`:
- `pnpm typecheck`: Executes TypeScript strict type verification.
- `pnpm build`: Compiles mobile web and PWA bundle.
- `pnpm run pack`: Generates `CustomerApp_Update.zip`.

### Database Migrations

The runner scans and records migrations sequentially:

```bash
# Read-only migration status check
php backend/run_migrations.php --status

# Staging: Execute unapplied migrations
MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND php backend/run_migrations.php

# Production: Requires prior verified backup
MAW_ENVIRONMENT=production \
MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND \
MAW_ALLOW_PRODUCTION_MIGRATIONS=YES_I_UNDERSTAND \
php backend/run_migrations.php
```

---

## Database Configuration Standard

Never commit raw database credentials to the repository. Place credentials outside the public root (e.g., in the cPanel user home directory):
```text
/home/CPANEL_USER/maw_db_config.php
```

Configuration schema:
```php
<?php
return [
    'staging' => [
        'host' => 'localhost',
        'port' => 3306,
        'ssl' => false,
        'user' => 'STAGING_USER',
        'password' => 'STAGING_PASSWORD',
        'database' => 'mewahautoworksystem_staging',
    ],
    'production' => [
        'host' => 'localhost',
        'port' => 3306,
        'ssl' => false,
        'user' => 'PRODUCTION_USER',
        'password' => 'PRODUCTION_PASSWORD',
        'database' => 'mewahautoworksystem',
    ],
];
```

---

## Critical Invariants & Security Rules

1. **Multi-Tenant Data Isolation**: Customers can only view and mutate entities belonging to their authenticated Company (anti-IDOR protection).
2. **Statutory Invoice Authority**: Synced invoices (`sync_status = 'synced'`) cannot be altered or cancelled within MAW; payments and allocations are mastered in AutoCount.
3. **Idempotency Guarantee**: Outbox sync workers check AutoCount `DocNo` by `internal_ref` before inserting documents to avoid duplicate billing entries.
4. **Repair Precondition Constraint**: Work orders cannot advance to `under_repair` without quotation approval and resolved parts availability (or explicit Back Order authorization).
5. **Deployment SOP**: Follow Staging verification &rarr; Production backup &rarr; Database migration &rarr; Package extraction &rarr; Smoke test.

---

## System Workflows & Operational Conventions

- **Parts Shortage Enforcement & Back Order Authorization**:
  - When a work order has parts shortages (`hasShortage = true`), transition to `parts_ready` or `under_repair` is strictly blocked unless Back Order is authorized.
  - The status update dialog contains an inline toggle: `Enable Back Order (Bypass Shortage) — Authorize repair execution while awaiting parts arrival`.
  - Parts inventory checks query real-time stock balances dynamically (`automaticPartsStatusFromOverview`), instantaneously unblocking workflow once stock is replenished via PO receipt or Stock Ledger adjustments.
  - Advancing status automatically synchronizes `parts_acknowledged_at` and records the acknowledged snapshot, preventing redundant "New Parts · Review" alerts.
- **Stock Ledger & Audit Enforcement**:
  - Master part quantity fields on detail and edit dialogs are permanently disabled (`readonly`).
  - Stock changes must be performed through `Stock Ledger & History` (`Adjust in History ↗`) with an explicit reason (e.g., stock check correction, damage write-off, customer return).
  - Every adjustment writes an immutable record to `part_stock_transactions`.
- **Invoices Workspace (`/invoices`)**:
  - Replaced bulky KPI header cards with cohesive filter tabs and segment badges matching the vehicle management interface.
  - Clean table layout with standard columns: Invoice / DO #, Issue Date, Due Date, Vehicle Plate & Model, Customer / Company, Total Amount, Sync Status, Payment Status, Actions.
  - Tax summaries on modal dialogs and print layouts appear conditionally only when tax is incurred (`tax_amount > 0` or non-zero tax rate).
  - Quotations and invoices display the corporate `Company` header directly.
- **Rejected Vehicle Re-submission Flow**:
  - Rejection requires an administrator reason which is recorded in the audit trail.
  - Customer App highlights the rejection banner and reason; customers can update vehicle specifications and grant attachments, then re-submit with one click (`customer-resubmit-vehicle`), reverting status to `pending_verification`.
- **Single-Screen & Filter-First Customer App UX (`~100dvh`)**:
  - Core views (Home, Fleet, Booking, Vehicle Details, Parts, Invoices, History, Profile) strictly fit the viewport without infinite vertical page scrolling.
  - Compact table rows (48px–54px) and pagination controls (`< 1 / X >`, 6–7 items/page).
  - Segmented tabs and bottom sheet drawers for nested specifications.
- **Walk-in Work Order Intake**:
  - **Step 01**: Fast plate / Unit No search, company identification, AutoCount debtor matching, and automatic vehicle classification (Prime Mover vs. Trailer).
  - **Step 02**: Mandatory `Service Type *` (Repair / Maintenance / Spare Part) and dynamic `Common Issue *` categories tailored by vehicle type.
  - **Step 03**: Streamlined intake with check-in mileage, check-in timestamp, priority, and bay assignment.
- **Purchase Order Workflow**:
  - POs are created, verified, and received within MAW.
  - On submission, POs automatically enqueue for AutoCount synchronization and generate printable PDFs for immediate supplier transmission via WhatsApp. Sync queue delays do not block goods receipt.

---

## Documentation Index

- [Master Technical & Business Architecture Specification](PROJECT_DOCUMENTATION.md)
- [System Usage and Deployment Guide](docs/USAGE_AND_DEPLOYMENT_GUIDE.md)
- [Admin Panel Guide](MAW_AdminPanel/README.md)
- [Customer App & Workshop Guide](MAW_CustomerApp/README.md)
- [AutoCount Sync Service Manual](Autocount_Sync_Program/Autocount_Sync_Program/Autocount_Sync_Program-main/README_ANTIGRAVITY.md)

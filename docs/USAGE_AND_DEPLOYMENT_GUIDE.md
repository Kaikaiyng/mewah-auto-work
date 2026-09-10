# MAW System Usage & Deployment Guide

This guide is intended for MAW administrators, workshop managers, QA engineers, and DevOps/deployment specialists. All procedures and examples assume strict isolation between staging and production environments.

> 📖 **Official Technical Architecture & State Machine Specification**: Refer to the primary manual [PROJECT_DOCUMENTATION.md](../PROJECT_DOCUMENTATION.md).

---

## 1. System Architecture & Environment Topology

```text
Admin Panel (5173) ──┐
                     ├─> Shared PHP API Gateway (api.php) ─> MySQL / MariaDB
Customer App (5174) ─┘   (Session-scoped: MAWADMINSESSID / MAWCUSTOMERSESSID)
                           │
                           ▲ (Poll Outbox Queues & Master Data Sync)
                           │
               AutoCount C# Synchronization Service (WinForms / Background Worker)
                           │
                           ▼
               AutoCount Accounting System (Official Tax Invoices, General Ledger, AR)
```

Environment and data mapping:
- **Staging Environment**:
  - Admin Panel: `https://workshop.example.com/staging/`
  - Customer App: `https://workshop.example.com/staging/`
  - API Gateway: `/staging/api_staging/api.php`
  - Database: `mewahautoworksystem_staging`
- **Production Environment**:
  - Admin Panel: `https://workshop.example.com/`
  - Customer App: `https://workshop.example.com/`
  - API Gateway: `/api/api.php`
  - Database: `mewahautoworksystem`

---

## 2. Initial Installation & Environment Setup

### 2.1 Install Frontend Dependencies

```bash
corepack enable

cd MAW_AdminPanel
pnpm install

cd ../MAW_CustomerApp
pnpm install
```

*Always use the locked `pnpm-lock.yaml` in the repository. Do not delete or regenerate lockfiles casually.*

### 2.2 Configure Private Database Credentials

Copy `backend/db_config.example.php` to a directory outside public web access (e.g., the cPanel user home directory):

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

*Never commit the active configuration file to Git or place it inside `public_html`.*

### 2.3 Database Initialization & Migrations (001–046)

Database migration scripts are located in `backend/migrations/` and must be executed **strictly in sequential order**:

```text
001_phase1_extensions.sql               -- Work order core fields and stage timestamps
002_customer_company_access.sql         -- Multi-tenant company data isolation
003_vehicle_verification.sql            -- Vehicle verification workflow
004_vehicle_operational_status.sql      -- Vehicle operational status tracking
005_container_haulage_vehicle_fields.sql-- Prime mover and trailer technical specifications
006_staff_accounts.sql                  -- Staff roles and workshop technician assignment
007_complete_vehicle_profile_fields.sql -- Comprehensive commercial fleet specs (chassis, engine, axles)
008_complete_booking_fields.sql         -- Customer service booking scheduling fields
009_booking_checkin_work_order.sql      -- Booking check-in conversion to active work order
010_parts_inventory_fields.sql          -- Parts bin location, SKU, barcode, and safety stock
011_customer_parts_orders.sql           -- Customer marketplace parts orders
012_autocount_parts_import.sql          -- AutoCount item master synchronization structure
013_work_order_stage_timestamps.sql     -- Accurate timestamps across all lifecycle stages
014_work_order_quotation_stage.sql      -- Quotation issuance and approval flags
015_work_order_quotations.sql           -- Quotation line items and customer response engine
016_system_settings.sql                 -- Key-value system settings center
017_quotation_service_types.sql         -- Service types and default labor hourly rates
018_work_order_invoices.sql             -- Work order invoice master table and numbering schema
019_optional_vehicle_number.sql         -- Resilient plate number and unit number matching
020_work_order_parts_status.sql         -- Fine-grained parts fulfillment status computation
021_company_users_and_drivers.sql       -- Separation of customer login accounts from drivers
022_walk_in_work_orders.sql             -- Direct walk-in intake without prior appointment
023_autocount_ready_workflow.sql        -- AutoCount invoice linkage prerequisites
024_maw_invoice_autocount_outbox.sql    -- Outbox queue: autocount_invoice_sync_queue
025_purchase_orders.sql                 -- Purchase orders and autocount_purchase_order_sync_queue
026_autocount_item_master.sql           -- AutoCount item master data bindings
027_work_order_photos.sql               -- Workshop inspection photos and customer visibility control
027_work_order_quotation_item_tax.sql   -- Quotation line item tax code, tax rate, and SST calculation
028_autocount_creditor_master.sql       -- Supplier creditor code and AutoCount sync
029_work_order_part_requirements.sql    -- Work order parts requisition and fulfillment ledger
030_work_order_status_history.sql       -- Work order lifecycle audit history log
031_admin_audit_trail.sql               -- Append-only administrative audit log (admin_audit_log)
032_vehicle_autocount_preset.sql        -- Vehicle AutoCount project code presets
033_mewahtrans_invoice_sync_preset.sql  -- Demo fleet invoice preset mapping
034_parts_order_autocount_do_queue.sql  -- Parts order delivery order queue: autocount_parts_order_sync_queue
035_work_order_doc_type_and_do_sync.sql -- Document type selection (Sales Invoice vs. Delivery Order)
036_vehicle_documents.sql               -- Compliance documents, expiration dates, review history
037_customer_delivery_addresses.sql     -- Persistent Company User shipping addresses
037_job_customer_id_nullable.sql        -- Direct walk-in intake for corporate fleets without personal accounts
038_company_user_active_status.sql      -- Soft deactivation for customer accounts
038_job_actual_issue.sql                -- Diagnosis and root cause discovery field (actual_issue)
039_part_stock_transactions.sql         -- Immutable stock transaction ledger (part_stock_transactions)
040_sync_vehicle_plates_and_invoices.sql-- Historic invoice plate normalization sync
041_seed_vehicle_service_history_demo.sql-- Realistic fleet full lifecycle service history simulation
042_sync_vehicle_profile_mileage_and_history.sql-- Synchronization between vehicle profile and check-in mileage
043_enforce_single_active_work_order_per_vehicle.sql-- Constraint: exactly one active work order per vehicle
044_enrich_realistic_demo_operations.sql-- Five-month historical commercial operations dataset
045_vehicle_mileage_ledger_and_scale_indexes.sql-- Vehicle mileage ledger and compound scale indexes
046_system_wide_scale_and_performance_indexes.sql-- System-wide composite performance indexes
```

---

## 3. Local Development & Debugging

### 3.1 Start Admin Panel

```bash
cd MAW_AdminPanel
pnpm dev
```
Accessible at `http://localhost:5173/`.

### 3.2 Start Customer App

In a separate terminal window:
```bash
cd MAW_CustomerApp
pnpm dev
```
Accessible at `http://localhost:5174/`.

### 3.3 Data Flow & Proxy Security

Both Vite dev servers proxy `/api` requests to the online Staging API (`https://workshop.example.com/staging/api_staging/`). Local debugging never touches or modifies the production database.

---

## 4. Frontend Build & Distribution

### 4.1 Admin Panel Packaging

```bash
cd MAW_AdminPanel

# Build verification
pnpm build

# Build both Production and Staging packages
node package-build.js --mode all

# Or run individual targets:
pnpm run pack:production-only  # Output: AdminSystem_Update.zip
pnpm run pack:staging-only     # Output: AdminSystem_Update_Staging.zip
```

### 4.2 Customer App Packaging

```bash
cd MAW_CustomerApp

# TypeScript type verification
pnpm typecheck

# Production build
pnpm build

# Generate distribution archive
pnpm run pack                  # Output: CustomerApp_Update.zip
```

---

## 5. Production Deployment Standard Operating Procedure (SOP)

### Step 1: Pre-deployment Checklist
1. Run `pnpm build` (Admin) and `pnpm typecheck && pnpm build` (Customer) to guarantee zero compilation errors.
2. Complete regression testing in the Staging environment.
3. Perform a full database backup of production (dump `mewahautoworksystem.sql`).
4. Archive the current server deployment files.

### Step 2: Database Migrations
Check status first with `php backend/run_migrations.php --status`.
- In Staging: `MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND php backend/run_migrations.php`.
- In Production: Verify backup completion, then run with `MAW_ENVIRONMENT=production MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND MAW_ALLOW_PRODUCTION_MIGRATIONS=YES_I_UNDERSTAND php backend/run_migrations.php`.
- If an existing database has tables but lacks migration history, the runner safely rejects execution. Use `--baseline` only after manual schema verification.

### Step 3: Deploy Packages
1. Upload `AdminSystem_Update.zip` to the Admin Panel Document Root (e.g., `/home/workshop.example.com/public_html/`) and extract over existing files.
2. Upload `CustomerApp_Update.zip` to the Customer App Document Root and extract over existing files.
3. The Admin update archive includes `api/`, `staging/api_staging/`, migrations, and PDF receivers.
4. Verify that API `storage/` and `uploads/invoices/` directories have proper write permissions (`0750`) and that `.htaccess` is preserved.
5. Ensure `storage/vehicle-documents/` is writable by PHP but protected from direct web access (files must stream through authenticated API endpoints).

### Step 4: Post-deployment Smoke Testing
Execute the [Production Smoke Test Checklist](#7-production-smoke-test-checklist).

---

## 6. AutoCount Synchronization Service

- **Runtime Host**: Windows Server / machine running AutoCount Accounting.
- **Application**: .NET Framework 4.8 WinForms Desktop Service (`Autocount_Sync_Program.exe`) with multi-threaded worker pools.
- **Configuration**: Production credentials must be supplied via Windows Environment Variables (see `Autocount_Sync_Program/RUNTIME_CONFIGURATION.md`).
- **Monitored Outbox Queues**:
  - Invoice sync: `autocount_invoice_sync_queue`
  - Parts DO sync: `autocount_parts_order_sync_queue`
  - Purchase order sync: `autocount_purchase_order_sync_queue`
- **Process Recovery**: If the synchronization process hangs, terminate `Autocount_Sync_Program.exe` via Task Manager and restart the executable.

---

## 7. Production Smoke Test Checklist

- [ ] Admin Panel login succeeds.
- [ ] Customer App login succeeds; assigned company fleet displays properly.
- [ ] Workshop technicians authenticate via Unified Login and route to `/workshop/jobs`.
- [ ] Create a service booking and convert it to an active work order.
- [ ] Navigating to Bookings from the sidebar displays Total Bookings by default; Pending badge count matches the Pending filter count.
- [ ] **Walk-in Intake 3-Step Verification**:
  - **Step 01**: Plate or Unit No search finds the vehicle instantly, auto-fills company/debtor codes, and identifies vehicle type (Prime Mover vs. Trailer).
  - **Step 02**: Select Service Type (Repair / Maintenance / Spare Part); Common Issue options link dynamically to vehicle type (Prime Mover has 7 categories, Trailer has 3).
  - **Step 03**: Fill check-in mileage, check-in time, priority, and bay assignment.
  - **Dropdown Stacking**: All dropdown menus float above card layouts without clipping.
- [ ] Transition a job across all stages: `Scheduled → Checked In → Inspected → Quotation Issued → Approved → Under Repair → Ready for Collection → Collected`.
- [ ] Lifecycle stepper displays cleanly without redundant step numbers above labels.
- [ ] **Parts Shortage & Back Order Enforcement**:
  - If a work order lacks physical parts and Back Order is not active, status progression to `parts_ready` or `under_repair` is blocked with a shortage banner.
  - Toggling `Enable Back Order (Bypass Shortage)` clears the block and permits repair authorization.
  - Replenishing stock via PO receipt or Stock Ledger adjustment dynamically unblocks the work order without requiring Back Order.
  - Advancing status automatically sets `parts_acknowledged_at` and saves snapshot, preventing false "New Parts · Review" alerts.
- [ ] **Parts Stock Ledger Audit Enforcement**:
  - In Parts catalog details and edit dialogs, Stock Quantity is permanently disabled (`readonly`).
  - Clicking `Adjust in History ↗` opens `Stock Ledger & History`. Entering a new quantity and mandatory audit reason successfully logs a record in `part_stock_transactions`.
  - Updating part price or bin location preserves the existing stock balance untouched.
- [ ] Technicians upload Before/After inspection photos; verify customer visibility controls in Customer App.
- [ ] Create a quotation and approve it online via Customer App.
- [ ] Create and submit a Purchase Order in MAW; verify it enqueues to the AutoCount PO outbox.
- [ ] Download PO PDF while pending sync; verify supplier, items, totals, and MAW Ref format.
- [ ] Receive a Purchase Order while sync is queued/failed; verify inventory stock increments correctly.
- [ ] Generate an invoice on job completion; verify entry in `autocount_invoice_sync_queue`.
- [ ] AutoCount sync service processes the invoice and writes back the official `DocNo`.
- [ ] Download Work Order Invoice PDF before and after AutoCount sync; verify all identifiers, company header, SST, totals, and balances.
- [ ] **Invoices Workspace (/invoices)**:
  - Clean table layout with standard columns and tabs.
  - Conditional tax summary appears only when tax is incurred (`tax_amount > 0`).
- [ ] Download PDFs for Work Order DO and Parts Order Invoice/DO.
- [ ] **Vehicle Compliance & Re-submission**:
  - Customer App uploads compliance documents (image/PDF); Admin previews and reviews them in modal dialogs without new tabs.
  - Expiration dates enforce valid future dates; expired vehicles display red tags in the Admin list.
  - Rejecting a vehicle logs the reason; Customer App displays the rejection notice and allows one-click re-submission (`customer-resubmit-vehicle`).
- [ ] Manage delivery addresses in Customer App; verify updates reflect in Admin Panel.
- [ ] **Customer App Single-Screen UX (~100dvh)**:
  - Home, Fleet, Booking, Vehicle Details, Parts, Invoices fit the viewport cleanly without vertical scrolling.
  - Android back button navigates up to Home, and double-press within 2 seconds exits cleanly.
- [ ] Verify `admin_audit_log` records all administrative mutations.
- [ ] Verify `storage/logs/app-YYYY-MM.log` contains zero fatal errors.

---

## 8. Staging Operations Simulation Suite

For demonstration or QA load testing, the platform includes a historical operations generation and cleanup suite exclusively for the **Staging environment**:

### 8.1 Dataset Scope
- **Time Span**: May 2026 through September 2026 (5 months of realistic commercial history, RM 74,000+ simulated turnover).
- **Fleet Size**: 37 registered commercial vehicles across multiple logistics providers.
- **Full Lifecycle Distribution**: Vehicles distributed across Scheduled, Checked In, Inspected, Quotation Issued, Approved, Parts Ready, Under Repair, and Ready for Collection.
- **Realistic Invoices**: Linked AutoCount sales invoice rows and quotation items for aging and receivables analysis.
- **Preset Test Accounts** (Universal password: `12345678`):
  - Fleet Manager: `contact@example.com`
  - Dispatcher: `contact@example.com`
  - Senior Driver: `contact@example.com`

### 8.2 Safety Guard & One-Click Reversibility
- **Circuit Breaker**: The script checks `SELECT DATABASE()` and aborts immediately if the database name does not contain `staging`. **Never runnable in production.**
- **One-Click Teardown & Reset**:
  ```bash
  # Reverse and purge demo fleet data via Node.js script
  node backend/seed_staging_operations.js --reset
  ```
  Alternatively, execute SQL directly: [`backend/reset_staging_operations.sql`](../backend/reset_staging_operations.sql).

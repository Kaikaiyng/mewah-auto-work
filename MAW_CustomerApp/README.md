# MAW Customer App & Workshop Floor Mode

The MAW Customer App is a responsive mobile web and PWA application designed for commercial fleet clients and workshop floor technicians. It provides a client self-service portal alongside a dedicated Workshop Floor Mode, deployable to modern web browsers and native iOS/Android containers via Capacitor.

> 📖 **Master Technical Architecture & State Machine Specification**: Refer to the root [PROJECT_DOCUMENTATION.md](../PROJECT_DOCUMENTATION.md).

---

## Technology Stack & Runtime

- **Framework**: React 18.3.1 + TypeScript 5.8.3 + Vite 6.3.5
- **Mobile Container**: Capacitor 8.4.1 (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/camera`)
- **Styling**: TailwindCSS 4.1.12
- **Routing**: React Router 7.13.0
- **Backend API**: Shared PHP REST API Gateway (`backend/api.php`)

| Environment | API Endpoint | Database |
| :--- | :--- | :--- |
| **Development** | Vite proxy to Staging API | `mewahautoworksystem_staging` |
| **Staging** | `https://workshop.example.com/staging/api_staging/api.php` | `mewahautoworksystem_staging` |
| **Production** | `https://workshop.example.com/api/api.php` | `mewahautoworksystem` |

---

## Unified Authentication Flow

The login interface (`LoginScreen.tsx`) handles credentials for both customer accounts and workshop floor technicians:
1. The submission first attempts customer authentication (`mode=customer-login`).
2. If the user account is a workshop staff member, the request falls back automatically to workshop authentication (`mode=workshop-login`).
3. Technicians are routed directly to the workshop job board at `/workshop/jobs`.

---

## Core Feature Modules

### 1. Single-Screen & Filter-First Architecture (`~100dvh`)
- **Zero Long-Scroll Layout**: All primary screens (Home, Fleet, Booking, Vehicle Details, Parts, Invoices, History, Profile) fit within the viewport height without vertical scrolling.
- **High-Density Compact Rows**: Data lists use 48px–54px rows prioritizing status badges and key identifiers.
- **Minimalist Paging Control**: Compact pagination controls (`< 1 / X >`, 6–7 items/page) prevent DOM bloat and scroll fatigue.
- **Segmented Tabs & Drawers**: Multi-dimensional details are organized via horizontal segmented tabs and bottom sheet drawers.

### 2. Customer Fleet Portal
- **Home (`/home`)**: Viewport dashboard with active repair status badges, quick booking buttons, and 2×2 modular account cards.
- **Fleet & Service (`/fleet`, `/vehicles`)**: Consolidated fleet view with segmented tabs for `Vehicles`, `Bookings`, and `Compliance`, plus quick filter pills (All, In Workshop, Due Soon).
- **Booking Workflow (`/booking/*`)**: Multi-step flow: Select Vehicle &rarr; Service Category &rarr; Date & Time &rarr; Problem Description & Photos &rarr; Confirmation. Vehicle selection includes search and pagination.
- **Live Repair Progress & Quotations (`/repair-progress/:id`)**: Visual lifecycle timeline, technician inspection photos, and the quotation review card (`CustomerQuotationCard`) with itemized labor and parts breakdown. Customers can approve or reject quotations with optional feedback.
- **Vehicle Profiles & Re-submission (`/vehicles`, `/add-vehicle`)**: Fleet specifications, service history, and compliance document management (Insurance, Road Tax, PUSPAKOM) with image/PDF preview. Rejected vehicles display the administrator's reason and provide a one-click re-submission action (`customer-resubmit-vehicle`).
- **Parts Marketplace (`/parts`, `/cart`, `/cart/checkout`)**: Searchable parts store with category filters and checkout processing.
- **Delivery Addresses (`/delivery-addresses`)**: Manage shipping destinations synced with the Admin Panel.
- **Invoices (`/invoices`, `/invoice/:id`)**: Searchable invoice history with status filters and direct PDF downloads.
- **Compliance Reminders (`/reminders`)**: Inspection and road tax expiration alerts.

### 3. Workshop Floor Mode (`/workshop/jobs`)
- **Technician Job Board**: Displays work orders assigned to the logged-in technician.
- **Milestone Progress Updates**: Advance jobs through `inspected` &rarr; `under_repair` &rarr; `ready_for_collection`.
- **Photo Uploads**: Categorize photos into Before, In-Progress, and After repair stages, with customer visibility toggles.
- **Parts Requisition**: Request workshop inventory directly from the active job card.

---

## Local Development Setup

```bash
corepack enable
pnpm install
pnpm dev
```

Launch the application via the local URL (`http://localhost:5174/`). Development requests proxy to the online Staging API environment automatically.

---

## Testing, Build & Packaging

```bash
# 1. Strict TypeScript typecheck
pnpm typecheck

# 2. Production build
pnpm build

# 3. Generate distribution package
pnpm run pack
```

The resulting `CustomerApp_Update.zip` package contains both production and staging bundles ready for server deployment.

---

## Capacitor Native Applications

The codebase includes native iOS and Android project configurations:

```bash
pnpm build
npx cap sync
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio
```

Native configurations are located in `capacitor.config.ts`, `ios/`, and `android/`.

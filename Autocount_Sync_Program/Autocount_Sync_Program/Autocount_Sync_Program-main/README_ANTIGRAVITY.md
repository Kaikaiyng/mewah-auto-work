# Antigravity Engineering & Packaging Manual

This document serves as the developer and AI engineering manual for the **Mewah Auto Work (MAW) AutoCount Synchronization Service**. It enforces architectural consistency, prevents hardcoded configuration regressions, and safeguards against multi-threading deadlocks.

> 📖 **MAW Overall Architecture & Outbox Queue Specification**: Refer to the root [PROJECT_DOCUMENTATION.md](../../../PROJECT_DOCUMENTATION.md).

---

## 1. Core Architecture: Dynamic Configuration (`config.json`)

All database credentials, subsidiary identifiers, third-party API URLs, and notification tokens must remain **strictly externalized** in `config.json`:
- **Configuration Manager**: `ConfigManager.cs`
- **Loading Lifecycle**: Initialized in `FormMain.cs` constructor via `ConfigManager.GetConfig()`, automatically mapping settings to UI controls and background worker state.
- **Automatic Template Generation**: If `config.json` is missing from the working directory, the application generates a default template populated with standard database parameters (default company database `AED_Autocount_Sync_Program`).

### ⚠️ Rule 1: Never Hardcode Configuration Values
When introducing new synchronization features or parameters, **never hardcode parameters in C# source code**. Every new configuration item must:
1. Be declared in the `SyncConfig` model class inside `ConfigManager.cs`.
2. Provide a default fallback value in `CreateDefaultConfig()`.
3. Be retrieved dynamically from `config.json`.

---

## 2. Thread Safety & Headless Execution Rules

### ⚠️ Rule 2: Never Access WinForms UI Controls Across Threads
When executing within background threads (such as the synchronization loop in `StartTest`), **never access UI control properties directly** (e.g., reading `textServer.Text` or `textDBName.Text`). This causes cross-thread exceptions or UI thread deadlocks.
* **Standard Pattern**: Cache values into thread-safe private member fields during UI thread initialization (e.g., `localServer`, `localInstance`, `localDBName`). Background workers must read exclusively from these private variables.

### ⚠️ Rule 3: Headless Background Execution Without Blocking Dialogs
The synchronization service is often deployed via Windows Task Scheduler as an unattended background service. In error scenarios (e.g., database connection timeout), **never invoke blocking modal dialogs** (such as `MessageBox.Show` or the AutoCount SDK `ShowErrorMessage`), which permanently freeze headless execution.
* **Standard Pattern**: Check `if (Environment.UserInteractive)`. When running non-interactively, write logs to `Console.WriteLine` or local log files and exit gracefully.

---

## 3. Performance & Transport Security Rules

### ⚡ Performance: MySQL Connection Pool Reuse
When polling or writing to the remote MySQL database in a loop, **never open and close a database connection repeatedly inside the loop iteration**. Doing so introduces severe TCP handshake latency.
* **Standard Pattern**: Instantiate and `Open()` a single `MySqlConnection` instance outside the loop, pass the open connection to worker methods, and close it in a `finally` block once the loop cycle completes.

### 🔒 Security: Bitwise Protocol Retention
To ensure secure communication with external APIs:
* **Standard Pattern**: Use bitwise OR when assigning security protocols to retain operating system defaults (such as TLS 1.2 / TLS 1.3):
  ```csharp
  ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
  ```

---

## 4. Outbox Sync Queue Specifications

| Document Type | MAW Outbox Table | Direction | Idempotency Guarantee |
| :--- | :--- | :--- | :--- |
| **Workshop Invoice** | `autocount_invoice_sync_queue` | MAW &rarr; AutoCount | Check AutoCount `DocNo` by `internal_ref` before insertion |
| **Parts Sales DO** | `autocount_parts_order_sync_queue` | MAW &rarr; AutoCount | Check AutoCount Delivery Order by order number before insertion |
| **Purchase Order (PO)** | `autocount_purchase_order_sync_queue` | MAW &rarr; AutoCount | Check AutoCount Purchase Order by PO reference before insertion |

---

## 5. Key Source Files
* Main application window & sync controller: `FormMain.cs`
* Dynamic configuration manager: `ConfigManager.cs`
* Fallback connection data: `StartupData.cs`

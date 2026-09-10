# AutoCount Sync Local Setup

The AutoCount sync utility is source-only. Licensed assemblies, restored packages,
credentials, endpoints, exported invoices, and compiled output must remain local
and are excluded by the repository ignore policy.

## Licensed dependencies

The active .NET Framework 4.8 project requires the licensed AutoCount 2.2.26
packages listed in `packages.config`, including the Accounting, ARAP, GeneralMaint,
GL, GST, Invoicing, MainEntry, Manufacturing, Purchase, Sales, Stock, Tools, and UI
package families. Configure a NuGet source that your AutoCount licence permits,
then restore packages into the solution's ignored `packages/` directory before
building. Do not copy the assemblies into the tracked source directory.

The removed binary bundle also contained DevExpress 19.2 assemblies. The active
project does not currently reference DevExpress, so they are not needed for this
build. If a licensed UI module is restored later, obtain the matching DevExpress
19.2 assemblies through the organisation's licensed installer or NuGet source and
reference them from an ignored local package/vendor directory. Never commit those
binaries.

Install the .NET Framework 4.8 Developer Pack and use the checked-in
`Autocount_Sync_Program.sln`. Package restore supplies open-source dependencies as
well as the licensed feed dependencies. The project intentionally has no
workstation-specific post-build copy step.

## Required runtime configuration

Set these Windows environment variables for the account book and cloud database:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MAW_AUTOCOUNT_SERVER` | No | SQL Server host; defaults to `localhost` |
| `MAW_AUTOCOUNT_INSTANCE` | No | SQL Server instance when one is used |
| `MAW_AUTOCOUNT_DATABASE` | Yes | AutoCount account-book database |
| `MAW_AUTOCOUNT_SA_USER` | No | SQL administration user; defaults to `sa` |
| `MAW_AUTOCOUNT_SA_PASSWORD` | When required | SQL administration password |
| `MAW_AUTOCOUNT_USER` | Yes | AutoCount application user |
| `MAW_AUTOCOUNT_PASSWORD` | Yes | AutoCount application password |
| `MAW_CLOUD_DB_HOST` | Yes | Application database host |
| `MAW_CLOUD_DB_SERVER` | No | Optional logical server identifier |
| `MAW_CLOUD_DB_NAME` | Yes | Application database name |
| `MAW_CLOUD_DB_USER` | Yes | Application database user |
| `MAW_CLOUD_DB_PASSWORD` | Yes | Application database password |
| `MAW_AUTOCOUNT_REPORT_TEMPLATE` | For invoice PDF export | Licensed AutoCount report template name |
| `MAW_INVOICE_EXPORT_DIR` | For invoice PDF export | Local ignored directory for generated PDFs |
| `MAW_COMPANY_SHORT_CODE` | For invoice PDF export | Tenant/company folder code |
| `MAW_PDF_UPLOAD_URL` | For invoice PDF upload | HTTPS PDF receiver endpoint |
| `MAW_AUTOCOUNT_SYNC_TOKEN` | For invoice PDF upload | Shared upload authentication token |
| `MAW_TELEGRAM_BOT_TOKEN` | For Telegram alerts | Bot token |
| `MAW_TELEGRAM_SYSTEM_PROBLEM_CHAT_ID` | No | System-alert chat/channel identifier |
| `MAW_TELEGRAM_NEW_CUSTOMER_CHAT_ID` | No | New-customer chat/channel identifier |

Use deployment-secret storage or per-machine environment settings; do not add a
real `.env`, `config.json`, credential, domain, contact, or signing file to Git.
Restart the sync application after changing environment variables so the new
process receives them.

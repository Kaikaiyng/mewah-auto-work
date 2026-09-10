# Vehicle profile schema update

The Admin Panel and Customer App now treat operational **Vehicle Status**
separately from the legacy **Vehicle Condition** value stored in `status`.

## Required deployment step

Before relying on non-default Vehicle Status values in an existing environment,
apply `backend/migrations/004_vehicle_operational_status.sql` to that environment
through the normal reviewed migration process.

The migration:

- adds `vehicle_status VARCHAR(30) NOT NULL DEFAULT 'Active'`;
- makes the legacy Vehicle No. column nullable when it exists;
- preserves all existing Vehicle No., Vehicle Condition, and maintenance data;
- supports either `customer_vehicle` or `vehicles`.

The application remains backward compatible before the migration: vehicle
create/update requests still work, and missing operational status data reads as
`Active`. A database without `vehicle_status` cannot persist a non-default
operational status until the migration is applied.

This migration file was added to source control only. It is not run
automatically, and no staging or production database was accessed while making
this change.

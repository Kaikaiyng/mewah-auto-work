-- 042_sync_vehicle_profile_mileage_and_history.sql
-- Synchronize customer_vehicle profile fields (mileage, last_service_date, last_service_mileage)
-- with historical job service records to ensure 100% consistency across Admin Panel.

UPDATE customer_vehicle v
JOIN (
    SELECT 
        vehicle_id,
        MAX(checkin_mileage) AS max_m,
        MAX(CASE WHEN status IN (8, 10) THEN DATE(COALESCE(collected_at, completed_at, checkin_at, created_at)) END) AS last_date,
        SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN status IN (8, 10) AND checkin_mileage > 0 THEN checkin_mileage END ORDER BY COALESCE(collected_at, completed_at, checkin_at, created_at) DESC), ',', 1) AS last_m
    FROM job
    WHERE checkin_mileage > 0
    GROUP BY vehicle_id
) j ON j.vehicle_id = v.id
SET 
    v.mileage = GREATEST(COALESCE(v.mileage, 0), j.max_m),
    v.last_service_date = COALESCE(j.last_date, v.last_service_date),
    v.last_service_mileage = COALESCE(NULLIF(CAST(j.last_m AS UNSIGNED), 0), v.last_service_mileage, j.max_m);

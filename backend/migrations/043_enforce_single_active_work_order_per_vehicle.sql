-- 043_enforce_single_active_work_order_per_vehicle.sql
-- Enforce rule: A vehicle can only have ONE active workshop job at any time.
-- Clean up demo/legacy duplicate active jobs by marking older active jobs as collected.

UPDATE job j
JOIN (
    SELECT vehicle_id, MAX(id) AS latest_active_id
    FROM job
    WHERE status IN (2, 3, 4, 5, 6, 8)
    GROUP BY vehicle_id
    HAVING COUNT(id) > 1
) multi ON multi.vehicle_id = j.vehicle_id
SET 
    j.status = 10,
    j.completed_at = COALESCE(j.completed_at, j.checkin_at, j.created_at, NOW()),
    j.collected_at = COALESCE(j.collected_at, j.completed_at, j.checkin_at, j.created_at, NOW())
WHERE j.status IN (2, 3, 4, 5, 6, 8) AND j.id != multi.latest_active_id;

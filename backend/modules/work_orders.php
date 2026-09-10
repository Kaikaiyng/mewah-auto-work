<?php
// Work Orders & Bookings Domain Module
// Extracted from api.php to improve maintainability and modularity

// --- toAdminBookingStatus ---
function toAdminBookingStatus($status) {
    $map = [
        'pending' => 'Pending',
        'upcoming' => 'Confirmed',
        'in_progress' => 'In Progress',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
        'ready' => 'Completed'
    ];
    return $map[$status] ?? ucfirst(str_replace('_', ' ', $status));
}



// --- normalizedWorkOrderPriority ---
function normalizedWorkOrderPriority($priority) {
    $value = ucfirst(strtolower(trim(strval($priority))));
    return in_array($value, ['Normal', 'High', 'Urgent'], true) ? $value : 'Normal';
}



// --- parseMalaysiaBookingDateTime ---
function parseMalaysiaBookingDateTime($value) {
    $text = trim(strval($value));
    if ($text === '') return null;

    $malaysiaTimezone = new DateTimeZone('Asia/Kuala_Lumpur');
    try {
        // Customer App sends an explicit offset. Convert the instant back to
        // Malaysia wall-clock time instead of using the web server timezone.
        if (preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/i', $text)) {
            return (new DateTimeImmutable($text))->setTimezone($malaysiaTimezone);
        }

        foreach (['!Y-m-d H:i:s', '!Y-m-d H:i', '!Y-m-d\TH:i:s', '!Y-m-d\TH:i'] as $format) {
            $parsed = DateTimeImmutable::createFromFormat($format, $text, $malaysiaTimezone);
            if ($parsed instanceof DateTimeImmutable) return $parsed;
        }
    } catch (Throwable $error) {
        return null;
    }
    return null;
}



// --- fetchBookingItems ---
function fetchBookingItems($con, $bookingId) {
    $items = [];
    $iQuery = "SELECT * FROM booking_items WHERE booking_id = " . intval($bookingId);
    $iResult = mysqli_query($con, $iQuery);
    while ($iResult && $iRow = mysqli_fetch_assoc($iResult)) {
        $items[] = [
            'id' => 'i' . $iRow['id'],
            'name' => $iRow['name'],
            'category' => $iRow['category'],
            'quantity' => intval($iRow['quantity']),
            'price' => floatval($iRow['unit_price']),
            'unitPrice' => floatval($iRow['unit_price']),
            'total' => floatval($iRow['total'])
        ];
    }
    return $items;
}



// --- replaceJobAssignments ---
function replaceJobAssignments($con, $jobId, $technicianIds) {
    if (!tableExists($con, 'job_assignment') || !tableExists($con, 'staff')) {
        return;
    }

    $jobColumn = firstColumn($con, 'job_assignment', ['job_id', 'work_order_id']);
    $staffColumn = firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']);
    $assignmentRoleColumn = firstColumn($con, 'job_assignment', ['role', 'assignment_role']);
    if (!$jobColumn || !$staffColumn) {
        return;
    }

    $uniqueIds = [];
    foreach ((array)$technicianIds as $value) {
        $id = intval($value);
        if ($id > 0) $uniqueIds[$id] = true;
    }
    if (count($uniqueIds) > 1) {
        throw new Exception('Only one Technician / Repair Person can be assigned to a work order.', 400);
    }

    $staffColumnMap = staffColumns($con);
    $validated = [];
    foreach (array_keys($uniqueIds) as $staffId) {
        $staff = staffRecordById($con, $staffId);
        if (!$staff) {
            throw new Exception("Assigned staff ID $staffId was not found.", 400);
        }
        $rawRole = $staffColumnMap['role'] ? ($staff[$staffColumnMap['role']] ?? '') : 'Technician';
        $role = normalizeStaffRole($rawRole);
        $status = strtolower(trim(strval($staffColumnMap['status'] ? ($staff[$staffColumnMap['status']] ?? 'Active') : 'Active')));
        if (in_array($status, ['0', 'inactive', 'disabled'], true)) {
            throw new Exception("Assigned staff member is inactive.", 400);
        }
        if (!in_array($role, ['Technician', 'Foreman', 'Head Manager', 'Admin'], true)) {
            throw new Exception('Only active workshop technical staff (Foreman or Technician) can be assigned to a work order.', 400);
        }
        $validated[] = ['id' => $staffId, 'role' => in_array($role, ['Foreman', 'Head Manager', 'Admin'], true) ? $role : 'Technician'];
    }

    if (!mysqli_query($con, "DELETE FROM job_assignment WHERE `$jobColumn` = " . intval($jobId))) {
        throw new Exception('Unable to replace existing staff assignments.', 500);
    }

    foreach ($validated as $assignment) {
        $columns = ["`$jobColumn`", "`$staffColumn`"];
        $values = [intval($jobId), intval($assignment['id'])];
        if ($assignmentRoleColumn) {
            $columns[] = "`$assignmentRoleColumn`";
            $values[] = "'" . mysqli_real_escape_string($con, $assignment['role']) . "'";
        }
        $sql = "INSERT INTO job_assignment (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $values) . ")";
        if (!mysqli_query($con, $sql)) {
            throw new Exception('Unable to save staff assignments: ' . mysqli_error($con), 500);
        }
    }
}



// --- syncVehicleMileageFromCheckin ---
function syncVehicleMileageFromCheckin($con, $vehicleId, $mileage, $refId = null, $refNo = null, $source = 'work_order_checkin', $notes = null) {
    $mileageVal = intval($mileage);
    $vehicleId = intval($vehicleId);
    if ($vehicleId <= 0 || $mileageVal <= 0) return;
    $table = unifiedVehicleTable($con);
    if (!$table) return;
    $mileageColumn = firstColumn($con, $table, ['mileage', 'current_mileage']);
    if ($mileageColumn) {
        mysqli_query($con, "UPDATE `$table` SET `$mileageColumn` = GREATEST(COALESCE(`$mileageColumn`, 0), $mileageVal) WHERE id = $vehicleId");
    }
    if (function_exists('logVehicleMileageRecord')) {
        logVehicleMileageRecord($con, $vehicleId, $mileageVal, $source, $refId, $refNo, $notes);
    }
}



// --- syncVehicleLastServiceFromWorkOrder ---
function syncVehicleLastServiceFromWorkOrder($con, $vehicleId, $serviceDate) {
    $table = unifiedVehicleTable($con);
    if (!$table || $vehicleId <= 0) return;

    $lastServiceDateColumn = firstColumn($con, $table, ['last_service_date']);
    $lastServiceMileageColumn = firstColumn($con, $table, ['last_service_mileage']);
    $currentMileageColumn = firstColumn($con, $table, ['mileage', 'current_mileage']);
    $nextServiceMileageColumn = firstColumn($con, $table, ['next_service_mileage', 'service_due_mileage']);
    $nextServiceDateColumn = firstColumn($con, $table, ['next_service_date']);
    if (!$lastServiceDateColumn || !$lastServiceMileageColumn || !$currentMileageColumn) {
        throw new Exception(
            'Vehicle service fields are unavailable. Apply migration 007_complete_vehicle_profile_fields before completing this work order.',
            409
        );
    }

    $dateSql = "'" . mysqli_real_escape_string($con, $serviceDate) . "'";
    $extraUpdates = "";
    if ($nextServiceMileageColumn) {
        $extraUpdates .= ", `$nextServiceMileageColumn` = CASE WHEN COALESCE(`$currentMileageColumn`, 0) > 0 THEN `$currentMileageColumn` + 10000 ELSE `$nextServiceMileageColumn` END";
    }
    if ($nextServiceDateColumn) {
        $extraUpdates .= ", `$nextServiceDateColumn` = DATE_ADD($dateSql, INTERVAL 3 MONTH)";
    }

    $updated = mysqli_query(
        $con,
        "UPDATE `$table`
         SET `$lastServiceDateColumn` = $dateSql,
             `$lastServiceMileageColumn` = `$currentMileageColumn`
             $extraUpdates
         WHERE id = " . intval($vehicleId)
    );
    if (!$updated) {
        throw new Exception('Unable to update vehicle service history: ' . mysqli_error($con), 500);
    }
}



// --- bookingNotificationTarget ---
function bookingNotificationTarget($con, $bookingId) {
    if (tableExists($con, 'customer_appointment')) {
        $id = intval($bookingId);
        $result = mysqli_query($con, "SELECT * FROM customer_appointment WHERE id = $id LIMIT 1");
        $row = $result ? mysqli_fetch_assoc($result) : null;
        if (!$row) return null;
        $contactId = intval(rowValue($row, ['customer_id', 'user_id', 'driver_id'], 0));
        $companyId = intval(rowValue($row, ['company_id'], 0));
        $vehicleId = intval(rowValue($row, ['vehicle_id'], 0));
        if ($contactId > 0 && tableExists($con, 'customer')) {
            $contactResult = mysqli_query($con, "SELECT company_id FROM customer WHERE id = $contactId LIMIT 1");
            $contact = $contactResult ? mysqli_fetch_assoc($contactResult) : null;
            if ($companyId <= 0) $companyId = intval($contact['company_id'] ?? 0);
        }
        $target = $contactId > 0
            ? ['source' => 'customer', 'companyId' => $companyId, 'contactId' => $contactId]
            : vehicleCustomerTarget($con, $vehicleId, 'customer', $companyId, $contactId);
        return [
            'source' => $target['source'],
            'companyId' => $target['companyId'],
            'contactId' => $target['contactId'],
            'recordId' => $id,
            'number' => rowValue($row, ['appointment_no', 'booking_number', 'booking_no'], 'BK-' . $id)
        ];
    }

    if (!tableExists($con, 'bookings') || !tableExists($con, 'users')) return null;
    $cleanId = mysqli_real_escape_string($con, strval($bookingId));
    $vehicleSelect = columnExists($con, 'bookings', 'vehicle_id') ? 'b.vehicle_id' : '0 AS vehicle_id';
    $result = mysqli_query(
        $con,
        "SELECT b.id, b.booking_number, b.user_id, u.company_id, $vehicleSelect
         FROM bookings b
         JOIN users u ON u.id = b.user_id
         WHERE b.booking_number = '$cleanId' OR b.id = " . intval($bookingId) . "
         LIMIT 1"
    );
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row) return null;
    $bookingContactId = intval($row['user_id'] ?? 0);
    $target = $bookingContactId > 0
        ? ['source' => 'users', 'companyId' => intval($row['company_id'] ?? 0), 'contactId' => $bookingContactId]
        : vehicleCustomerTarget($con, intval($row['vehicle_id'] ?? 0), 'users', intval($row['company_id'] ?? 0), $bookingContactId);
    return [
        'source' => $target['source'],
        'companyId' => $target['companyId'],
        'contactId' => $target['contactId'],
        'recordId' => intval($row['id']),
        'number' => $row['booking_number']
    ];
}



// --- notifyBookingCustomer ---
function notifyBookingCustomer($con, $bookingId, $title, $message, $type = 'booking') {
    $target = bookingNotificationTarget($con, $bookingId);
    if (!$target || $target['contactId'] <= 0) return false;
    return createCustomerRecordNotification(
        $con,
        $target['source'],
        $target['companyId'],
        $target['contactId'],
        $title,
        str_replace('{booking}', $target['number'], $message),
        $type,
        'booking',
        'b' . $target['recordId'],
        '/booking/b' . $target['recordId']
    );
}



// --- adminBookingScheduleSnapshot ---
function adminBookingScheduleSnapshot($con, $bookingId) {
    $table = tableExists($con, 'customer_appointment') ? 'customer_appointment' : (tableExists($con, 'bookings') ? 'bookings' : null);
    if (!$table) return null;
    $dateColumn = firstColumn($con, $table, ['appointment_at', 'appointment_date', 'service_date', 'date']);
    if (!$dateColumn) return null;

    $cleanId = mysqli_real_escape_string($con, strval($bookingId));
    $where = $table === 'customer_appointment'
        ? 'id = ' . intval($bookingId)
        : "booking_number = '$cleanId' OR id = " . intval($bookingId);
    $result = mysqli_query(
        $con,
        "SELECT id, `$dateColumn` AS scheduled_at FROM `$table` WHERE $where LIMIT 1"
    );
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row || empty($row['scheduled_at'])) return null;
    $timestamp = strtotime(strval($row['scheduled_at']));
    if ($timestamp === false) return null;
    return [
        'recordId' => intval($row['id']),
        'timestamp' => $timestamp,
        'minuteKey' => date('Y-m-d H:i', $timestamp),
        'dateKey' => date('Y-m-d', $timestamp),
        'dateLabel' => date('j M Y', $timestamp),
        'timeLabel' => date('g:i A', $timestamp)
    ];
}



// --- bookingScheduleChangeMessage ---
function bookingScheduleChangeMessage($before, $after) {
    if (!$before || !$after) return '';
    if ($before['dateKey'] === $after['dateKey']) {
        return '{booking} appointment time was changed by the workshop from ' .
            $before['timeLabel'] . ' to ' . $after['timeLabel'] . ' on ' . $after['dateLabel'] . '.';
    }
    return '{booking} appointment was rescheduled by the workshop from ' .
        $before['dateLabel'] . ' at ' . $before['timeLabel'] . ' to ' .
        $after['dateLabel'] . ' at ' . $after['timeLabel'] . '.';
}

// Legacy Customers and Vehicles helpers moved to modules/customers.php and modules/vehicles.php



// --- legacyBookings ---
function legacyBookings($con) {
    if (!tableExists($con, 'customer_appointment')) {
        return null;
    }

    $bookings = [];
    $result = mysqli_query($con, "SELECT * FROM customer_appointment ORDER BY id DESC");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $customerName = rowValue($row, ['customer_name', 'name'], '-');
        $companyName = '-';
        $companyId = 0;
        $customerId = 0;
        $vehicleId = 0;

        $customerId = intval(rowValue($row, ['customer_id', 'user_id', 'driver_id'], 0));
        if ($customerId > 0) {
            if (tableExists($con, 'customer')) {
                $customerQuery = "SELECT c.name AS customer_name, c.company_id, comp.name AS company_name 
                                  FROM customer c 
                                  LEFT JOIN company comp ON c.company_id = comp.id 
                                  WHERE c.id = $customerId LIMIT 1";
                $customerResult = mysqli_query($con, $customerQuery);
                if ($customerResult && $customer = mysqli_fetch_assoc($customerResult)) {
                    $customerName = $customer['customer_name'];
                    $companyName = $customer['company_name'] ?: '-';
                    $companyId = intval($customer['company_id']);
                }
            }
        }

        $vehicleId = intval(rowValue($row, ['vehicle_id'], 0));
        $vReg = rowValue($row, ['vehicle', 'vehicle_no', 'reg_no', 'plate_no'], '');
        $vehicleTable = unifiedVehicleTable($con);
        $vehicleRegColumn = $vehicleTable
            ? firstColumn($con, $vehicleTable, ['reg_no', 'registration_no', 'plate_no'])
            : null;
        if ($vehicleTable && $vehicleRegColumn && ($vehicleId > 0 || $vReg !== '')) {
            $vehicleWhere = $vehicleId > 0
                ? 'id = ' . $vehicleId
                : "`$vehicleRegColumn` = '" . mysqli_real_escape_string($con, $vReg) . "'";
            $vRes = mysqli_query($con, "SELECT * FROM `$vehicleTable` WHERE $vehicleWhere LIMIT 1");
            if ($vRes && $vRow = mysqli_fetch_assoc($vRes)) {
                $vehicleId = intval($vRow['id']);
                $vReg = rowValue($vRow, ['reg_no', 'registration_no', 'plate_no'], $vReg);
                $vehicleCompanyId = intval(rowValue($vRow, ['company_id'], 0));
                if ($companyId === 0 && $vehicleCompanyId > 0 && tableExists($con, 'company')) {
                    $companyId = $vehicleCompanyId;
                    $cRes = mysqli_query($con, "SELECT name FROM company WHERE id = " . $companyId . " LIMIT 1");
                    if ($cRes && $cRow = mysqli_fetch_assoc($cRes)) {
                        $companyName = $cRow['name'];
                    }
                }
            }
        }

        $dateValue = rowValue($row, ['appointment_at', 'appointment_date', 'service_date', 'date', 'created_at'], date('Y-m-d H:i:s'));
        $timestamp = strtotime($dateValue) ?: time();
        $status = rowValue($row, ['status'], 'Pending');

        $bookings[] = [
            'id' => rowValue($row, ['appointment_no', 'booking_number', 'booking_no', 'id'], 'A-' . rowValue($row, ['id'], '')),
            'idVal' => intval(rowValue($row, ['id'], 0)),
            'customerId' => $customerId,
            'customer' => $customerName,
            'companyId' => $companyId,
            'companyName' => $companyName,
            'vehicleId' => $vehicleId,
            'vehicle' => $vReg ?: '-',
            'service' => rowValue($row, ['service', 'service_type', 'services', 'title'], '-'),
            'date' => date('Y-m-d', $timestamp),
            'time' => date('H:i', $timestamp),
            'location' => rowValue($row, ['location', 'service_centre', 'branch'], '-'),
            'status' => toAdminBookingStatus(strtolower(str_replace(' ', '_', $status))),
            'technician' => rowValue($row, ['technician', 'staff_name'], '-'),
            'staffId' => intval(rowValue($row, ['staff_id', 'technician_id', 'assigned_staff_id'], 0)),
            'customerNotes' => rowValue($row, ['notes', 'remark', 'description'], ''),
            'reportedProblem' => rowValue($row, ['reported_problem', 'complaint'], ''),
            'technicianNotes' => rowValue($row, ['technician_notes', 'mechanic_notes'], '')
        ];
    }

    return $bookings;
}



// --- pendingAdminBookingCount ---
function pendingAdminBookingCount($con) {
    if (tableExists($con, 'customer_appointment')) {
        $statusColumn = firstColumn($con, 'customer_appointment', ['status']);
        if (!$statusColumn) return 0;
        return intval(scalarQuery(
            $con,
            "SELECT COUNT(*) AS total
             FROM customer_appointment
             WHERE LOWER(TRIM(CAST(`$statusColumn` AS CHAR))) = 'pending'",
            'total',
            0
        ));
    }

    if (tableExists($con, 'bookings')) {
        return intval(scalarQuery(
            $con,
            "SELECT COUNT(*) AS total
             FROM bookings
             WHERE order_type = 'service'
               AND LOWER(TRIM(CAST(status AS CHAR))) = 'pending'",
            'total',
            0
        ));
    }

    return 0;
}



// --- saveAdminBooking ---
function saveAdminBooking($con, $data, $id = null) {
    $useLegacy = tableExists($con, 'customer_appointment');
    
    $vehicleId = intval($data['vehicleId'] ?? 0);
    $customerId = intval($data['customerId'] ?? 0);
    $createdByCompanyUserId = intval($data['createdByCompanyUserId'] ?? 0);
    $serviceTypeValue = trim(strval($data['service'] ?? ''));
    $serviceType = mysqli_real_escape_string($con, $serviceTypeValue);
    $serviceDate = mysqli_real_escape_string($con, ($data['date'] ?? date('Y-m-d')) . ' ' . ($data['time'] ?? date('H:i:s')));
    $locationValue = trim(strval($data['location'] ?? ''));
    $location = mysqli_real_escape_string($con, $locationValue);
    $statusValue = trim(strval($data['status'] ?? 'pending'));
    $status = mysqli_real_escape_string($con, $statusValue);
    $staffId = intval($data['staffId'] ?? 0);
    $technicianName = trim(strval($data['technician'] ?? ''));
    if ($staffId > 0) {
        $staff = staffRecordById($con, $staffId);
        $staffColumnMap = staffColumns($con);
        if (!$staff || !$staffColumnMap['name']) return false;
        $technicianName = trim(strval($staff[$staffColumnMap['name']] ?? ''));
    }
    $technician = mysqli_real_escape_string($con, $technicianName);
    $notesValue = trim(strval($data['customerNotes'] ?? ''));
    $notes = mysqli_real_escape_string($con, $notesValue);
    $reportedProblemValue = trim(strval($data['reportedProblem'] ?? ''));
    $reportedProblem = mysqli_real_escape_string($con, $reportedProblemValue);
    $mechanicNotesValue = trim(strval($data['technicianNotes'] ?? ''));
    $mechanicNotes = mysqli_real_escape_string($con, $mechanicNotesValue);
    
    // Status mapping
    $statusValue = trim(strval($data['status'] ?? ''));
    $dbStatus = 'pending';
    if ($statusValue !== '') {
        $normalized = normalizedBookingLifecycleStatus($statusValue);
        $dbStatus = $normalized === 'confirmed' ? 'upcoming' : $normalized;
    }

    if ($useLegacy) {
        $regNo = '';
        $custName = '';
        $companyId = intval($data['companyId'] ?? 0);
        $vehicleTable = unifiedVehicleTable($con);
        $vehicleRegColumn = $vehicleTable
            ? firstColumn($con, $vehicleTable, ['reg_no', 'registration_no', 'plate_no'])
            : null;
        if ($vehicleId > 0 && $vehicleTable && $vehicleRegColumn) {
            $vRes = mysqli_query($con, "SELECT `$vehicleRegColumn` AS reg_no, company_id FROM `$vehicleTable` WHERE id = $vehicleId LIMIT 1");
            if ($vRes && $vRow = mysqli_fetch_assoc($vRes)) {
                $regNo = strval($vRow['reg_no']);
                if ($companyId <= 0 && isset($vRow['company_id'])) {
                    $companyId = intval($vRow['company_id']);
                }
            }
        }
        if ($customerId > 0 && tableExists($con, 'customer')) {
            $cRes = mysqli_query($con, "SELECT name, company_id FROM customer WHERE id = $customerId LIMIT 1");
            if ($cRes && $cRow = mysqli_fetch_assoc($cRes)) {
                $custName = strval($cRow['name']);
                if ($companyId <= 0) $companyId = intval($cRow['company_id'] ?? 0);
            }
        }
        if ($custName === '' && $customerId > 0 && tableExists($con, 'users')) {
            $uRes = mysqli_query($con, "SELECT name, company_id FROM users WHERE id = $customerId LIMIT 1");
            if ($uRes && $uRow = mysqli_fetch_assoc($uRes)) {
                $custName = strval($uRow['name']);
                if ($companyId <= 0) $companyId = intval($uRow['company_id'] ?? 0);
            }
        }
        if ($custName === '' && $companyId > 0 && tableExists($con, 'company')) {
            $compRes = mysqli_query($con, "SELECT name FROM company WHERE id = $companyId LIMIT 1");
            if ($compRes && $compRow = mysqli_fetch_assoc($compRes)) {
                $custName = strval($compRow['name']);
            }
        }
        if ($custName === '') {
            $custName = 'Customer';
        }

        $serviceId = intval($data['serviceId'] ?? 0);
        if ($serviceId <= 0) {
            $svcLower = strtolower($serviceTypeValue);
            if (strpos($svcLower, 'maintenance') !== false || strpos($svcLower, '保养') !== false) {
                $serviceId = 1;
            } elseif (strpos($svcLower, 'repair') !== false || strpos($svcLower, '维修') !== false) {
                $serviceId = 2;
            } elseif (strpos($svcLower, 'part') !== false || strpos($svcLower, '配件') !== false) {
                $serviceId = 3;
            } else {
                $serviceId = 1;
            }
        }

        $fieldCandidates = [
            'appointmentNo' => ['appointment_no', 'booking_number', 'booking_no'],
            'customerId' => ['customer_id', 'user_id', 'driver_id'],
            'createdByCompanyUserId' => ['created_by_company_user_id'],
            'customerName' => ['customer_name', 'name'],
            'companyId' => ['company_id'],
            'vehicleId' => ['vehicle_id'],
            'vehicle' => ['vehicle', 'vehicle_no', 'reg_no', 'plate_no'],
            'serviceId' => ['service_id', 'service_type_id'],
            'service' => ['service', 'service_type', 'services', 'title'],
            'appointmentAt' => ['appointment_at', 'appointment_date', 'service_date', 'date'],
            'location' => ['location', 'service_centre', 'branch'],
            'status' => ['status'],
            'staffId' => ['staff_id', 'technician_id', 'assigned_staff_id'],
            'technician' => ['technician', 'staff_name'],
            'customerNotes' => ['notes', 'remark'],
            'reportedProblem' => ['reported_problem', 'complaint'],
            'technicianNotes' => ['technician_notes', 'mechanic_notes']
        ];
        $bookingData = [
            'customerId' => $customerId,
            'createdByCompanyUserId' => $createdByCompanyUserId > 0 ? $createdByCompanyUserId : null,
            'customerName' => $custName,
            'companyId' => $companyId,
            'vehicleId' => $vehicleId,
            'vehicle' => $regNo,
            'serviceId' => $serviceId,
            'service' => $serviceTypeValue,
            'appointmentAt' => $serviceDate,
            'location' => $locationValue,
            'status' => $dbStatus,
            'staffId' => $staffId > 0 ? $staffId : null,
            'technician' => $technicianName,
            'customerNotes' => $notesValue,
            'reportedProblem' => $reportedProblemValue,
            'technicianNotes' => $mechanicNotesValue
        ];
        if ($id !== null) {
            $statusColumn = firstColumn($con, 'customer_appointment', ['status']);
            $bookingId = intval($id);
            $statusResult = $statusColumn && $bookingId > 0
                ? mysqli_query(
                    $con,
                    "SELECT `$statusColumn` AS booking_status
                     FROM customer_appointment
                     WHERE id = $bookingId
                     LIMIT 1"
                )
                : false;
            $statusRow = $statusResult ? mysqli_fetch_assoc($statusResult) : null;
            if (!$statusRow) {
                sendResponse(false, 'Booking not found.', null, 404);
            }
            $currentLifecycleStatus = normalizedBookingLifecycleStatus($statusRow['booking_status']);
            if ($statusValue !== '') {
                $bookingData['status'] = $dbStatus;
            } else {
                $bookingData['status'] = strval($statusRow['booking_status']);
            }
        }
        if ($id === null) {
            $bookingData['appointmentNo'] = 'BK-' . date('Ymd-His') . '-' . random_int(100, 999);
        }
        $kinds = [
            'customerId' => 'int',
            'createdByCompanyUserId' => 'nullable-int',
            'companyId' => 'nullable-int',
            'vehicleId' => 'int',
            'serviceId' => 'int',
            'staffId' => 'nullable-int',
            'appointmentAt' => 'date-time'
        ];
        $requiredFields = [
            'customerId', 'vehicleId', 'service', 'appointmentAt', 'location',
            'status', 'customerNotes', 'reportedProblem', 'technicianNotes'
        ];
        $fields = [];
        $missingFields = [];
        foreach ($bookingData as $key => $value) {
            $column = firstColumn($con, 'customer_appointment', $fieldCandidates[$key] ?? [$key]);
            if (!$column) {
                if (in_array($key, $requiredFields, true)) $missingFields[] = $key;
                continue;
            }
            $fields[$column] = unifiedVehicleSqlValue($con, $value, $kinds[$key] ?? 'string');
        }
        if ($missingFields) {
            sendResponse(
                false,
                'Booking storage schema is incomplete. Missing fields: ' . implode(', ', $missingFields) .
                    '. Apply migration 008_complete_booking_fields before saving.',
                null,
                409
            );
        }

        if ($id !== null) {
            $updates = [];
            foreach ($fields as $col => $val) $updates[] = "`$col` = $val";
            $query = "UPDATE customer_appointment SET " . implode(', ', $updates) . " WHERE id = " . intval($id);
            return mysqli_query($con, $query);
        } else {
            $cols = array_map(function ($column) { return "`$column`"; }, array_keys($fields));
            $vals = array_values($fields);
            $query = "INSERT INTO customer_appointment (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ")";
            return mysqli_query($con, $query);
        }
    } else {
        if (!columnExists($con, 'bookings', 'reported_problem')) {
            sendResponse(
                false,
                'Booking storage schema is incomplete. Missing field: reportedProblem. ' .
                    'Apply migration 008_complete_booking_fields before saving.',
                null,
                409
            );
        }
        $staffIdUpdate = columnExists($con, 'bookings', 'staff_id')
            ? ", staff_id = " . ($staffId > 0 ? $staffId : "NULL")
            : "";
        if ($id !== null) {
            $cleanId = mysqli_real_escape_string($con, strval($id));
            $statusResult = mysqli_query(
                $con,
                "SELECT status FROM bookings
                 WHERE booking_number = '$cleanId' OR id = " . intval($id) . '
                 LIMIT 1'
            );
            $statusRow = $statusResult ? mysqli_fetch_assoc($statusResult) : null;
            if (!$statusRow) {
                sendResponse(false, 'Booking not found.', null, 404);
            }
            $statusUpdate = $statusValue !== '' ? ", status = '" . mysqli_real_escape_string($con, $dbStatus) . "'" : "";
            $query = "UPDATE bookings SET 
                      user_id = $customerId,
                      vehicle_id = " . ($vehicleId ?: "NULL") . ",
                      service_type = '$serviceType',
                      service_date = '$serviceDate',
                      service_centre = '$location',
                      technician = '$technician',
                      notes = '$notes',
                      reported_problem = '$reportedProblem',
                      mechanic_notes = '$mechanicNotes'
                      $statusUpdate
                      $staffIdUpdate
                      WHERE booking_number = '$id' OR id = " . intval($id);
            return mysqli_query($con, $query);
        } else {
            $bookingNum = 'BK' . date('Ymd') . rand(1000, 9999);
            $staffIdColumn = columnExists($con, 'bookings', 'staff_id') ? ", staff_id" : "";
            $staffIdValue = columnExists($con, 'bookings', 'staff_id')
                ? ", " . ($staffId > 0 ? $staffId : "NULL")
                : "";
            $creatorColumn = columnExists($con, 'bookings', 'created_by_company_user_id')
                ? ", created_by_company_user_id"
                : "";
            $creatorValue = $creatorColumn !== ''
                ? ", " . ($createdByCompanyUserId > 0 ? $createdByCompanyUserId : "NULL")
                : "";
            $query = "INSERT INTO bookings
                      (booking_number, order_type, user_id, vehicle_id, service_type, service_date, service_centre, status, technician, notes, reported_problem, mechanic_notes$staffIdColumn$creatorColumn)
                      VALUES
                      ('$bookingNum', 'service', $customerId, " . ($vehicleId ?: "NULL") . ", '$serviceType', '$serviceDate', '$location', '$dbStatus', '$technician', '$notes', '$reportedProblem', '$mechanicNotes'$staffIdValue$creatorValue)";
            return mysqli_query($con, $query);
        }
    }
}



// --- deleteAdminBooking ---
function deleteAdminBooking($con, $id) {
    $useLegacy = tableExists($con, 'customer_appointment');
    if ($useLegacy) {
        if (
            tableExists($con, 'job') &&
            columnExists($con, 'job', 'source_booking_id') &&
            countRows($con, 'job', 'source_booking_id = ' . intval($id)) > 0
        ) {
            sendResponse(false, 'This booking already has a work order and cannot be deleted.', null, 409);
        }
        return mysqli_query($con, "DELETE FROM customer_appointment WHERE id = " . intval($id));
    } else {
        $cleanId = mysqli_real_escape_string($con, $id);
        return mysqli_query($con, "DELETE FROM bookings WHERE booking_number = '$cleanId' OR id = " . intval($id));
    }
}



// --- normalizedBookingLifecycleStatus ---
function normalizedBookingLifecycleStatus($status) {
    $normalized = strtolower(str_replace(' ', '_', trim(strval($status))));
    $map = [
        'upcoming' => 'confirmed',
        'processing' => 'in_progress',
        'converted' => 'in_progress',
        'ready' => 'completed'
    ];
    return $map[$normalized] ?? $normalized;
}



// --- updateAdminBookingStatus ---
function updateAdminBookingStatus($con, $id, $status) {
    $targetStatus = normalizedBookingLifecycleStatus($status);
    if (!in_array($targetStatus, ['confirmed', 'cancelled'], true)) {
        sendResponse(false, 'Invalid booking status.', null, 422);
    }

    $databaseStatus = $targetStatus === 'confirmed' ? 'upcoming' : $targetStatus;
    $escapedStatus = mysqli_real_escape_string($con, $databaseStatus);

    if (tableExists($con, 'customer_appointment')) {
        $statusColumn = firstColumn($con, 'customer_appointment', ['status']);
        if (!$statusColumn) {
            sendResponse(
                false,
                'Booking storage schema is incomplete. Missing field: status. ' .
                    'Apply migration 008_complete_booking_fields before updating.',
                null,
                409
            );
        }
        $bookingId = intval($id);
        if ($bookingId <= 0) {
            sendResponse(false, 'Invalid booking id.', null, 422);
        }
        $currentResult = mysqli_query(
            $con,
            "SELECT `$statusColumn` AS booking_status FROM customer_appointment WHERE id = $bookingId LIMIT 1"
        );
        $currentRow = $currentResult ? mysqli_fetch_assoc($currentResult) : null;
        if (!$currentRow) {
            sendResponse(false, 'Booking not found.', null, 404);
        }
        $currentStatus = normalizedBookingLifecycleStatus($currentRow['booking_status'] ?? '');
        $allowedTargets = [
            'pending' => ['confirmed', 'cancelled'],
            'confirmed' => ['cancelled']
        ];
        if (!in_array($targetStatus, $allowedTargets[$currentStatus] ?? [], true)) {
            sendResponse(
                false,
                'Booking status cannot change from ' . ucfirst(str_replace('_', ' ', $currentStatus)) .
                    ' to ' . ucfirst(str_replace('_', ' ', $targetStatus)) . '.',
                null,
                409
            );
        }
        if ($targetStatus === 'cancelled' && tableExists($con, 'job') && columnExists($con, 'job', 'source_booking_id')) {
            mysqli_query($con, "UPDATE job SET status = 'cancelled' WHERE source_booking_id = $bookingId AND status NOT IN ('completed', 'collected', '8', '9')");
        }
        if (tableExists($con, 'bookings')) {
            mysqli_query($con, "UPDATE bookings SET status = '$escapedStatus' WHERE id = $bookingId");
        }
        return mysqli_query(
            $con,
            "UPDATE customer_appointment SET `$statusColumn` = '$escapedStatus' WHERE id = $bookingId"
        );
    }

    if (!tableExists($con, 'bookings')) {
        sendResponse(false, 'Booking storage is unavailable.', null, 409);
    }
    $cleanId = mysqli_real_escape_string($con, strval($id));
    $bookingNumericId = intval($id);
    $currentResult = mysqli_query(
        $con,
        "SELECT status FROM bookings WHERE booking_number = '$cleanId' OR id = " . $bookingNumericId . ' LIMIT 1'
    );
    $currentRow = $currentResult ? mysqli_fetch_assoc($currentResult) : null;
    if (!$currentRow) {
        sendResponse(false, 'Booking not found.', null, 404);
    }
    $currentStatus = normalizedBookingLifecycleStatus($currentRow['status'] ?? '');
    $allowedTargets = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['cancelled']
    ];
    if (!in_array($targetStatus, $allowedTargets[$currentStatus] ?? [], true)) {
        sendResponse(false, 'This booking status transition is not allowed.', null, 409);
    }
    if ($targetStatus === 'cancelled' && tableExists($con, 'job') && columnExists($con, 'job', 'source_booking_id') && $bookingNumericId > 0) {
        mysqli_query($con, "UPDATE job SET status = 'cancelled' WHERE source_booking_id = $bookingNumericId AND status NOT IN ('completed', 'collected', '8', '9')");
    }
    return mysqli_query(
        $con,
        "UPDATE bookings SET status = '$escapedStatus'
         WHERE booking_number = '$cleanId' OR id = " . intval($id)
    );
}



// --- checkInBookingAndCreateWorkOrder ---
function checkInBookingAndCreateWorkOrder($con, $id, $data) {
    if (!tableExists($con, 'customer_appointment') || !tableExists($con, 'job')) {
        sendResponse(false, 'Booking check-in is unavailable for the current database schema.', null, 409);
    }

    $requiredJobColumns = [
        'work_order_no', 'source_booking_id', 'vehicle_id', 'company_id',
        'service_type', 'service_centre', 'reported_problem', 'customer_notes',
        'status', 'checkin_at', 'created_at'
    ];
    $missingColumns = array_values(array_filter(
        $requiredJobColumns,
        function ($column) use ($con) {
            return !columnExists($con, 'job', $column);
        }
    ));
    if ($missingColumns) {
        sendResponse(
            false,
            'Work order storage schema is incomplete. Missing fields: ' . implode(', ', $missingColumns) .
                '. Apply migration 009_booking_checkin_work_order before checking in.',
            null,
            409
        );
    }

    $bookingId = intval($id);
    if ($bookingId <= 0) {
        sendResponse(false, 'Invalid booking id.', null, 422);
    }

    $priority = trim(strval($data['priority'] ?? 'Normal'));
    if (!in_array($priority, ['Normal', 'High', 'Urgent'], true)) {
        sendResponse(false, 'Invalid priority level.', null, 422);
    }
    $bay = trim(strval($data['bay'] ?? ''));
    if ($bay !== '' && !in_array($bay, ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Engine Bay', 'Trailer Bay'], true)) {
        sendResponse(false, 'Invalid workshop bay selection.', null, 422);
    }
    $estimatedOut = trim(strval($data['estimatedOut'] ?? ''));
    if ($estimatedOut !== '') {
        $estimatedTimestamp = strtotime($estimatedOut);
        if ($estimatedTimestamp === false || $estimatedTimestamp < strtotime(date('Y-m-d'))) {
            sendResponse(false, 'Expected completion date cannot be before the check-in date.', null, 422);
        }
    }

    mysqli_begin_transaction($con);
    try {
        $bookingResult = mysqli_query(
            $con,
            "SELECT * FROM customer_appointment WHERE id = $bookingId LIMIT 1 FOR UPDATE"
        );
        $booking = $bookingResult ? mysqli_fetch_assoc($bookingResult) : null;
        if (!$booking) {
            throw new Exception('Booking not found.', 404);
        }

        $statusColumn = firstColumn($con, 'customer_appointment', ['status']);
        $currentStatus = normalizedBookingLifecycleStatus(
            $statusColumn ? ($booking[$statusColumn] ?? '') : ''
        );
        if ($currentStatus !== 'confirmed') {
            throw new Exception('Only a confirmed booking can be checked in.', 409);
        }
        if (countRows($con, 'job', "source_booking_id = $bookingId") > 0) {
            throw new Exception('This booking already has a work order.', 409);
        }

        $customerId = intval(rowValue($booking, ['customer_id', 'user_id', 'driver_id'], 0));
        $companyId = intval(rowValue($booking, ['company_id'], 0));
        if ($customerId > 0 && tableExists($con, 'customer')) {
            $customerResult = mysqli_query(
                $con,
                "SELECT company_id FROM customer WHERE id = $customerId LIMIT 1"
            );
            $customer = $customerResult ? mysqli_fetch_assoc($customerResult) : null;
            if ($companyId <= 0) $companyId = intval($customer['company_id'] ?? 0);
        }

        $vehicleId = intval(rowValue($booking, ['vehicle_id'], 0));
        $vehicleTable = unifiedVehicleTable($con);
        $vehicleRegColumn = $vehicleTable
            ? firstColumn($con, $vehicleTable, ['reg_no', 'registration_no', 'plate_no'])
            : null;
        if ($vehicleId <= 0 && $vehicleTable && $vehicleRegColumn) {
            $registration = trim(strval(rowValue($booking, ['vehicle', 'vehicle_no', 'reg_no', 'plate_no'], '')));
            if ($registration !== '') {
                $registrationSql = mysqli_real_escape_string($con, $registration);
                $vehicleResult = mysqli_query(
                    $con,
                    "SELECT id, company_id FROM `$vehicleTable`
                     WHERE `$vehicleRegColumn` = '$registrationSql'
                     LIMIT 1"
                );
                $vehicle = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
                $vehicleId = intval($vehicle['id'] ?? 0);
                if ($companyId <= 0) $companyId = intval($vehicle['company_id'] ?? 0);
            }
        }
        if ($vehicleId <= 0 || $companyId <= 0) {
            throw new Exception('Booking vehicle or company information is incomplete.', 409);
        }
        if ($vehicleTable && columnExists($con, $vehicleTable, 'company_id')) {
            $vehicleResult = mysqli_query(
                $con,
                "SELECT company_id FROM `$vehicleTable` WHERE id = $vehicleId LIMIT 1"
            );
            $vehicle = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
            if (!$vehicle || intval($vehicle['company_id'] ?? 0) !== $companyId) {
                throw new Exception('The booking vehicle does not belong to the selected company.', 409);
            }
        }

        $serviceType = rowValue($booking, ['service', 'service_type', 'services', 'title'], '');
        $serviceCentre = rowValue($booking, ['location', 'service_centre', 'branch'], '');
        $reportedProblem = rowValue($booking, ['reported_problem', 'complaint'], '');
        $customerNotes = rowValue($booking, ['notes', 'remark', 'description'], '');
        $bookingScheduledAt = rowValue(
            $booking,
            ['appointment_at', 'appointment_date', 'service_date', 'date'],
            date('Y-m-d')
        );
        $createdBy = intval($_SESSION['admin_id'] ?? 0);

        $fields = [
            'source_booking_id' => strval($bookingId),
            'vehicle_id' => strval($vehicleId),
            'company_id' => strval($companyId),
            'service_type' => unifiedVehicleSqlValue($con, $serviceType),
            'service_centre' => unifiedVehicleSqlValue($con, $serviceCentre),
            'reported_problem' => unifiedVehicleSqlValue($con, $reportedProblem),
            'customer_notes' => unifiedVehicleSqlValue($con, $customerNotes),
            'status' => '2',
            'checkin_at' => 'NOW()',
            'created_at' => 'NOW()'
        ];
        if (columnExists($con, 'job', 'intake_type')) {
            $fields['intake_type'] = "'booking'";
        }
        $bookingDriverId = intval(rowValue($booking, ['driver_id', 'brought_by_driver_id'], 0));
        if ($bookingDriverId > 0 && columnExists($con, 'job', 'brought_by_driver_id')) {
            $fields['brought_by_driver_id'] = strval($bookingDriverId);
        }
        $bookingForemanId = intval(rowValue($booking, ['staff_id', 'foreman_id'], 0));
        if ($bookingForemanId > 0 && columnExists($con, 'job', 'foreman_id')) {
            $fields['foreman_id'] = strval($bookingForemanId);
        }
        if (columnExists($con, 'job', 'customer_id')) {
            $fields['customer_id'] = $customerId > 0 ? strval($customerId) : 'NULL';
        }
        if (columnExists($con, 'job', 'service_id')) $fields['service_id'] = '0';
        if (columnExists($con, 'job', 'priority')) {
            $fields['priority'] = unifiedVehicleSqlValue($con, $priority);
        }
        if (columnExists($con, 'job', 'bay')) {
            $fields['bay'] = unifiedVehicleSqlValue($con, $bay, 'nullable-string');
        }
        if (columnExists($con, 'job', 'scheduled_at')) {
            // scheduled_at is the original booking/service date and is NOT NULL
            // in the legacy job schema. Expected completion belongs in the
            // nullable estimated_out column.
            $fields['scheduled_at'] = unifiedVehicleSqlValue($con, $bookingScheduledAt, 'date-time');
        }
        if (columnExists($con, 'job', 'estimated_out')) {
            $fields['estimated_out'] = unifiedVehicleSqlValue($con, $estimatedOut, 'date');
        }
        if (columnExists($con, 'job', 'created_by')) {
            $fields['created_by'] = $createdBy > 0 ? strval($createdBy) : 'NULL';
        }
        if (columnExists($con, 'job', 'customer_visible_update')) {
            $fields['customer_visible_update'] = unifiedVehicleSqlValue(
                $con,
                'Vehicle checked in at ' . date('Y-m-d H:i') . '.'
            );
        }
        $checkinMileage = isset($data['checkinMileage']) && is_numeric($data['checkinMileage'])
            ? intval($data['checkinMileage'])
            : null;
        $bookingVehicleId = intval($booking['vehicle_id'] ?? 0);
        if ($bookingVehicleId > 0) {
            $activeJobCheckRes = mysqli_query($con, "
                SELECT id, work_order_no, status FROM job
                WHERE vehicle_id = $bookingVehicleId AND status IN (2, 3, 4, 5, 6, 8)
                LIMIT 1
            ");
            if ($activeJobCheckRes && $activeJobRow = mysqli_fetch_assoc($activeJobCheckRes)) {
                $existingWo = $activeJobRow['work_order_no'];
                $statusCode = intval($activeJobRow['status']);
                $statusMap = [
                    2 => 'Checked In',
                    3 => 'Inspected',
                    4 => 'Approved',
                    5 => 'Parts Ready',
                    6 => 'Under Repair',
                    8 => 'Ready for Collection'
                ];
                $existingStatus = $statusMap[$statusCode] ?? 'In Workshop';
                throw new Exception("This vehicle already has an active work order ($existingWo - $existingStatus). A vehicle cannot have more than one ongoing workshop job simultaneously. Please complete and collect the existing work order first.", 400);
            }
        }
        if ($checkinMileage !== null && $checkinMileage > 0 && $bookingVehicleId > 0) {
            $vCheckRes = mysqli_query($con, "SELECT mileage FROM customer_vehicle WHERE id = $bookingVehicleId");
            $vCheckRow = $vCheckRes ? mysqli_fetch_assoc($vCheckRes) : null;
            $maxJobRes = mysqli_query($con, "SELECT MAX(checkin_mileage) AS max_m FROM job WHERE vehicle_id = $bookingVehicleId");
            $maxJobM = ($maxJobRes && $mjRow = mysqli_fetch_assoc($maxJobRes)) ? intval($mjRow['max_m']) : 0;
            $priorRecorded = max($maxJobM, intval($vCheckRow['mileage'] ?? 0));
            if ($priorRecorded > 0 && $checkinMileage < $priorRecorded) {
                throw new Exception("Check-in mileage (" . number_format($checkinMileage) . " km) cannot be less than the vehicle's previous recorded mileage (" . number_format($priorRecorded) . " km).", 400);
            }
        }
        if ($checkinMileage !== null && $checkinMileage >= 0 && columnExists($con, 'job', 'checkin_mileage')) {
            $fields['checkin_mileage'] = strval($checkinMileage);
        }

        $columns = array_map(function ($column) { return "`$column`"; }, array_keys($fields));
        $inserted = mysqli_query(
            $con,
            'INSERT INTO job (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_values($fields)) . ')'
        );
        if (!$inserted) {
            throw new Exception('Unable to create work order: ' . mysqli_error($con), 500);
        }

        $jobId = mysqli_insert_id($con);
        $workOrderNo = sprintf('WO-%s-%06d', date('Y'), $jobId);
        $workOrderNoSql = mysqli_real_escape_string($con, $workOrderNo);
        if (!mysqli_query($con, "UPDATE job SET work_order_no = '$workOrderNoSql' WHERE id = $jobId")) {
            throw new Exception('Unable to generate work order number: ' . mysqli_error($con), 500);
        }

        if ($checkinMileage !== null && $checkinMileage > 0 && !empty($booking['vehicle_id'])) {
            syncVehicleMileageFromCheckin($con, intval($booking['vehicle_id']), $checkinMileage, $jobId, $workOrderNo, 'booking_checkin', 'Booking appointment check-in intake');
        }

        if (array_key_exists('technicianIds', $data)) {
            replaceJobAssignments($con, $jobId, $data['technicianIds']);
        }

        if (!$statusColumn || !mysqli_query(
            $con,
            "UPDATE customer_appointment SET `$statusColumn` = 'in_progress' WHERE id = $bookingId"
        )) {
            throw new Exception('Unable to update booking status: ' . mysqli_error($con), 500);
        }

        mysqli_commit($con);
        return ['id' => $jobId, 'workOrderNo' => $workOrderNo];
    } catch (Throwable $error) {
        mysqli_rollback($con);
        $code = intval($error->getCode());
        sendResponse(
            false,
            $error->getMessage(),
            null,
            $code >= 400 && $code <= 599 ? $code : 500
        );
    }
}

// Parts & Inventory helpers moved to modules/parts.php



// --- requireWorkOrderPhotoSchema ---
function requireWorkOrderPhotoSchema($con) {
    if (tableExists($con, 'work_order_photo')) return;
    $sql = "CREATE TABLE IF NOT EXISTS `work_order_photo` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `work_order_id` BIGINT NOT NULL,
        `category` VARCHAR(30) NOT NULL DEFAULT 'repair',
        `caption` VARCHAR(500) NULL,
        `storage_path` VARCHAR(500) NOT NULL,
        `original_name` VARCHAR(255) NOT NULL,
        `mime_type` VARCHAR(100) NOT NULL,
        `byte_size` BIGINT UNSIGNED NOT NULL,
        `uploaded_by_staff_id` INT NULL,
        `customer_visible` TINYINT(1) NOT NULL DEFAULT 1,
        `taken_at` DATETIME NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_work_order_photo_job_created` (`work_order_id`, `created_at`),
        KEY `idx_work_order_photo_customer` (`work_order_id`, `customer_visible`),
        KEY `idx_work_order_photo_staff` (`uploaded_by_staff_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    if (!mysqli_query($con, $sql) || !tableExists($con, 'work_order_photo')) {
        sendResponse(false, 'Unable to prepare photo storage: ' . mysqli_error($con), null, 500);
    }
}



// --- workOrderPhotoPayload ---
function workOrderPhotoPayload($row) {
    return [
        'id' => intval($row['id']),
        'workOrderId' => intval($row['work_order_id']),
        'category' => $row['category'] ?? 'repair',
        'caption' => $row['caption'] ?? '',
        'originalName' => $row['original_name'] ?? '',
        'mimeType' => $row['mime_type'] ?? 'image/jpeg',
        'byteSize' => intval($row['byte_size'] ?? 0),
        'uploadedByStaffId' => intval($row['uploaded_by_staff_id'] ?? 0),
        'uploadedBy' => $row['uploaded_by'] ?? 'Workshop team',
        'customerVisible' => !empty($row['customer_visible']),
        'takenAt' => $row['taken_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null
    ];
}



// --- workOrderPhotoMap ---
function workOrderPhotoMap($con, $workOrderIds, $customerOnly = false) {
    if (!tableExists($con, 'work_order_photo') || empty($workOrderIds)) return [];
    $ids = array_values(array_unique(array_filter(array_map('intval', $workOrderIds))));
    if (!$ids) return [];
    $staffNameColumn = tableExists($con, 'staff')
        ? firstColumn($con, 'staff', ['name', 'staff_name', 'full_name', 'username'])
        : null;
    $staffSelect = $staffNameColumn ? "s.`$staffNameColumn` AS uploaded_by" : "'Workshop team' AS uploaded_by";
    $staffJoin = $staffNameColumn ? 'LEFT JOIN staff s ON s.id = p.uploaded_by_staff_id' : '';
    $visibleWhere = $customerOnly ? ' AND p.customer_visible = 1' : '';
    $result = mysqli_query($con, "SELECT p.*, $staffSelect FROM work_order_photo p $staffJoin WHERE p.work_order_id IN (" . implode(',', $ids) . ")$visibleWhere ORDER BY p.created_at DESC, p.id DESC");
    $map = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $map[intval($row['work_order_id'])][] = workOrderPhotoPayload($row);
    }
    return $map;
}



// --- workshopCanAccessWorkOrder ---
function workshopCanAccessWorkOrder($con, $workOrderId, $requiresAssignment = false) {
    $workOrderId = intval($workOrderId);
    $staffId = intval($_SESSION['admin_id'] ?? 0);
    if ($workOrderId <= 0 || $staffId <= 0 || empty($_SESSION['admin_role'])) return false;
    $role = currentAdminRoleName($con);
    // Older admin sessions predate admin_source/admin_logged_in. The validated
    // Admin role is sufficient and keeps photo access consistent with the rest
    // of the authenticated Admin API.
    if ($role === 'Admin') return countRows($con, 'job', "id = $workOrderId") > 0;
    if ($role === 'Head Manager') return countRows($con, 'job', "id = $workOrderId") > 0;
    if ($role === 'Foreman' && !$requiresAssignment) {
        $statusSql = getCanonicalStatusSql($con);
        return countRows($con, 'job', "id = $workOrderId AND ($statusSql) <> 'collected'") > 0;
    }
    if (columnExists($con, 'job', 'foreman_id') && countRows($con, 'job', "id = $workOrderId AND foreman_id = $staffId") > 0) return true;
    if (!tableExists($con, 'job_assignment')) return false;
    $jobColumn = firstColumn($con, 'job_assignment', ['job_id', 'work_order_id']);
    $staffColumn = firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']);
    return $jobColumn && $staffColumn && countRows($con, 'job_assignment', "`$jobColumn` = $workOrderId AND `$staffColumn` = $staffId") > 0;
}



// --- streamWorkOrderPhoto ---
function streamWorkOrderPhoto($con, $photoId) {
    requireWorkOrderPhotoSchema($con);
    $photoId = intval($photoId);
    $result = mysqli_query($con, "SELECT p.*, j.company_id, j.vehicle_id FROM work_order_photo p JOIN job j ON j.id = p.work_order_id WHERE p.id = $photoId LIMIT 1");
    $photo = $result ? mysqli_fetch_assoc($result) : null;
    if (!$photo) sendResponse(false, 'Photo not found.', null, 404);

    $allowed = workshopCanAccessWorkOrder($con, intval($photo['work_order_id']));
    if (!$allowed && !empty($photo['customer_visible']) && !empty($_SESSION['customer_user_id'])) {
        $auth = [
            'userId' => intval($_SESSION['customer_user_id'] ?? 0),
            'companyId' => intval($_SESSION['customer_company_id'] ?? 0),
            'source' => $_SESSION['customer_source'] ?? '',
            'isSuperadmin' => !empty($_SESSION['customer_is_superadmin'])
        ];
        if (!empty($auth['isSuperadmin']) || intval($photo['company_id']) === $auth['companyId']) {
            $scope = customerVehicleAccessScope($con, $auth);
            $allowed = !$scope['scoped'] || in_array(intval($photo['vehicle_id']), $scope['vehicleIds'], true);
        }
    }
    if (!$allowed) sendResponse(false, 'You are not authorised to view this photo.', null, 403);

    $file = resolveWorkOrderPhotoFile($photo['storage_path']);
    if (!$file || !is_file($file)) {
        sendResponse(false, 'Photo file is unavailable.', null, 404);
    }
    header_remove('Content-Type');
    header('Content-Type: ' . ($photo['mime_type'] ?: 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="work-order-photo-' . $photoId . '"');
    header('Cache-Control: private, max-age=300');
    readfile($file);
    exit;
}

function getWorkOrderPhotoStorageRoot($createIfMissing = false) {
    $candidateRoots = [
        dirname(__DIR__) . '/storage/work-order-photos',
        __DIR__ . '/storage/work-order-photos',
        dirname(dirname(__DIR__)) . '/storage/work-order-photos',
    ];

    foreach ($candidateRoots as $root) {
        if (is_dir($root)) return $root;
    }

    if ($createIfMissing) {
        $primary = dirname(__DIR__) . '/storage/work-order-photos';
        if (!is_dir($primary)) @mkdir($primary, 0755, true);
        if (is_dir($primary)) return $primary;

        $fallback = __DIR__ . '/storage/work-order-photos';
        if (!is_dir($fallback)) @mkdir($fallback, 0755, true);
        if (is_dir($fallback)) return $fallback;
    }

    return dirname(__DIR__) . '/storage/work-order-photos';
}

function resolveWorkOrderPhotoFile($storagePath) {
    $cleanPath = str_replace(['..', '\\'], ['', '/'], ltrim(strval($storagePath), '/'));
    if ($cleanPath === '') return false;

    $candidateRoots = [
        dirname(__DIR__) . '/storage/work-order-photos',
        __DIR__ . '/storage/work-order-photos',
        dirname(dirname(__DIR__)) . '/storage/work-order-photos',
        dirname(__DIR__) . '/uploads/work-order-photos',
    ];

    foreach ($candidateRoots as $root) {
        $realRoot = realpath($root);
        if ($realRoot && is_dir($realRoot)) {
            $realFile = realpath($realRoot . '/' . $cleanPath);
            if ($realFile && is_file($realFile) && strpos($realFile, $realRoot) === 0) {
                return $realFile;
            }
        }
    }
    return false;
}

// Vehicle document helpers moved to modules/vehicles.php



// --- customerBookings ---
function customerBookings($con, $auth) {
    $companyId = intval($auth['companyId']);
    $isSuperadmin = !empty($auth['isSuperadmin']);
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    $bookings = [];
    if (tableExists($con, 'customer_appointment') && tableExists($con, 'customer')) {
        $dateColumn = firstColumn($con, 'customer_appointment', ['appointment_at', 'appointment_date', 'service_date', 'date', 'created_at']);
        $customerColumn = firstColumn($con, 'customer_appointment', ['customer_id', 'user_id', 'driver_id']);
        if (!$customerColumn) return customerLegacyInvoiceBookings($con, $auth);
        $where = $isSuperadmin ? '' : " WHERE c.company_id = $companyId";
        $query = "SELECT a.*, c.company_id AS customer_company_id
                  FROM customer_appointment a
                  JOIN customer c ON a.`$customerColumn` = c.id
                  $where
                  ORDER BY a.id DESC";
        $result = mysqli_query($con, $query);
        $mappedJobIds = [];
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $rawStatus = strtolower(str_replace(' ', '_', rowValue($row, ['status'], 'pending')));
            $statusMap = ['upcoming' => 'confirmed', 'in_progress' => 'converted', 'processing' => 'converted'];
            $status = $statusMap[$rawStatus] ?? $rawStatus;
            if (!in_array($status, ['pending', 'confirmed', 'converted', 'cancelled', 'no_show', 'completed'], true)) $status = 'pending';
            $vehicleId = intval(rowValue($row, ['vehicle_id'], 0));
            if ($vehicleId <= 0) {
                $plate = mysqli_real_escape_string($con, rowValue($row, ['vehicle', 'reg_no', 'plate_no'], ''));
                if ($plate !== '' && tableExists($con, 'customer_vehicle')) {
                    $vehicleWhere = $isSuperadmin
                        ? "reg_no = '$plate'"
                        : "company_id = $companyId AND reg_no = '$plate'";
                    $vehicleResult = mysqli_query($con, "SELECT id FROM customer_vehicle WHERE $vehicleWhere LIMIT 1");
                    $vehicleRow = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
                    $vehicleId = intval($vehicleRow['id'] ?? 0);
                }
            }
            if ($vehicleScope['scoped'] && !customerVehicleIsAccessible($vehicleScope, $vehicleId)) continue;
            $sourceId = intval($row['id']);
            $workOrderNumber = null;
            $workOrderId = null;
            if (tableExists($con, 'job') && columnExists($con, 'job', 'source_booking_id')) {
                $jobWhere = $isSuperadmin
                    ? "source_booking_id = $sourceId"
                    : "company_id = $companyId AND source_booking_id = $sourceId";
                $jobResult = mysqli_query($con, "SELECT * FROM job WHERE $jobWhere LIMIT 1");
                $job = $jobResult ? mysqli_fetch_assoc($jobResult) : null;
                if ($job) {
                    $mappedJobIds[] = intval($job['id']);
                    $workOrderId = 'wo' . intval($job['id']);
                    $workOrderNumber = $job['work_order_no'];
                    $workOrderStatus = deriveCanonicalStatus($job);
                    if ($status === 'cancelled' || $rawStatus === 'cancelled' || $workOrderStatus === 'cancelled') {
                        $status = 'cancelled';
                        $workOrderStatus = 'cancelled';
                    } elseif ($workOrderStatus === 'collected') {
                        $status = 'completed';
                    } else {
                        $status = 'converted';
                    }
                }
            }
            $bookingNumber = rowValue($row, ['appointment_no', 'booking_number', 'booking_no'], 'BK-' . $sourceId);
            $bookings[] = [
                'id' => 'b' . $sourceId,
                'bookingNumber' => $bookingNumber,
                'orderType' => 'service',
                'vehicleId' => $vehicleId > 0 ? 'v' . $vehicleId : null,
                'serviceType' => rowValue($row, ['service', 'service_type', 'services', 'title'], 'Service'),
                'serviceDate' => $dateColumn ? $row[$dateColumn] : null,
                'serviceCentre' => rowValue($row, ['location', 'service_centre', 'branch'], '-'),
                'status' => $status,
                'totalPrice' => 0,
                'notes' => rowValue($row, ['notes', 'remark'], ''),
                'reportedProblem' => rowValue($row, ['reported_problem', 'description', 'complaint'], ''),
                'workOrderId' => $workOrderId,
                'workOrderNumber' => $workOrderNumber,
                'workOrderStatus' => $workOrderId ? $workOrderStatus : null,
                'intakeType' => 'booking',
                'requestChannel' => 'Customer App'
            ];
        }

        // Merge direct Walk-in / Rescue / Workshop work orders that do not originate from an online appointment
        if (tableExists($con, 'job')) {
            $vehicleTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
            $companyVehicleSql = "";
            if (tableExists($con, $vehicleTable) && columnExists($con, $vehicleTable, 'company_id')) {
                $companyVehicleSql = " OR j.vehicle_id IN (SELECT id FROM `$vehicleTable` WHERE company_id = $companyId)";
            }
            $jobWhere = $isSuperadmin ? "WHERE 1=1" : "WHERE (j.company_id = $companyId$companyVehicleSql)";
            if ($vehicleScope['scoped']) {
                $jobWhere .= customerScopedVehicleSql($vehicleScope, 'j.vehicle_id');
            }
            if (!empty($mappedJobIds)) {
                $jobWhere .= " AND j.id NOT IN (" . implode(',', $mappedJobIds) . ")";
            }
            $directJobsResult = mysqli_query($con, "SELECT j.* FROM job j $jobWhere ORDER BY j.id DESC");
            while ($directJobsResult && $jobRow = mysqli_fetch_assoc($directJobsResult)) {
                $directJobId = intval($jobRow['id']);
                $workOrderId = 'wo' . $directJobId;
                $workOrderNumber = rowValue($jobRow, ['work_order_no'], 'WO-' . $directJobId);
                $workOrderStatus = deriveCanonicalStatus($jobRow);
                if ($workOrderStatus === 'unknown' || $workOrderStatus === 'cancelled') continue;

                $status = $workOrderStatus === 'collected' ? 'completed' : 'converted';
                $vehicleId = intval($jobRow['vehicle_id'] ?? 0);
                if ($vehicleScope['scoped'] && !customerVehicleIsAccessible($vehicleScope, $vehicleId)) continue;

                $serviceType = rowValue($jobRow, ['service_type'], '');
                if (!$serviceType || in_array(strtolower($serviceType), ['general service', 'service'], true)) {
                    $serviceType = (rowValue($jobRow, ['intake_type'], '') === 'rescue') ? 'Emergency Rescue' : 'Walk-in Repair';
                }
                $serviceDate = rowValue($jobRow, ['checkin_at', 'created_at', 'scheduled_at'], null);
                $serviceCentre = rowValue($jobRow, ['service_centre', 'bay'], 'Pasir Gudang HQ');

                $bookings[] = [
                    'id' => 'wo' . $directJobId,
                    'bookingNumber' => $workOrderNumber,
                    'orderType' => 'service',
                    'vehicleId' => $vehicleId > 0 ? 'v' . $vehicleId : null,
                    'serviceType' => $serviceType,
                    'serviceDate' => $serviceDate,
                    'serviceCentre' => $serviceCentre,
                    'status' => $status,
                    'totalPrice' => 0,
                    'notes' => rowValue($jobRow, ['customer_notes', 'notes'], ''),
                    'reportedProblem' => rowValue($jobRow, ['reported_problem'], ''),
                    'workOrderId' => $workOrderId,
                    'workOrderNumber' => $workOrderNumber,
                    'workOrderStatus' => $workOrderStatus,
                    'intakeType' => rowValue($jobRow, ['intake_type'], 'walk_in'),
                    'requestChannel' => rowValue($jobRow, ['request_channel'], 'Walk-in')
                ];
            }
        }

        $allBookings = array_merge(
            $bookings,
            customerPartsOrders($con, $auth),
            customerWorkOrderInvoiceBookings($con, $auth),
            customerAccountingInvoiceBookings($con, $auth),
            customerLegacyInvoiceBookings($con, $auth)
        );
        usort($allBookings, function ($a, $b) {
            $dateA = strtotime($a['serviceDate'] ?? $a['createdAt'] ?? '1970-01-01');
            $dateB = strtotime($b['serviceDate'] ?? $b['createdAt'] ?? '1970-01-01');
            return $dateB <=> $dateA;
        });
        return $allBookings;
    }

    if (!tableExists($con, 'bookings') || !tableExists($con, 'users') || !columnExists($con, 'users', 'company_id')) return [];
    $where = $isSuperadmin ? '' : " WHERE u.company_id = $companyId";
    $query = "SELECT b.* FROM bookings b JOIN users u ON b.user_id = u.id$where ORDER BY b.id DESC";
    $result = mysqli_query($con, $query);
    while ($result && $row = mysqli_fetch_assoc($result)) {
        if ($vehicleScope['scoped'] && !customerVehicleIsAccessible($vehicleScope, intval($row['vehicle_id'] ?? 0))) continue;
        $items = fetchBookingItems($con, intval($row['id']));
        $rawStatus = $row['status'];
        $statusMap = ['upcoming' => 'confirmed', 'in_progress' => 'converted', 'processing' => 'preparing'];
        $status = $statusMap[$rawStatus] ?? $rawStatus;
        $booking = [
            'id' => ($row['order_type'] === 'parts' ? 'p' : 'b') . intval($row['id']),
            'bookingNumber' => $row['booking_number'],
            'invoiceNumber' => $row['invoice_number'],
            'orderType' => $row['order_type'],
            'vehicleId' => $row['vehicle_id'] ? 'v' . intval($row['vehicle_id']) : null,
            'serviceType' => $row['service_type'],
            'serviceDate' => $row['service_date'],
            'serviceCentre' => $row['service_centre'],
            'status' => $status,
            'totalPrice' => floatval($row['total_price']),
            'notes' => $row['notes'],
            'reportedProblem' => $row['reported_problem'] ?? '',
            'deliveryAddress' => $row['delivery_address'],
            'fulfilmentMethod' => (
                $row['order_type'] === 'parts' &&
                !empty($row['service_centre']) &&
                $row['service_centre'] !== 'Customer Parts Order'
            ) ? 'pickup' : 'delivery',
            'items' => $items
        ];
        if ($row['invoice_number']) {
            $booking['invoice'] = [
                'items' => $items,
                'laborCost' => floatval($row['labor_cost']),
                'subtotal' => floatval($row['subtotal']),
                'tax' => floatval($row['tax']),
                'total' => floatval($row['total_price'])
            ];
        }
        $bookings[] = $booking;
    }
    return array_merge($bookings, customerPartsOrders($con, $auth), customerWorkOrderInvoiceBookings($con, $auth), customerAccountingInvoiceBookings($con, $auth));
}

// customerParts moved to modules/parts.php



// --- customerWorkOrders ---
function customerWorkOrders($con, $auth) {
    if (!tableExists($con, 'job') || !columnExists($con, 'job', 'company_id')) return [];
    $companyId = intval($auth['companyId']);
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    $vehicleTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
    $companyVehicleSql = "";
    if (tableExists($con, $vehicleTable) && columnExists($con, $vehicleTable, 'company_id')) {
        $companyVehicleSql = " OR vehicle_id IN (SELECT id FROM `$vehicleTable` WHERE company_id = $companyId)";
    }
    $where = !empty($auth['isSuperadmin']) ? '' : " WHERE (company_id = $companyId$companyVehicleSql)";
    if ($vehicleScope['scoped']) $where .= customerScopedVehicleSql($vehicleScope, 'vehicle_id');
    $result = mysqli_query($con, "SELECT * FROM job$where ORDER BY id DESC");
    $orders = [];
    $workOrderIds = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $status = deriveCanonicalStatus($row);
        if ($status === 'unknown' || $status === 'cancelled') continue;
        $stageOrder = [
            'scheduled', 'checked_in', 'inspected', 'quotation_issued', 'approved',
            'parts_ready', 'under_repair', 'ready_for_collection', 'collected'
        ];
        $stageLabels = [
            'scheduled' => 'Booking Confirmed',
            'checked_in' => 'Vehicle Checked In',
            'inspected' => 'Inspection Completed',
            'quotation_issued' => 'Quotation (Optional)',
            'approved' => 'Repair Approved',
            'parts_ready' => 'Parts Ready',
            'under_repair' => 'Under Repair',
            'ready_for_collection' => 'Ready for Collection',
            'collected' => 'Completed / Collected'
        ];
        $stageDates = [
            'scheduled' => rowValue($row, ['created_at'], null),
            'checked_in' => rowValue($row, ['checkin_at'], null),
            'inspected' => rowValue($row, ['inspected_at'], null),
            'quotation_issued' => rowValue($row, ['quotation_issued_at'], null),
            'approved' => rowValue($row, ['approved_at'], null),
            'parts_ready' => rowValue($row, ['parts_ready_at'], null),
            'under_repair' => rowValue($row, ['under_repair_at'], null),
            'ready_for_collection' => rowValue($row, ['completed_at'], null),
            'collected' => rowValue($row, ['collected_at'], null)
        ];
        $currentStageIndex = array_search($status, $stageOrder, true);
        $timeline = [];
        foreach ($stageOrder as $stageIndex => $stage) {
            if (
                $stage === 'quotation_issued' &&
                empty($stageDates[$stage]) &&
                $currentStageIndex !== false &&
                $currentStageIndex > $stageIndex
            ) {
                continue;
            }
            $timeline[] = [
                'id' => $stage,
                'label' => $stageLabels[$stage],
                'date' => $stageDates[$stage],
                'completed' => $currentStageIndex !== false && $stageIndex <= $currentStageIndex
            ];
        }
        $customerQuotation = workOrderQuotation($con, intval($row['id']));
        if ($customerQuotation && $customerQuotation['status'] === 'draft') $customerQuotation = null;
        $workOrderIds[] = intval($row['id']);
        $orders[] = [
            'id' => 'wo' . intval($row['id']),
            'workOrderNumber' => rowValue($row, ['work_order_no'], 'WO-' . intval($row['id'])),
            'companyId' => 'company-' . intval($row['company_id'] ?? $companyId),
            'vehicleId' => 'v' . intval($row['vehicle_id']),
            'bookingId' => !empty($row['source_booking_id']) ? 'b' . intval($row['source_booking_id']) : null,
            'status' => $status,
            'checkedInAt' => rowValue($row, ['checkin_at'], null),
            'expectedCompletionAt' => rowValue($row, ['estimated_out', 'scheduled_at'], null),
            'latestCustomerUpdate' => rowValue($row, ['customer_visible_update'], ''),
            'serviceType' => rowValue($row, ['service_type'], ''),
            'intakeType' => rowValue($row, ['intake_type'], !empty($row['source_booking_id']) ? 'booking' : 'walk_in'),
            'requestChannel' => rowValue($row, ['request_channel'], ''),
            'serviceCentre' => rowValue($row, ['service_centre'], ''),
            'reportedProblem' => rowValue($row, ['reported_problem'], ''),
            'customerNotes' => rowValue($row, ['customer_notes'], ''),
            'timeline' => $timeline,
            'customerVisibleItems' => [],
            'workshopPhone' => getenv('MAW_WORKSHOP_PHONE') ?: '',
            'quotation' => $customerQuotation,
            'photos' => []
        ];
    }
    $photoMap = workOrderPhotoMap($con, $workOrderIds, true);
    foreach ($orders as &$order) {
        $numericId = intval(preg_replace('/\D+/', '', $order['id']));
        $order['photos'] = $photoMap[$numericId] ?? [];
    }
    unset($order);
    return $orders;
}




// --- requireWorkOrderPartRequirementSchema ---
function requireWorkOrderPartRequirementSchema($con) {
    if (tableExists($con, 'work_order_part_requirement')) return;
    $sql = "CREATE TABLE IF NOT EXISTS `work_order_part_requirement` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `work_order_id` BIGINT NOT NULL,
        `part_id` BIGINT NULL,
        `item_code` VARCHAR(80) NULL,
        `description` VARCHAR(500) NOT NULL,
        `uom` VARCHAR(30) NULL,
        `required_quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
        `unit_price` DECIMAL(14,2) NOT NULL DEFAULT 0,
        `sort_order` INT NOT NULL DEFAULT 0,
        `created_by` INT NULL,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_work_order_part_requirement_job` (`work_order_id`),
        KEY `idx_work_order_part_requirement_part` (`part_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    if (!mysqli_query($con, $sql)) {
        sendResponse(false, 'Unable to prepare inspection parts storage: ' . mysqli_error($con), null, 500);
    }
}



// --- workOrderPartRequirements ---
function workOrderPartRequirements($con, $workOrderId) {
    requireWorkOrderPartRequirementSchema($con);
    $workOrderId = intval($workOrderId);
    $requirements = [];
    $result = mysqli_query($con, "SELECT * FROM work_order_part_requirement WHERE work_order_id = $workOrderId ORDER BY sort_order, id");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $code = trim(strval($row['item_code'] ?? ''));
        $description = trim(strval($row['description'] ?? ''));
        $partId = $row['part_id'] !== null ? intval($row['part_id']) : null;
        if ($code === '' && $description === '' && empty($partId)) continue;
        $requirements[] = [
            'id' => intval($row['id']),
            'partId' => $partId,
            'code' => $code,
            'description' => $description,
            'uom' => trim(strval($row['uom'] ?? '')),
            'quantity' => floatval($row['required_quantity']),
            'unitPrice' => floatval($row['unit_price'])
        ];
    }
    return $requirements;
}



// --- replaceWorkOrderPartRequirements ---
function replaceWorkOrderPartRequirements($con, $workOrderId, $items) {
    requireWorkOrderPartRequirementSchema($con);
    $workOrderId = intval($workOrderId);
    if (!is_array($items) || count($items) > 100) sendResponse(false, 'Inspection parts must be an array of at most 100 items.', null, 400);
    $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    $partIdColumn = $partTable ? firstColumn($con, $partTable, ['id']) : null;
    $partNameColumn = $partTable ? firstColumn($con, $partTable, ['name', 'part_name', 'title']) : null;
    $partSkuColumn = $partTable ? firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']) : null;
    $partUomColumn = $partTable ? firstColumn($con, $partTable, ['uom', 'unit', 'unit_of_measure']) : null;
    $adminId = intval($_SESSION['admin_id'] ?? 0);
    $normalized = [];
    foreach ($items as $index => $item) {
        if (!is_array($item)) continue;
        $codeValue = substr(trim(strval($item['code'] ?? $item['itemCode'] ?? $item['item_code'] ?? '')), 0, 80);
        $descriptionValue = substr(trim(strval($item['description'] ?? $item['name'] ?? $codeValue)), 0, 500);
        $quantity = round(floatval($item['quantity'] ?? $item['requiredQuantity'] ?? 0), 2);
        $partId = intval($item['partId'] ?? $item['inventoryPartId'] ?? 0);
        if (($codeValue === '' && $descriptionValue === '' && $partId <= 0) || $quantity <= 0) continue;
        $uomValue = substr(trim(strval($item['uom'] ?? '')), 0, 30);
        $partRow = null;
        if ($partTable) {
            if ($partIdColumn && $partSkuColumn && $codeValue !== '') {
                $codeSql = mysqli_real_escape_string($con, $codeValue);
                $lookup = mysqli_query($con, "SELECT * FROM `$partTable` WHERE UPPER(TRIM(`$partSkuColumn`)) = UPPER(TRIM('$codeSql')) LIMIT 1");
                $partRow = $lookup ? mysqli_fetch_assoc($lookup) : null;
            }
            if (!$partRow && $partIdColumn && $partId > 0) {
                $lookup = mysqli_query($con, "SELECT * FROM `$partTable` WHERE `$partIdColumn` = $partId LIMIT 1");
                $partRow = $lookup ? mysqli_fetch_assoc($lookup) : null;
            }
            if (!$partRow && $partNameColumn && $descriptionValue !== '') {
                $descSql = mysqli_real_escape_string($con, $descriptionValue);
                $lookup = mysqli_query($con, "SELECT * FROM `$partTable` WHERE UPPER(TRIM(`$partNameColumn`)) = UPPER(TRIM('$descSql')) LIMIT 1");
                $partRow = $lookup ? mysqli_fetch_assoc($lookup) : null;
            }
            if ($partRow) {
                if ($partId <= 0 && $partIdColumn && isset($partRow[$partIdColumn])) {
                    $partId = intval($partRow[$partIdColumn]);
                }
                if ($uomValue === '' && $partUomColumn) $uomValue = trim(strval($partRow[$partUomColumn] ?? ''));
                if ($descriptionValue === $codeValue && $partNameColumn && !empty($partRow[$partNameColumn])) {
                    $descriptionValue = trim(strval($partRow[$partNameColumn]));
                }
            }
        }
        $unitPrice = round(max(0, floatval($item['unitPrice'] ?? 0)), 2);
        if ($unitPrice <= 0 && !empty($partRow)) {
            $priceCol = firstColumn($con, $partTable, ['price', 'selling_price', 'unit_price', 'Price', 'SellingPrice', 'ItemPrice', 'UnitPrice', 'sellingprice', 'price1']);
            if ($priceCol && isset($partRow[$priceCol]) && floatval($partRow[$priceCol]) > 0) {
                $unitPrice = round(floatval($partRow[$priceCol]), 2);
            } else {
                $costCol = firstColumn($con, $partTable, ['cost_price', 'cost', 'standard_cost', 'unit_cost', 'Cost', 'CostPrice', 'StandardCost']);
                if ($costCol && isset($partRow[$costCol]) && floatval($partRow[$costCol]) > 0) {
                    $cost = floatval($partRow[$costCol]);
                    $markup = floatval(systemSettingValue($con, 'pricing.parts_markup'));
                    $unitPrice = $markup > 0 ? round($cost * (1 + ($markup / 100)), 2) : round($cost, 2);
                }
            }
        }
        $normalized[] = [
            'partId' => $partId > 0 ? $partId : null,
            'code' => $codeValue,
            'description' => $descriptionValue,
            'uom' => $uomValue,
            'quantity' => $quantity,
            'unitPrice' => $unitPrice,
            'sortOrder' => $index
        ];
    }
    mysqli_begin_transaction($con);
    try {
        if (!mysqli_query($con, "DELETE FROM work_order_part_requirement WHERE work_order_id = $workOrderId")) throw new Exception(mysqli_error($con), 500);
        foreach ($normalized as $item) {
            $partIdSql = $item['partId'] ? intval($item['partId']) : 'NULL';
            $code = mysqli_real_escape_string($con, $item['code']);
            $description = mysqli_real_escape_string($con, $item['description']);
            $uom = mysqli_real_escape_string($con, $item['uom']);
            if (!mysqli_query($con, "INSERT INTO work_order_part_requirement (work_order_id, part_id, item_code, description, uom, required_quantity, unit_price, sort_order, created_by) VALUES ($workOrderId, $partIdSql, '$code', '$description', '$uom', {$item['quantity']}, {$item['unitPrice']}, {$item['sortOrder']}, $adminId)")) throw new Exception(mysqli_error($con), 500);
        }
        mysqli_commit($con);
    } catch (Throwable $error) {
        mysqli_rollback($con);
        throw $error;
    }
    $overview = workOrderPartsOverview($con, $workOrderId);
    $jobRes = mysqli_query($con, "SELECT is_back_order FROM job WHERE id = $workOrderId LIMIT 1");
    $jobRow = $jobRes ? mysqli_fetch_assoc($jobRes) : null;
    $isBackOrderJob = !empty($jobRow['is_back_order']);
    $automaticPartsStatus = $isBackOrderJob ? 'parts_ready' : automaticPartsStatusFromOverview($overview);
    if (columnExists($con, 'job', 'parts_status')) {
        mysqli_query($con, "UPDATE job SET parts_status = '$automaticPartsStatus', parts_status_updated_at = NOW(), parts_status_updated_by = " . ($adminId > 0 ? $adminId : 'NULL') . " WHERE id = $workOrderId");
    }
    syncQuotationFromWorkOrderParts($con, $workOrderId);
    return workOrderPartRequirements($con, $workOrderId);
}



// --- getWorkOrderAcknowledgedPartsSnapshot ---
function getWorkOrderAcknowledgedPartsSnapshot($con, $workOrderId) {
    $workOrderId = intval($workOrderId);
    if ($workOrderId <= 0) return null;
    if (columnExists($con, 'job', 'acknowledged_parts_snapshot')) {
        $res = mysqli_query($con, "SELECT acknowledged_parts_snapshot FROM job WHERE id = $workOrderId LIMIT 1");
        if ($res && $row = mysqli_fetch_assoc($res)) {
            $raw = $row['acknowledged_parts_snapshot'] ?? '';
            if (!empty($raw)) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) return $decoded;
            }
        }
    }
    return null;
}



// --- saveWorkOrderAcknowledgedPartsSnapshot ---
function saveWorkOrderAcknowledgedPartsSnapshot($con, $workOrderId, $items = null) {
    $workOrderId = intval($workOrderId);
    if ($workOrderId <= 0) return;
    if (!columnExists($con, 'job', 'acknowledged_parts_snapshot')) {
        mysqli_query($con, "ALTER TABLE `job` ADD COLUMN `acknowledged_parts_snapshot` LONGTEXT NULL DEFAULT NULL");
    }
    if ($items === null) {
        $items = workOrderPartRequirements($con, $workOrderId);
    }
    $snapshot = [];
    foreach ($items as $item) {
        $code = strtoupper(trim(strval($item['code'] ?? $item['itemCode'] ?? '')));
        $desc = strtoupper(trim(strval($item['description'] ?? '')));
        $key = $code !== '' ? 'code:' . $code : 'description:' . $desc;
        $snapshot[$key] = floatval($item['quantity'] ?? $item['requiredQuantity'] ?? 0);
    }
    $json = mysqli_real_escape_string($con, json_encode($snapshot));
    mysqli_query($con, "UPDATE job SET acknowledged_parts_snapshot = '$json' WHERE id = $workOrderId");
}



// --- workOrderPartsOverview ---
function workOrderPartsOverview($con, $workOrderId) {
    $workOrderId = intval($workOrderId);
    $inventoryByCode = [];
    $inventoryById = [];
    $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if ($partTable) {
        $idColumn = firstColumn($con, $partTable, ['id']);
        $nameColumn = firstColumn($con, $partTable, ['name', 'part_name', 'title']);
        $skuColumn = firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
        $stockColumn = firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']);
        $uomColumn = firstColumn($con, $partTable, ['uom', 'unit', 'unit_of_measure']);
        if ($idColumn && $nameColumn && $skuColumn && $stockColumn) {
            $uomSelect = $uomColumn ? "`$uomColumn`" : "''";
            $inventoryResult = mysqli_query($con, "SELECT `$idColumn` AS inventory_id, `$skuColumn` AS sku, `$nameColumn` AS part_name, `$stockColumn` AS stock_on_hand, $uomSelect AS uom FROM `$partTable`");
            while ($inventoryResult && $row = mysqli_fetch_assoc($inventoryResult)) {
                $record = [
                    'id' => intval($row['inventory_id']),
                    'code' => trim(strval($row['sku'] ?? '')),
                    'description' => trim(strval($row['part_name'] ?? '')),
                    'stockOnHand' => max(0, floatval($row['stock_on_hand'] ?? 0)),
                    'uom' => trim(strval($row['uom'] ?? ''))
                ];
                $inventoryById[$record['id']] = $record;
                if ($record['code'] !== '') $inventoryByCode[strtoupper($record['code'])] = $record;
            }
        }
    }

    $lines = [];
    $lineKey = function ($code, $description) {
        $normalizedCode = strtoupper(trim(strval($code)));
        if ($normalizedCode !== '') return 'code:' . $normalizedCode;
        return 'description:' . strtoupper(trim(strval($description)));
    };
    $savedRequirements = workOrderPartRequirements($con, $workOrderId);
    $quotation = workOrderQuotation($con, $workOrderId);
    $requirementSource = count($savedRequirements) > 0
        ? $savedRequirements
        : array_values(array_filter(($quotation['items'] ?? []), function ($item) { return ($item['type'] ?? '') === 'part'; }));
    foreach ($requirementSource as $item) {
        $key = $lineKey($item['code'] ?? '', $item['description'] ?? '');
        if (!isset($lines[$key])) {
            $lines[$key] = [
                'partId' => !empty($item['partId']) ? intval($item['partId']) : null,
                'code' => trim(strval($item['code'] ?? '')),
                'description' => trim(strval($item['description'] ?? '')),
                'uom' => trim(strval($item['uom'] ?? '')),
                'requiredQuantity' => 0.0,
                'orderedQuantity' => 0.0,
                'receivedQuantity' => 0.0,
                'purchaseOrders' => []
            ];
        }
        $lines[$key]['requiredQuantity'] += max(0, floatval($item['quantity'] ?? 0));
        if (empty($lines[$key]['partId']) && !empty($item['partId'])) $lines[$key]['partId'] = intval($item['partId']);
    }

    $purchaseOrders = [];
    if (tableExists($con, 'purchase_order') && tableExists($con, 'purchase_order_item')) {
        $poResult = mysqli_query($con, "SELECT id FROM purchase_order WHERE work_order_id = $workOrderId AND status <> 'cancelled' ORDER BY estimated_arrival_date, id");
        while ($poResult && $poRow = mysqli_fetch_assoc($poResult)) {
            $order = purchaseOrderRecord($con, intval($poRow['id']));
            if (!$order) continue;
            $poLabel = $order['autocountPoNo'] ?: $order['internalRef'];
            $purchaseOrders[] = [
                'id' => $order['id'],
                'number' => $poLabel,
                'supplierName' => $order['supplierName'],
                'status' => $order['status'],
                'estimatedArrivalDate' => $order['estimatedArrivalDate'],
                'orderedQuantity' => array_sum(array_map(function ($item) { return floatval($item['quantity'] ?? 0); }, $order['items'])),
                'receivedQuantity' => array_sum(array_map(function ($item) { return floatval($item['receivedQuantity'] ?? 0); }, $order['items']))
            ];
            foreach ($order['items'] as $item) {
                $inventory = !empty($item['partId']) ? ($inventoryById[intval($item['partId'])] ?? null) : null;
                $code = trim(strval($item['itemCode'] ?? '')) ?: trim(strval($inventory['code'] ?? ''));
                $description = trim(strval($item['description'] ?? '')) ?: trim(strval($inventory['description'] ?? ''));
                $key = $lineKey($code, $description);
                if (!isset($lines[$key])) {
                    $lines[$key] = [
                        'partId' => !empty($item['partId']) ? intval($item['partId']) : null,
                        'code' => $code,
                        'description' => $description,
                        'uom' => trim(strval($item['uom'] ?? '')),
                        'requiredQuantity' => 0.0,
                        'orderedQuantity' => 0.0,
                        'receivedQuantity' => 0.0,
                        'purchaseOrders' => []
                    ];
                }
                $lines[$key]['orderedQuantity'] += max(0, floatval($item['quantity'] ?? 0));
                $lines[$key]['receivedQuantity'] += max(0, floatval($item['receivedQuantity'] ?? 0));
                if ($lines[$key]['uom'] === '') $lines[$key]['uom'] = trim(strval($item['uom'] ?? ''));
                $lines[$key]['purchaseOrders'][$poLabel] = true;
            }
        }
    }

    $originalQuoteParts = [];
    if (!empty($quotation['items'])) {
        foreach ($quotation['items'] as $qItem) {
            $qType = trim(strval($qItem['type'] ?? 'part'));
            if ($qType === 'part' || $qType === '') {
                $qKey = $lineKey($qItem['code'] ?? '', $qItem['description'] ?? '');
                $originalQuoteParts[$qKey] = floatval($qItem['quantity'] ?? 0);
            }
        }
    }

    $snapshot = getWorkOrderAcknowledgedPartsSnapshot($con, $workOrderId);
    $hasSnapshot = is_array($snapshot) && count($snapshot) > 0;

    $readyCount = 0;
    $incomingCount = 0;
    $shortageCount = 0;
    $items = [];
    foreach ($lines as $line) {
        $inventory = null;
        if (!empty($line['partId']) && isset($inventoryById[$line['partId']])) {
            $inventory = $inventoryById[$line['partId']];
        } elseif ($line['code'] !== '') {
            $inventory = $inventoryByCode[strtoupper(trim($line['code']))] ?? null;
        }
        $stockOnHand = max(0, floatval($inventory['stockOnHand'] ?? 0));
        $requiredQuantity = max(0, floatval($line['requiredQuantity']));
        if ($requiredQuantity <= 0) $requiredQuantity = max(0, floatval($line['orderedQuantity']));
        $outstandingOrder = max(0, floatval($line['orderedQuantity']) - floatval($line['receivedQuantity']));
        $shortage = max(0, $requiredQuantity - $stockOnHand);
        $projectedStock = $stockOnHand + $outstandingOrder;
        if ($shortage <= 0) {
            $availability = 'ready';
            $readyCount++;
        } elseif ($projectedStock >= $requiredQuantity) {
            $availability = 'incoming';
            $incomingCount++;
        } else {
            $availability = 'shortage';
            $shortageCount++;
        }
        $lineItemKey = $lineKey($line['code'], $line['description']);
        if ($hasSnapshot) {
            $inSnapshot = isset($snapshot[$lineItemKey]);
            $baseQty = $inSnapshot ? floatval($snapshot[$lineItemKey]) : 0.0;
            $isNewlyAdded = !$inSnapshot;
            $isQtyIncreased = $inSnapshot && ($requiredQuantity > $baseQty);
            $originalQuotationQty = $baseQty;
            $inOriginalQuotation = $inSnapshot;
        } else {
            $inOriginalQuotation = isset($originalQuoteParts[$lineItemKey]);
            $originalQuotationQty = $inOriginalQuotation ? floatval($originalQuoteParts[$lineItemKey]) : 0.0;
            $isNewlyAdded = (count($originalQuoteParts) > 0 && !$inOriginalQuotation);
            $isQtyIncreased = ($inOriginalQuotation && $requiredQuantity > $originalQuotationQty);
        }
        $items[] = [
            'inventoryPartId' => $inventory['id'] ?? null,
            'code' => $line['code'],
            'description' => $line['description'] ?: ($inventory['description'] ?? 'Unnamed part'),
            'uom' => $line['uom'] ?: ($inventory['uom'] ?? ''),
            'requiredQuantity' => round($requiredQuantity, 2),
            'stockOnHand' => round($stockOnHand, 2),
            'shortageQuantity' => round($shortage, 2),
            'orderedQuantity' => round(floatval($line['orderedQuantity']), 2),
            'receivedQuantity' => round(floatval($line['receivedQuantity']), 2),
            'outstandingOrderQuantity' => round($outstandingOrder, 2),
            'projectedStock' => round($projectedStock, 2),
            'availability' => $availability,
            'purchaseOrderNumbers' => array_keys($line['purchaseOrders']),
            'isNewlyAdded' => $isNewlyAdded,
            'isQtyIncreased' => $isQtyIncreased,
            'originalQuotationQty' => round($originalQuotationQty, 2),
            'inOriginalQuotation' => $inOriginalQuotation
        ];
    }
    usort($items, function ($left, $right) {
        $rank = ['shortage' => 0, 'incoming' => 1, 'ready' => 2];
        $availabilityOrder = ($rank[$left['availability']] ?? 3) <=> ($rank[$right['availability']] ?? 3);
        return $availabilityOrder !== 0 ? $availabilityOrder : strcmp($left['code'], $right['code']);
    });

    $removedItems = [];
    $baselineMap = $hasSnapshot ? $snapshot : $originalQuoteParts;
    if (is_array($baselineMap) && count($baselineMap) > 0) {
        foreach ($baselineMap as $baseKey => $baseQty) {
            if (!isset($lines[$baseKey]) || floatval($lines[$baseKey]['requiredQuantity'] ?? 0) <= 0) {
                $isCode = strpos($baseKey, 'code:') === 0;
                $rawKey = substr($baseKey, strpos($baseKey, ':') + 1);
                $inventory = null;
                if ($isCode && isset($inventoryByCode[strtoupper($rawKey)])) {
                    $inventory = $inventoryByCode[strtoupper($rawKey)];
                }
                $code = $isCode ? $rawKey : '';
                $description = $inventory['description'] ?? (!$isCode ? $rawKey : ($code ?: 'Removed part'));
                $uom = $inventory['uom'] ?? '';
                $stockOnHand = max(0, floatval($inventory['stockOnHand'] ?? 0));
                $removedItems[] = [
                    'inventoryPartId' => $inventory['id'] ?? null,
                    'code' => $code,
                    'description' => $description,
                    'uom' => $uom,
                    'originalQuantity' => round(floatval($baseQty), 2),
                    'stockOnHand' => round($stockOnHand, 2),
                    'isRemoved' => true
                ];
            }
        }
    }

    return [
        'source' => count($savedRequirements) > 0 ? 'inspection_requirements' : ($quotation ? 'quotation_and_purchase_orders' : 'purchase_orders'),
        'quotationNo' => $quotation['quotationNo'] ?? null,
        'items' => $items,
        'removedItems' => $removedItems,
        'purchaseOrders' => $purchaseOrders,
        'summary' => [
            'totalItems' => count($items),
            'readyItems' => $readyCount,
            'incomingItems' => $incomingCount,
            'shortageItems' => $shortageCount,
            'canStartRepair' => count($items) === 0 || ($incomingCount === 0 && $shortageCount === 0)
        ]
    ];
}



// --- automaticPartsStatusFromOverview ---
function automaticPartsStatusFromOverview($overview) {
    $items = is_array($overview['items'] ?? null) ? $overview['items'] : [];
    if (count($items) === 0) return 'not_required';
    if (!empty($overview['summary']['canStartRepair'])) return 'parts_ready';
    foreach ($items as $item) {
        if (floatval($item['receivedQuantity'] ?? 0) > 0) return 'partially_arrived';
    }
    return 'pending_parts';
}



// --- requireWorkOrderStatusHistorySchema ---
function requireWorkOrderStatusHistorySchema($con) {
    static $prepared = false;
    if ($prepared) return;
    if (tableExists($con, 'work_order_status_history')) {
        $prepared = true;
        return;
    }
    $sql = "CREATE TABLE IF NOT EXISTS `work_order_status_history` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `work_order_id` BIGINT NOT NULL,
        `from_status` VARCHAR(40) NOT NULL,
        `to_status` VARCHAR(40) NOT NULL,
        `action` VARCHAR(30) NOT NULL DEFAULT 'transition',
        `reason` VARCHAR(500) NULL,
        `actor_id` INT NULL,
        `actor_name` VARCHAR(150) NULL,
        `actor_role` VARCHAR(60) NULL,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_work_order_status_history_job` (`work_order_id`, `created_at`),
        KEY `idx_work_order_status_history_action` (`action`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    if (!mysqli_query($con, $sql)) {
        sendResponse(false, 'Unable to prepare work order status history: ' . mysqli_error($con), null, 500);
    }
    $prepared = true;
}



// --- workOrderRollbackTarget ---
function workOrderRollbackTarget($con, $jobRow) {
    $current = deriveCanonicalStatus($jobRow);
    if ($current === 'checked_in') return 'scheduled';
    if ($current === 'inspected') return 'checked_in';
    if ($current === 'quotation_issued') return 'inspected';
    if ($current === 'approved') {
        $quotation = workOrderQuotation($con, intval($jobRow['id'] ?? 0));
        return $quotation && in_array($quotation['status'], ['issued', 'approved'], true) ? 'quotation_issued' : 'inspected';
    }
    if ($current === 'pending_parts') return 'approved';
    if ($current === 'parts_ready') return 'approved';
    if ($current === 'under_repair') {
        $reqs = workOrderPartRequirements($con, intval($jobRow['id'] ?? 0));
        return !empty($reqs) ? 'parts_ready' : 'approved';
    }
    if ($current === 'ready_for_collection') return 'under_repair';
    return null;
}



// --- recordWorkOrderStatusHistory ---
function recordWorkOrderStatusHistory($con, $workOrderId, $fromStatus, $toStatus, $action, $reason = '') {
    requireWorkOrderStatusHistorySchema($con);
    $actorId = intval($_SESSION['admin_id'] ?? 0);
    $actorRole = currentAdminRoleName($con);
    $actorName = trim(strval($_SESSION['admin_name'] ?? $_SESSION['admin_username'] ?? ''));
    if ($actorName === '' && $actorId > 0 && tableExists($con, 'staff')) {
        $columns = staffColumns($con);
        if ($columns['name']) {
            $actorName = strval(scalarQuery($con, "SELECT `{$columns['name']}` AS actor_name FROM staff WHERE id = $actorId LIMIT 1", 'actor_name', ''));
        }
    }
    $fromSql = mysqli_real_escape_string($con, substr($fromStatus, 0, 40));
    $toSql = mysqli_real_escape_string($con, substr($toStatus, 0, 40));
    $actionSql = mysqli_real_escape_string($con, substr($action, 0, 30));
    $reasonSql = mysqli_real_escape_string($con, substr(trim($reason), 0, 500));
    $actorNameSql = mysqli_real_escape_string($con, substr($actorName, 0, 150));
    $actorRoleSql = mysqli_real_escape_string($con, substr($actorRole, 0, 60));
    return mysqli_query($con, "INSERT INTO work_order_status_history (work_order_id, from_status, to_status, action, reason, actor_id, actor_name, actor_role) VALUES (" . intval($workOrderId) . ", '$fromSql', '$toSql', '$actionSql', " . ($reasonSql === '' ? 'NULL' : "'$reasonSql'") . ", " . ($actorId > 0 ? $actorId : 'NULL') . ", " . ($actorNameSql === '' ? 'NULL' : "'$actorNameSql'") . ", '$actorRoleSql')");
}



// --- workOrderRollbackNotifications ---
function workOrderRollbackNotifications($con, $whereSql = '1=1', $limit = 50) {
    requireWorkOrderStatusHistorySchema($con);
    $notifications = [];
    $limit = max(1, min(200, intval($limit)));
    $result = mysqli_query($con, "SELECT history.*, job.work_order_no FROM work_order_status_history history LEFT JOIN job ON job.id = history.work_order_id WHERE history.action = 'rollback' AND ($whereSql) ORDER BY history.id DESC LIMIT $limit");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $fromLabel = ucwords(str_replace('_', ' ', $row['from_status']));
        $toLabel = ucwords(str_replace('_', ' ', $row['to_status']));
        $actor = trim(strval($row['actor_name'] ?? '')) ?: trim(strval($row['actor_role'] ?? 'Manager'));
        $notifications[] = [
            'id' => 'rollback-' . intval($row['id']),
            'workOrderId' => intval($row['work_order_id']),
            'title' => 'Work order status rolled back',
            'message' => ($row['work_order_no'] ?: 'Work order') . " changed from $fromLabel back to $toLabel by $actor. Reason: " . ($row['reason'] ?: 'Correction'),
            'recipient' => 'Workshop Team',
            'type' => 'Warning',
            'status' => 'Active',
            'date' => $row['created_at'],
            'channel' => 'System Audit',
            'actionRoute' => '/work-orders'
        ];
    }
    return $notifications;
}



// --- workOrderPartsUpdateNotifications ---
function workOrderPartsUpdateNotifications($con, $limit = 50) {
    if (!columnExists($con, 'job', 'parts_status_updated_at') || !tableExists($con, 'work_order_part_requirement')) return [];
    $limit = max(1, min(100, intval($limit)));
    $canonicalStatusSql = getCanonicalStatusSql($con, 'j');
    $query = "SELECT j.id, j.work_order_no, j.parts_status, j.parts_status_updated_at, j.parts_status_updated_by,
                     s.name AS updater_name, s.role AS updater_role, v.registration_no AS vehicle_no, c.name AS company_name
              FROM job j
              JOIN work_order_part_requirement r ON r.work_order_id = j.id
              LEFT JOIN staff s ON s.id = j.parts_status_updated_by
              LEFT JOIN vehicle v ON v.id = j.vehicle_id
              LEFT JOIN company c ON c.id = j.company_id
              WHERE j.parts_status_updated_at IS NOT NULL
                AND ($canonicalStatusSql) IN ('approved', 'parts_ready', 'under_repair')
                AND j.parts_status_updated_at > COALESCE(j.parts_acknowledged_at, j.approved_at, '9999-12-31')
                AND ($canonicalStatusSql) <> 'collected'
              GROUP BY j.id
              ORDER BY j.parts_status_updated_at DESC
              LIMIT $limit";
    $result = mysqli_query($con, $query);
    $notifications = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $woNo = $row['work_order_no'] ?: ('WO #' . $row['id']);
        $actor = trim(strval($row['updater_name'] ?? '')) ?: trim(strval($row['updater_role'] ?? 'Manager / Foreman'));
        $vehicle = $row['vehicle_no'] ? " ({$row['vehicle_no']})" : '';
        $isShortage = $row['parts_status'] === 'pending_parts';
        $statusLabel = $row['parts_status'] === 'parts_ready' ? 'Parts Ready' : ($isShortage ? 'Pending Parts (Shortage)' : 'Updated');
        $notifications[] = [
            'id' => 'parts-update-' . intval($row['id']) . '-' . strtotime($row['parts_status_updated_at']),
            'workOrderId' => intval($row['id']),
            'title' => "Parts updated for $woNo$vehicle",
            'message' => "$actor updated required spare parts for $woNo. Status: $statusLabel.",
            'recipient' => 'Workshop & Admin',
            'type' => $isShortage ? 'Warning' : 'Info',
            'status' => 'Active',
            'date' => $row['parts_status_updated_at'],
            'channel' => 'Mid-repair Parts',
            'actionRoute' => '/work-orders'
        ];
    }
    return $notifications;
}

// Inventory and Purchase Order helpers moved to modules/parts.php and modules/purchase_orders.php




function handleWorkOrderRoute($con, $mode, $inputData) {
    switch ($mode) {
        // --- workshop ---
    case 'work-order-photo-file':
        streamWorkOrderPhoto($con, intval($_GET['id'] ?? 0));
        break;

    case 'workshop-work-orders':
        requireWorkOrderPhotoSchema($con);
        $staffId = intval($_SESSION['admin_id'] ?? 0);
        $role = currentAdminRoleName($con);
        $assignmentJobColumn = tableExists($con, 'job_assignment') ? firstColumn($con, 'job_assignment', ['job_id', 'work_order_id']) : null;
        $assignmentStaffColumn = tableExists($con, 'job_assignment') ? firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']) : null;
        $accessWhere = "j.foreman_id = $staffId";
        $notificationAccessWhere = "job.foreman_id = $staffId";
        if ($assignmentJobColumn && $assignmentStaffColumn) {
            $accessWhere .= " OR EXISTS (SELECT 1 FROM job_assignment ja WHERE ja.`$assignmentJobColumn` = j.id AND ja.`$assignmentStaffColumn` = $staffId)";
            $notificationAccessWhere .= " OR EXISTS (SELECT 1 FROM job_assignment ja WHERE ja.`$assignmentJobColumn` = history.work_order_id AND ja.`$assignmentStaffColumn` = $staffId)";
        }
        if (in_array($role, ['Admin', 'Head Manager', 'Foreman'], true)) {
            $accessWhere = '1=1';
            $notificationAccessWhere = '1=1';
        }
        $statusSql = getCanonicalStatusSql($con, 'j');
        $regColumn = firstColumn($con, 'customer_vehicle', ['reg_no', 'registration_no', 'plate_no']);
        $unitColumn = firstColumn($con, 'customer_vehicle', ['vec_no', 'vehicle_no', 'unit_no']);
        $regSelect = $regColumn ? "cv.`$regColumn` AS reg_no" : "'-' AS reg_no";
        $unitSelect = $unitColumn ? "cv.`$unitColumn` AS unit_no" : "'' AS unit_no";
        $result = mysqli_query($con, "SELECT j.*, ($statusSql) AS canonical_status, $regSelect, $unitSelect, comp.name AS company_name FROM job j LEFT JOIN customer_vehicle cv ON cv.id = j.vehicle_id LEFT JOIN company comp ON comp.id = j.company_id WHERE ($accessWhere) AND ($statusSql) <> 'collected' ORDER BY j.id DESC LIMIT 200");
        if (!$result) sendResponse(false, 'Unable to load workshop jobs: ' . mysqli_error($con), null, 500);
        $jobs = [];
        $jobIds = [];
        while ($row = mysqli_fetch_assoc($result)) {
            $jobId = intval($row['id']);
            $jobIds[] = $jobId;
            $jobs[] = [
                'id' => $jobId,
                'workOrderNo' => rowValue($row, ['work_order_no'], 'WO-' . $jobId),
                'status' => $row['canonical_status'],
                'companyName' => $row['company_name'] ?? '-',
                'vehicleId' => intval($row['vehicle_id']),
                'regNo' => $row['reg_no'] ?? '-',
                'unitNo' => $row['unit_no'] ?? '',
                'reportedProblem' => $row['reported_problem'] ?? '',
                'actualIssue' => $row['actual_issue'] ?? '',
                'bay' => $row['bay'] ?? '',
                'priority' => normalizedWorkOrderPriority($row['priority'] ?? 'Normal'),
                'foremanId' => intval($row['foreman_id'] ?? 0),
                'checkinAt' => $row['checkin_at'] ?? null,
                'inspectedAt' => $row['inspected_at'] ?? null,
                'approvedAt' => $row['approved_at'] ?? null,
                'partsReadyAt' => $row['parts_ready_at'] ?? null,
                'underRepairAt' => $row['under_repair_at'] ?? null,
                'completedAt' => $row['completed_at'] ?? null,
                'assignedTechnicianIds' => [],
                'photos' => []
            ];
        }
        $photoMap = workOrderPhotoMap($con, $jobIds, false);
        foreach ($jobs as &$job) $job['photos'] = $photoMap[$job['id']] ?? [];
        unset($job);
        if ($assignmentJobColumn && $assignmentStaffColumn && $jobIds) {
            $assignmentResult = mysqli_query($con, "SELECT `$assignmentJobColumn` AS job_id, `$assignmentStaffColumn` AS staff_id FROM job_assignment WHERE `$assignmentJobColumn` IN (" . implode(',', $jobIds) . ")");
            $assignmentMap = [];
            while ($assignmentResult && $assignment = mysqli_fetch_assoc($assignmentResult)) $assignmentMap[intval($assignment['job_id'])][] = intval($assignment['staff_id']);
            foreach ($jobs as &$job) $job['assignedTechnicianIds'] = $assignmentMap[$job['id']] ?? [];
            unset($job);
        }
        $team = [];
        if (tableExists($con, 'staff')) {
            $columns = staffColumns($con);
            $teamResult = mysqli_query($con, 'SELECT * FROM staff ORDER BY id');
            while ($teamResult && $member = mysqli_fetch_assoc($teamResult)) {
                $memberRole = normalizeStaffRole($columns['role'] ? ($member[$columns['role']] ?? '') : 'Technician');
                $memberStatus = strtolower(trim(strval($columns['status'] ? ($member[$columns['status']] ?? 'Active') : 'Active')));
                if (!in_array($memberRole, ['Technician', 'Foreman', 'Head Manager'], true) || in_array($memberStatus, ['0', 'inactive', 'disabled'], true)) continue;
                $team[] = ['id' => intval($member['id']), 'name' => $member[$columns['name']] ?? ('Staff #' . intval($member['id']))];
            }
        }
        if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        sendResponse(true, 'Workshop jobs retrieved.', [
            'csrfToken' => $_SESSION['csrf_token'],
            'staff' => ['id' => $staffId, 'role' => $role],
            'team' => $team,
            'jobs' => $jobs,
            'notifications' => workOrderRollbackNotifications($con, $notificationAccessWhere, 20)
        ]);
        break;

    case 'workshop-assign-technician':
        $workOrderId = intval($inputData['workOrderId'] ?? 0);
        $technicianId = intval($inputData['technicianId'] ?? 0);
        $staffId = intval($_SESSION['admin_id'] ?? 0);
        $role = currentAdminRoleName($con);
        $canAssign = $role === 'Admin' || $role === 'Head Manager' || countRows($con, 'job', "id = $workOrderId AND foreman_id = $staffId") > 0;
        if (!$canAssign) sendResponse(false, 'Only the assigned foreman or manager can assign the repair person.', null, 403);
        try {
            replaceJobAssignments($con, $workOrderId, $technicianId > 0 ? [$technicianId] : []);
        } catch (Exception $error) {
            sendResponse(false, $error->getMessage(), null, $error->getCode() ?: 500);
        }
        sendResponse(true, 'Assigned repair person updated.', ['workOrderId' => $workOrderId, 'technicianId' => $technicianId]);
        break;

    case 'workshop-upload-photo':
        requireWorkOrderPhotoSchema($con);
        $workOrderId = intval($inputData['workOrderId'] ?? 0);
        if (!workshopCanAccessWorkOrder($con, $workOrderId, true)) {
            sendResponse(false, 'This work order is not assigned to you.', null, 403);
        }
        $upload = $_FILES['photo'] ?? null;
        if ($upload && in_array(intval($upload['error'] ?? UPLOAD_ERR_NO_FILE), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            sendResponse(false, 'Photo exceeds the server upload limit of 12 MB.', null, 422);
        }
        if (!$upload || !isset($upload['error']) || intval($upload['error']) !== UPLOAD_ERR_OK) {
            sendResponse(false, 'Choose a photo to upload.', null, 422);
        }
        $maxBytes = 12 * 1024 * 1024;
        if (intval($upload['size']) <= 0 || intval($upload['size']) > $maxBytes) {
            sendResponse(false, 'Photo must be smaller than 12 MB.', null, 422);
        }
        
        $mime = '';
        if (class_exists('finfo')) {
            try {
                $finfo = new finfo(FILEINFO_MIME_TYPE);
                $mime = $finfo->file($upload['tmp_name']);
            } catch (Throwable $e) {
                $mime = '';
            }
        }
        if (!$mime && function_exists('mime_content_type')) {
            $mime = @mime_content_type($upload['tmp_name']);
        }
        if (!$mime && function_exists('getimagesize')) {
            $imageInfo = @getimagesize($upload['tmp_name']);
            if (!empty($imageInfo['mime'])) {
                $mime = $imageInfo['mime'];
            }
        }
        if (!$mime) {
            $mime = $upload['type'] ?? '';
        }
        if (!$mime) {
            $ext = strtolower(pathinfo($upload['name'] ?? '', PATHINFO_EXTENSION));
            $extMap = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'heic' => 'image/heic', 'heif' => 'image/heif'];
            $mime = $extMap[$ext] ?? 'image/jpeg';
        }

        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/heic' => 'heic',
            'image/heif' => 'heif',
            'application/pdf' => 'pdf'
        ];
        if (!isset($extensions[$mime])) {
            $origExt = strtolower(pathinfo($upload['name'] ?? '', PATHINFO_EXTENSION));
            if (in_array($origExt, ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'], true)) {
                $extToMime = [
                    'jpg' => 'image/jpeg',
                    'jpeg' => 'image/jpeg',
                    'png' => 'image/png',
                    'webp' => 'image/webp',
                    'heic' => 'image/heic',
                    'heif' => 'image/heif',
                    'pdf' => 'application/pdf'
                ];
                $mime = $extToMime[$origExt];
            } else {
                sendResponse(false, 'Upload a JPEG, PNG, WebP, HEIC, HEIF image or PDF document.', null, 422);
            }
        }
        $category = strtolower(trim(strval($inputData['category'] ?? 'repair')));
        if (!in_array($category, ['check_in', 'inspection', 'repair', 'parts', 'completion'], true)) $category = 'repair';
        $caption = trim(strval($inputData['caption'] ?? ''));
        if (strlen($caption) > 500) sendResponse(false, 'Photo note must not exceed 500 characters.', null, 422);
        
        $datePath = date('Y/m');
        $storageRoot = getWorkOrderPhotoStorageRoot(true);
        $destinationDir = $storageRoot . '/' . $datePath;
        if (!is_dir($destinationDir)) {
            @mkdir($destinationDir, 0755, true);
        }
        if (!is_dir($destinationDir)) {
            sendResponse(false, 'Unable to prepare photo storage directory on server.', null, 500);
        }
        $ext = $extensions[$mime] ?? 'jpg';
        $fileName = bin2hex(random_bytes(16)) . '.' . $ext;
        $relativePath = $datePath . '/' . $fileName;
        $destination = $storageRoot . '/' . $relativePath;
        if (!@move_uploaded_file($upload['tmp_name'], $destination)) {
            if (!@copy($upload['tmp_name'], $destination)) {
                sendResponse(false, 'Unable to save the uploaded photo.', null, 500);
            }
            @unlink($upload['tmp_name']);
        }
        @chmod($destination, 0644);
        $categorySql = mysqli_real_escape_string($con, $category);
        $captionSql = mysqli_real_escape_string($con, $caption);
        $pathSql = mysqli_real_escape_string($con, $relativePath);
        $nameSql = mysqli_real_escape_string($con, basename(strval($upload['name'])));
        $mimeSql = mysqli_real_escape_string($con, $mime);
        $staffId = intval($_SESSION['admin_id'] ?? 0);
        $customerVisible = !isset($inputData['customerVisible']) || filter_var($inputData['customerVisible'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        $takenAtInput = trim(strval($inputData['takenAt'] ?? ''));
        $takenAtSql = $takenAtInput !== '' && strtotime($takenAtInput) !== false
            ? "'" . mysqli_real_escape_string($con, date('Y-m-d H:i:s', strtotime($takenAtInput))) . "'"
            : 'NULL';
        $byteSize = intval($upload['size']);
        if (!mysqli_query($con, "INSERT INTO work_order_photo (work_order_id, category, caption, storage_path, original_name, mime_type, byte_size, uploaded_by_staff_id, customer_visible, taken_at) VALUES ($workOrderId, '$categorySql', '$captionSql', '$pathSql', '$nameSql', '$mimeSql', $byteSize, $staffId, $customerVisible, $takenAtSql)")) {
            @unlink($destination);
            sendResponse(false, 'Unable to record the uploaded photo: ' . mysqli_error($con), null, 500);
        }
        $photoId = mysqli_insert_id($con);
        $staffNameColumn = tableExists($con, 'staff')
            ? firstColumn($con, 'staff', ['name', 'staff_name', 'full_name', 'username'])
            : null;
        $staffSelect = $staffNameColumn ? "s.`$staffNameColumn` AS uploaded_by" : "'Workshop team' AS uploaded_by";
        $staffJoin = $staffNameColumn ? 'LEFT JOIN staff s ON s.id = p.uploaded_by_staff_id' : '';
        $photoResult = mysqli_query($con, "SELECT p.*, $staffSelect FROM work_order_photo p $staffJoin WHERE p.id = $photoId LIMIT 1");
        if (!$photoResult) sendResponse(false, 'Photo was saved, but its record could not be reloaded: ' . mysqli_error($con), null, 500);
        
        if ($customerVisible) {
            try {
                $woJobResult = mysqli_query($con, "SELECT work_order_no, source_booking_id, customer_id, company_id, vehicle_id FROM job WHERE id = $workOrderId LIMIT 1");
                $woRow = $woJobResult ? mysqli_fetch_assoc($woJobResult) : null;
                if ($woRow) {
                    $woNo = $woRow['work_order_no'] ?: 'WO-' . $workOrderId;
                    $srcBookingId = intval($woRow['source_booking_id'] ?? 0);
                    $noteSnippet = $caption ? ": $caption" : '';
                    if ($srcBookingId > 0) {
                        $target = bookingNotificationTarget($con, $srcBookingId);
                        if ($target && $target['contactId'] > 0) {
                            createCustomerRecordNotification(
                                $con,
                                $target['source'],
                                $target['companyId'],
                                $target['contactId'],
                                'New repair photo added',
                                "New photo uploaded for $woNo$noteSnippet.",
                                'work_order',
                                'work_order',
                                'wo' . $workOrderId,
                                '/repair-progress/wo' . $workOrderId
                            );
                        }
                    } else {
                        $cId = intval($woRow['customer_id'] ?? 0);
                        if ($cId > 0) {
                            notifyVehicleCustomer(
                                $con,
                                intval($woRow['vehicle_id'] ?? 0),
                                tableExists($con, 'customer') ? 'customer' : 'users',
                                intval($woRow['company_id'] ?? 0),
                                $cId,
                                'New repair photo added',
                                "New photo uploaded for $woNo$noteSnippet.",
                                'work_order',
                                'work_order',
                                'wo' . $workOrderId,
                                '/repair-progress/wo' . $workOrderId
                            );
                        }
                    }
                }
            } catch (Throwable $e) {
                error_log("Failed to send customer photo notification: " . $e->getMessage());
            }
        }
        
        sendResponse(true, 'Photo uploaded.', workOrderPhotoPayload(mysqli_fetch_assoc($photoResult)), 201);
        break;


        // --- customer bookings ---
    case 'customer-create-booking':
        $auth = requireCustomerSession();
        $user = customerUserPayload($con, $auth);
        if (empty($user['permissions']['canCreateBooking'])) {
            sendResponse(false, 'You are not authorised to create bookings.', null, 403);
        }
        $vehicleId = intval(preg_replace('/\D+/', '', strval($inputData['vehicleId'] ?? '')));
        $serviceType = trim($inputData['serviceType'] ?? '');
        $serviceDate = trim($inputData['serviceDate'] ?? '');
        $serviceCentre = trim($inputData['serviceCentre'] ?? '');
        if ($vehicleId <= 0 || $serviceType === '' || $serviceDate === '' || $serviceCentre === '') {
            sendResponse(false, 'Vehicle, service, date, time and location are required.', null, 422);
        }
        $vehicleTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
        $companyId = intval($auth['companyId']);
        $vehicleScope = customerVehicleAccessScope($con, $auth);
        $vehicleWhere = !empty($auth['isSuperadmin'])
            ? "id = $vehicleId"
            : "id = $vehicleId AND company_id = $companyId";
        if ($vehicleScope['scoped']) $vehicleWhere .= customerScopedVehicleSql($vehicleScope, 'id');
        $vehicleResult = mysqli_query(
            $con,
            "SELECT * FROM `$vehicleTable` WHERE $vehicleWhere LIMIT 1"
        );
        if (!$vehicleResult || mysqli_num_rows($vehicleResult) === 0) {
            sendResponse(false, 'Vehicle not found or not accessible.', null, 404);
        }
        $selectedVehicle = mysqli_fetch_assoc($vehicleResult);
        $verificationStatus = strtolower(rowValue(
            $selectedVehicle,
            ['verification_status'],
            rowValue($selectedVehicle, ['status'], '') === 'Pending Verification' ? 'pending' : 'approved'
        ));
        if ($verificationStatus !== 'approved') {
            sendResponse(
                false,
                $verificationStatus === 'rejected'
                    ? 'This vehicle was rejected. Please update its details or contact support.'
                    : 'This vehicle is pending admin verification and cannot be booked yet.',
                null,
                409
            );
        }
        $complianceError = vehicleBookingComplianceError($con, $vehicleId, $selectedVehicle);
        if ($complianceError !== '') {
            sendResponse(false, $complianceError, null, 409);
        }
        if (!empty($auth['isSuperadmin'])) {
            $companyId = intval($selectedVehicle['company_id'] ?? 0);
        }
        $serviceDateTime = parseMalaysiaBookingDateTime($serviceDate);
        if (!$serviceDateTime) {
            sendResponse(false, 'Please select a valid booking date and time.', null, 422);
        }
        if ($serviceDateTime->getTimestamp() <= time()) {
            sendResponse(false, 'Booking date must be in the future.', null, 422);
        }
        $requestedContactId = intval(preg_replace('/\D+/', '', strval($inputData['contactId'] ?? '')));
        $bookingCustomerId = $requestedContactId > 0
            ? unifiedVehicleContact($con, $vehicleTable, $companyId, $requestedContactId, false)
            : intval($auth['userId']);
        if (empty($auth['isSuperadmin']) && $bookingCustomerId <= 0) {
            sendResponse(false, 'The selected contact does not belong to your company.', null, 422);
        }
        if (!empty($auth['isSuperadmin'])) {
            $customerTable = tableExists($con, 'customer') ? 'customer' : 'users';
            $customerResult = mysqli_query(
                $con,
                "SELECT id FROM `$customerTable` WHERE company_id = $companyId ORDER BY id LIMIT 1"
            );
            $customerRow = $customerResult ? mysqli_fetch_assoc($customerResult) : null;
            $bookingCustomerId = intval($customerRow['id'] ?? 0);
            if ($bookingCustomerId <= 0) {
                sendResponse(false, 'The selected vehicle company has no customer contact.', null, 409);
            }
        }
        $serviceId = intval($inputData['serviceId'] ?? 0);
        if ($serviceId <= 0) {
            $rawServiceType = strtolower(trim($inputData['serviceType'] ?? ''));
            if (strpos($rawServiceType, 'maintenance') !== false || strpos($rawServiceType, '保养') !== false) {
                $serviceId = 1;
            } elseif (strpos($rawServiceType, 'repair') !== false || strpos($rawServiceType, '维修') !== false) {
                $serviceId = 2;
            } elseif (strpos($rawServiceType, 'part') !== false || strpos($rawServiceType, '配件') !== false) {
                $serviceId = 3;
            } else {
                $serviceId = 1;
            }
        }
        $bookingMileage = intval(preg_replace('/\D+/', '', strval($inputData['mileage'] ?? '')));
        $customerNotes = trim($inputData['notes'] ?? '');
        if ($bookingMileage > 0) {
            $mileageText = 'Reported Mileage: ' . number_format($bookingMileage) . ' km';
            if (stripos($customerNotes, 'mileage') === false) {
                $customerNotes = $customerNotes !== '' ? "$customerNotes | $mileageText" : $mileageText;
            }
            // Update vehicle current mileage if customer reported a higher value
            $curVehRes = mysqli_query($con, "SELECT mileage FROM `$vehicleTable` WHERE id = $vehicleId LIMIT 1");
            if ($curVehRes && $curRow = mysqli_fetch_assoc($curVehRes)) {
                $existingMileage = intval($curRow['mileage'] ?? 0);
                if ($bookingMileage > $existingMileage) {
                    mysqli_query($con, "UPDATE `$vehicleTable` SET mileage = $bookingMileage WHERE id = $vehicleId");
                }
            }
        }

        $data = [
            'vehicleId' => $vehicleId,
            'customerId' => $bookingCustomerId,
            'companyId' => $companyId,
            'serviceId' => $serviceId,
            'createdByCompanyUserId' => intval($auth['userId']),
            'service' => $serviceType,
            'date' => $serviceDateTime->format('Y-m-d'),
            'time' => $serviceDateTime->format('H:i:s'),
            'location' => $serviceCentre,
            'status' => 'pending',
            'customerNotes' => $customerNotes,
            'reportedProblem' => trim($inputData['reportedProblem'] ?? ''),
            'technicianNotes' => ''
        ];
        if (!saveAdminBooking($con, $data)) {
            $dbErr = mysqli_error($con);
            error_log('Customer booking insert failed: ' . $dbErr);
            sendResponse(false, 'Unable to create booking' . ($dbErr ? ': ' . $dbErr : '.'), null, 500);
        }
        $newBookingId = mysqli_insert_id($con);
        $bookingTable = tableExists($con, 'customer_appointment') ? 'customer_appointment' : 'bookings';
        $numberColumn = firstColumn($con, $bookingTable, ['appointment_no', 'booking_number', 'booking_no']);
        $bookingNumber = 'BK-' . $newBookingId;
        if ($numberColumn && $newBookingId > 0) {
            $numberResult = mysqli_query($con, "SELECT `$numberColumn` AS number_value FROM `$bookingTable` WHERE id = $newBookingId LIMIT 1");
            $numberRow = $numberResult ? mysqli_fetch_assoc($numberResult) : null;
            $bookingNumber = $numberRow['number_value'] ?? $bookingNumber;
        }
        createCustomerRecordNotification(
            $con,
            $auth['source'],
            $companyId,
            $bookingCustomerId,
            'Booking received',
            "$bookingNumber has been submitted and is awaiting confirmation.",
            'booking',
            'booking',
            'b' . $newBookingId,
            '/booking/b' . $newBookingId
        );
        sendResponse(true, 'Booking submitted.', [
            'id' => 'b' . $newBookingId,
            'bookingNumber' => $bookingNumber,
            'orderType' => 'service',
            'vehicleId' => 'v' . $vehicleId,
            'serviceType' => $serviceType,
            'serviceDate' => $serviceDateTime->format('Y-m-d\TH:i:sP'),
            'serviceCentre' => $serviceCentre,
            'status' => 'pending',
            'totalPrice' => 0,
            'notes' => trim($inputData['notes'] ?? ''),
            'reportedProblem' => trim($inputData['reportedProblem'] ?? '')
        ], 201);
        break;

    case 'customer-cancel-booking':
        $auth = requireCustomerSession();
        $user = customerUserPayload($con, $auth);
        if (empty($user['permissions']['canCancelBooking'])) {
            sendResponse(false, 'You are not authorised to cancel bookings.', null, 403);
        }
        $rawId = trim(strval($inputData['id'] ?? $inputData['bookingId'] ?? ''));
        $sourceId = intval(preg_replace('/\D+/', '', $rawId));
        if ($sourceId <= 0) {
            sendResponse(false, 'Valid booking ID is required.', null, 422);
        }
        $companyId = intval($auth['companyId']);
        $isSuperadmin = !empty($auth['isSuperadmin']);
        $isParts = strpos($rawId, 'p') === 0;

        if ($isParts && tableExists($con, 'parts_orders')) {
            $orderWhere = $isSuperadmin ? "id = $sourceId" : "id = $sourceId AND company_id = $companyId";
            $orderRes = mysqli_query($con, "SELECT * FROM parts_orders WHERE $orderWhere LIMIT 1");
            $orderRow = $orderRes ? mysqli_fetch_assoc($orderRes) : null;
            if (!$orderRow) {
                sendResponse(false, 'Parts order not found.', null, 404);
            }
            $currentStatus = strtolower(strval($orderRow['status'] ?? 'pending'));
            if ($currentStatus === 'cancelled') {
                sendResponse(true, 'Parts order is already cancelled.', ['id' => $rawId, 'status' => 'cancelled']);
            }
            if (in_array($currentStatus, ['shipped', 'delivered', 'completed'], true)) {
                sendResponse(false, 'This order has already been processed and cannot be cancelled.', null, 409);
            }
            mysqli_query($con, "UPDATE parts_orders SET status = 'cancelled' WHERE id = $sourceId");
            sendResponse(true, 'Parts order has been cancelled.', ['id' => $rawId, 'status' => 'cancelled']);
        }

        $bookingTable = tableExists($con, 'customer_appointment') ? 'customer_appointment' : 'bookings';
        if (!tableExists($con, $bookingTable)) {
            sendResponse(false, 'Booking storage is unavailable.', null, 500);
        }

        $bookingWhere = $isSuperadmin ? "id = $sourceId" : "id = $sourceId";
        if (!$isSuperadmin && columnExists($con, $bookingTable, 'company_id')) {
            $bookingWhere .= " AND company_id = $companyId";
        }
        $bRes = mysqli_query($con, "SELECT * FROM `$bookingTable` WHERE $bookingWhere LIMIT 1");
        $bRow = $bRes ? mysqli_fetch_assoc($bRes) : null;
        if (!$bRow && !$isSuperadmin && tableExists($con, 'customer') && columnExists($con, $bookingTable, 'customer_id')) {
            $bRes = mysqli_query(
                $con,
                "SELECT a.* FROM `$bookingTable` a JOIN customer c ON a.customer_id = c.id WHERE a.id = $sourceId AND c.company_id = $companyId LIMIT 1"
            );
            $bRow = $bRes ? mysqli_fetch_assoc($bRes) : null;
        }
        if (!$bRow) {
            sendResponse(false, 'Booking not found or not accessible.', null, 404);
        }

        $rawStatus = strtolower(str_replace(' ', '_', rowValue($bRow, ['status'], 'pending')));
        if ($rawStatus === 'cancelled') {
            sendResponse(true, 'Booking is already cancelled.', ['id' => 'b' . $sourceId, 'status' => 'cancelled']);
        }

        if (tableExists($con, 'job') && columnExists($con, 'job', 'source_booking_id')) {
            $jobRes = mysqli_query($con, "SELECT * FROM job WHERE source_booking_id = $sourceId LIMIT 1");
            $jobRow = $jobRes ? mysqli_fetch_assoc($jobRes) : null;
            if ($jobRow) {
                $jobStatus = deriveCanonicalStatus($jobRow);
                if (in_array($jobStatus, ['in_progress', 'ready_for_pickup', 'completed', 'collected'], true)) {
                    sendResponse(false, 'This booking is currently in progress at the workshop and cannot be cancelled.', null, 409);
                }
                mysqli_query($con, "UPDATE job SET status = 'cancelled' WHERE source_booking_id = $sourceId");
            }
        }

        mysqli_query($con, "UPDATE `$bookingTable` SET status = 'cancelled' WHERE id = $sourceId");
        if (tableExists($con, 'bookings') && $bookingTable !== 'bookings') {
            mysqli_query($con, "UPDATE bookings SET status = 'cancelled' WHERE id = $sourceId");
        }

        $bookingNumber = rowValue($bRow, ['appointment_no', 'booking_number', 'booking_no'], 'BK-' . $sourceId);
        $contactId = intval(rowValue($bRow, ['customer_id', 'user_id', 'contact_id'], $auth['userId']));
        createCustomerRecordNotification(
            $con,
            $auth['source'],
            $companyId,
            $contactId,
            'Booking cancelled',
            "$bookingNumber has been cancelled.",
            'booking',
            'booking',
            'b' . $sourceId,
            '/bookings'
        );

        sendResponse(true, 'Booking has been cancelled.', [
            'id' => 'b' . $sourceId,
            'bookingNumber' => $bookingNumber,
            'status' => 'cancelled'
        ]);
        break;



        // --- admin bookings ---
    case 'admin-bookings':
        $legacyBookings = legacyBookings($con);
        if ($legacyBookings !== null) {
            sendResponse(true, 'Admin bookings retrieved', $legacyBookings);
        }

        $bookings = [];
        $query = "SELECT b.*, u.name AS customer_name, u.company_id AS user_company_id,
                         v.reg_no, v.brand, v.model, v.equipment, v.company_id AS vehicle_company_id,
                         c1.name AS user_company_name, c2.name AS vehicle_company_name
                  FROM bookings b
                  JOIN users u ON b.user_id = u.id
                  LEFT JOIN vehicles v ON b.vehicle_id = v.id
                  LEFT JOIN company c1 ON u.company_id = c1.id
                  LEFT JOIN company c2 ON v.company_id = c2.id
                  WHERE b.order_type = 'service'
                  ORDER BY b.service_date DESC";
        $result = mysqli_query($con, $query);
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $compId = intval($row['vehicle_company_id'] ?: ($row['user_company_id'] ?: 0));
            $compName = $row['vehicle_company_name'] ?: ($row['user_company_name'] ?: '-');
            $dateTime = strtotime($row['service_date']);
            $bookings[] = [
                'id' => $row['booking_number'],
                'idVal' => intval($row['id']),
                'customerId' => intval($row['user_id']),
                'customer' => $row['customer_name'],
                'companyId' => $compId,
                'companyName' => $compName,
                'vehicleId' => intval($row['vehicle_id']),
                'vehicle' => trim(($row['reg_no'] ?? '-') . ' - ' . ($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')),
                'service' => $row['service_type'],
                'date' => date('Y-m-d', $dateTime),
                'time' => date('H:i', $dateTime),
                'location' => $row['service_centre'],
                'status' => toAdminBookingStatus($row['status']),
                'technician' => $row['technician'] ?: '-',
                'staffId' => intval(rowValue($row, ['staff_id', 'technician_id', 'assigned_staff_id'], 0)),
                'customerNotes' => $row['notes'] ?: '',
                'reportedProblem' => $row['reported_problem'] ?? '',
                'technicianNotes' => $row['mechanic_notes'] ?: ''
            ];
        }
        sendResponse(true, 'Admin bookings retrieved', $bookings);
        break;

    case 'admin-pending-bookings-alert':
        $pendingCount = pendingAdminBookingCount($con);
        sendResponse(true, 'Pending booking count retrieved', [
            'hasPendingBookings' => $pendingCount > 0,
            'count' => $pendingCount
        ]);
        break;

    case 'admin-create-booking':
        $data = $inputData;
        if (saveAdminBooking($con, $data)) {
            $createdBookingId = mysqli_insert_id($con);
            if ($createdBookingId > 0) {
                notifyBookingCustomer(
                    $con,
                    $createdBookingId,
                    'Booking created',
                    '{booking} has been created for you.'
                );
            }
            sendResponse(true, 'Booking created successfully', null);
        }
        sendResponse(false, 'Failed to create booking: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-update-booking':
        $data = $inputData;
        $id = $data['id'] ?? null;
        if (!$id) {
            sendResponse(false, 'Missing booking id', null, 400);
        }
        if (!empty($data['statusOnly'])) {
            if (updateAdminBookingStatus($con, $id, $data['status'] ?? '')) {
                $statusLabel = normalizedBookingLifecycleStatus($data['status'] ?? '');
                $title = $statusLabel === 'cancelled' ? 'Booking cancelled' : 'Booking confirmed';
                notifyBookingCustomer(
                    $con,
                    $id,
                    $title,
                    '{booking} is now ' . ucfirst(str_replace('_', ' ', $statusLabel)) . '.'
                );
                sendResponse(true, 'Booking status updated successfully', null);
            }
            sendResponse(false, 'Failed to update booking status: ' . mysqli_error($con), null, 500);
        }
        $beforeSchedule = adminBookingScheduleSnapshot($con, $id);
        if (saveAdminBooking($con, $data, $id)) {
            $afterSchedule = adminBookingScheduleSnapshot($con, $id);
            $timeChanged = $beforeSchedule && $afterSchedule && $beforeSchedule['minuteKey'] !== $afterSchedule['minuteKey'];
            if ($timeChanged) {
                $notificationSent = notifyBookingCustomer(
                    $con,
                    $id,
                    'Booking time changed',
                    bookingScheduleChangeMessage($beforeSchedule, $afterSchedule)
                );
            } else {
                $notificationSent = notifyBookingCustomer(
                    $con,
                    $id,
                    'Booking updated',
                    'The details for {booking} have been updated.'
                );
            }
            sendResponse(true, 'Booking updated successfully', [
                'timeChanged' => boolval($timeChanged),
                'notificationSent' => boolval($notificationSent),
                'previousSchedule' => $timeChanged ? $beforeSchedule['minuteKey'] : null,
                'newSchedule' => $timeChanged ? $afterSchedule['minuteKey'] : null
            ]);
        }
        sendResponse(false, 'Failed to update booking: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-check-in-booking':
        $bookingId = $inputData['id'] ?? null;
        if (!$bookingId) {
            sendResponse(false, 'Missing booking id.', null, 400);
        }
        $workOrder = checkInBookingAndCreateWorkOrder($con, $bookingId, $inputData);
        notifyBookingCustomer(
            $con,
            $bookingId,
            'Vehicle checked in',
            'Your vehicle for {booking} has been checked in. Work order ' .
                ($workOrder['workOrderNo'] ?? '') . ' is now active.'
        );
        sendResponse(true, 'Vehicle checked in and work order created.', $workOrder, 201);
        break;

    case 'admin-delete-booking':
        $data = $inputData;
        $id = $data['id'] ?? null;
        if (!$id) {
            sendResponse(false, 'Missing booking id', null, 400);
        }
        if (deleteAdminBooking($con, $id)) {
            sendResponse(true, 'Booking deleted successfully', null);
        }
        sendResponse(false, 'Failed to delete booking: ' . mysqli_error($con), null, 500);
        break;



        // --- admin work orders 1 ---
    case 'admin-work-orders':
        ensureColumn($con, 'job', 'is_back_order', 'TINYINT(1) NOT NULL DEFAULT 0');
        $canonicalStatus = mysqli_real_escape_string($con, $inputData['canonicalStatus'] ?? '');
        $recordScope = strtolower(trim(strval($inputData['recordScope'] ?? 'all')));
        if (!in_array($recordScope, ['all', 'active', 'history'], true)) {
            sendResponse(false, 'Invalid work order record scope.', null, 400);
        }
        $historyDateFrom = trim(strval($inputData['historyDateFrom'] ?? ''));
        $historyDateTo = trim(strval($inputData['historyDateTo'] ?? ''));
        foreach ([$historyDateFrom, $historyDateTo] as $historyDate) {
            if ($historyDate !== '') {
                $parsedHistoryDate = DateTime::createFromFormat('!Y-m-d', $historyDate);
                if (!$parsedHistoryDate || $parsedHistoryDate->format('Y-m-d') !== $historyDate) {
                    sendResponse(false, 'Invalid history date filter.', null, 400);
                }
            }
        }
        if ($historyDateFrom !== '' && $historyDateTo !== '' && $historyDateFrom > $historyDateTo) {
            sendResponse(false, 'History start date cannot be after the end date.', null, 400);
        }
        $companyId = intval($inputData['companyId'] ?? 0);
        $vehicleId = intval($inputData['vehicleId'] ?? 0);
        $searchTerm = mysqli_real_escape_string($con, trim($inputData['searchTerm'] ?? ''));
        $vehicleRegColumn = firstColumn($con, 'customer_vehicle', ['reg_no', 'registration_no', 'plate_no']);
        $vehicleUnitColumn = firstColumn($con, 'customer_vehicle', ['vec_no', 'vehicle_no', 'unit_no']);
        $vehicleBrandColumn = firstColumn($con, 'customer_vehicle', ['brand', 'make', 'manufacturer']);
        $vehicleModelColumn = firstColumn($con, 'customer_vehicle', ['model', 'series']);
        $vehicleEquipmentColumn = firstColumn($con, 'customer_vehicle', ['equipment', 'vehicle_type', 'type']);
        
        $page = intval($inputData['page'] ?? 1);
        if ($page < 1) $page = 1;
        $limit = intval($inputData['limit'] ?? 20);
        if ($limit < 1) $limit = 20;
        if ($limit > 100) $limit = 100;
        
        $whereClause = "1=1";
        $statusSql = getCanonicalStatusSql($con, 'j');

        $currentRole = currentAdminRoleName($con);
        if ($currentRole === 'Foreman') {
            $whereClause .= " AND ($statusSql) <> 'collected'";
        } elseif ($currentRole === 'Technician') {
            $signedInStaffId = intval($_SESSION['admin_id'] ?? 0);
            $assignmentJobColumn = firstColumn($con, 'job_assignment', ['job_id', 'work_order_id']);
            $assignmentStaffColumn = firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']);
            if (
                $signedInStaffId <= 0 ||
                !tableExists($con, 'job_assignment') ||
                !$assignmentJobColumn ||
                !$assignmentStaffColumn
            ) {
                $whereClause .= " AND 1=0";
            } else {
                $whereClause .= " AND EXISTS (
                    SELECT 1 FROM job_assignment role_assignment
                    WHERE role_assignment.`$assignmentJobColumn` = j.id
                      AND role_assignment.`$assignmentStaffColumn` = $signedInStaffId
                )";
            }
        }
        
        if ($recordScope === 'active') {
            $whereClause .= " AND ($statusSql) <> 'collected'";
        } elseif ($recordScope === 'history') {
            $whereClause .= " AND ($statusSql) = 'collected'";
            if ($historyDateFrom !== '') {
                $from = mysqli_real_escape_string($con, $historyDateFrom);
                $whereClause .= " AND DATE(COALESCE(j.collected_at, j.completed_at)) >= '$from'";
            }
            if ($historyDateTo !== '') {
                $to = mysqli_real_escape_string($con, $historyDateTo);
                $whereClause .= " AND DATE(COALESCE(j.collected_at, j.completed_at)) <= '$to'";
            }
        }
        if ($companyId > 0) {
            $whereClause .= " AND j.company_id = $companyId";
        }
        if ($vehicleId > 0) {
            $whereClause .= " AND j.vehicle_id = $vehicleId";
        }
        if ($searchTerm !== '') {
            $searchColumns = ["j.work_order_no LIKE '%$searchTerm%'"];
            if ($vehicleRegColumn) {
                $searchColumns[] = "cv.`$vehicleRegColumn` LIKE '%$searchTerm%'";
            }
            if ($vehicleUnitColumn) {
                $searchColumns[] = "cv.`$vehicleUnitColumn` LIKE '%$searchTerm%'";
            }
            $whereClause .= " AND (" . implode(' OR ', $searchColumns) . ")";
        }

        $baseWhereClause = $whereClause;
        $needsVehicleJoin = ($searchTerm !== '');
        $vehicleJoinClause = $needsVehicleJoin ? "LEFT JOIN customer_vehicle cv ON j.vehicle_id = cv.id" : "";

        $statusCounts = [];
        $scRes = mysqli_query($con, "SELECT ($statusSql) AS c_status, COUNT(j.id) AS cnt FROM job j $vehicleJoinClause WHERE $baseWhereClause GROUP BY ($statusSql)");
        $allInScope = 0;
        while ($scRes && $scRow = mysqli_fetch_assoc($scRes)) {
            $st = strval($scRow['c_status'] ?? '');
            $cnt = intval($scRow['cnt'] ?? 0);
            if ($st !== '') {
                $statusCounts[$st] = $cnt;
                $allInScope += $cnt;
            }
        }
        $statusCounts['all'] = $allInScope;

        if ($canonicalStatus) {
            $whereClause .= " AND ($statusSql) = '$canonicalStatus'";
        }
        
        $countQuery = "SELECT COUNT(j.id) AS total 
                       FROM job j
                       $vehicleJoinClause 
                       WHERE $whereClause";
        $total = intval(scalarQuery($con, $countQuery, 'total', 0));
        
        $totalPages = ceil($total / $limit);
        $offset = ($page - 1) * $limit;
        
        $vehicleUnitSql = $vehicleUnitColumn ? "NULLIF(TRIM(cv.`$vehicleUnitColumn`), '')" : "NULL";
        $vehicleRegSql = $vehicleRegColumn ? "NULLIF(TRIM(cv.`$vehicleRegColumn`), '')" : "NULL";
        $vehicleRegSelect = "COALESCE($vehicleUnitSql, $vehicleRegSql, '-') AS vehicle_no";
        $vehicleUnitSelect = $vehicleUnitSql ? "$vehicleUnitSql AS unit_no" : "'' AS unit_no";
        $vehiclePlateSelect = $vehicleRegSql ? "$vehicleRegSql AS reg_no" : "'' AS reg_no";
        $vehicleBrandSelect = $vehicleBrandColumn
            ? "cv.`$vehicleBrandColumn` AS brand"
            : "'-' AS brand";
        $vehicleModelSelect = $vehicleModelColumn
            ? "cv.`$vehicleModelColumn` AS model"
            : "'-' AS model";
        $vehicleEquipmentSelect = $vehicleEquipmentColumn
            ? "cv.`$vehicleEquipmentColumn` AS equipment_type"
            : "'-' AS equipment_type";
        $customerTypeColumn = firstColumn($con, 'customer', ['type', 'contact_type', 'role']);
        $customerTypeSelect = $customerTypeColumn
            ? "cust.`$customerTypeColumn` AS contact_type"
            : "'Unclassified' AS contact_type";
        $customerPhoneColumn = firstColumn($con, 'customer', ['phone', 'phone_no', 'mobile']);
        $customerPhoneSelect = $customerPhoneColumn
            ? "cust.`$customerPhoneColumn` AS customer_phone"
            : "'' AS customer_phone";
        $priorityOrder = "CASE LOWER(TRIM(COALESCE(j.priority, 'Normal')))
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            ELSE 3
        END ASC";
        $orderBy = $recordScope === 'history'
            ? "COALESCE(j.collected_at, j.completed_at, j.checkin_at) DESC, j.id DESC"
            : "$priorityOrder, j.id DESC";
        $driverSelect = tableExists($con, 'company_driver')
            ? 'driver.name AS brought_by_driver_name'
            : "'' AS brought_by_driver_name";
        $driverJoin = tableExists($con, 'company_driver')
            ? 'LEFT JOIN company_driver driver ON j.brought_by_driver_id = driver.id'
            : '';
        $foremanNameColumn = tableExists($con, 'staff')
            ? firstColumn($con, 'staff', ['name', 'staff_name', 'full_name', 'username'])
            : null;
        $foremanSelect = $foremanNameColumn
            ? "foreman.`$foremanNameColumn` AS foreman_name"
            : "'' AS foreman_name";
        $foremanJoin = $foremanNameColumn
            ? 'LEFT JOIN staff foreman ON j.foreman_id = foreman.id'
            : '';
        $query = "SELECT j.*, ($statusSql) AS canonical_status,
                         $vehicleRegSelect, $vehicleUnitSelect, $vehiclePlateSelect, $vehicleBrandSelect, $vehicleModelSelect, $vehicleEquipmentSelect,
                         comp.name AS company_name,
                         cust.name AS contact_name, $customerTypeSelect, $customerPhoneSelect,
                         $driverSelect, $foremanSelect
                  FROM job j
                  LEFT JOIN customer_vehicle cv ON j.vehicle_id = cv.id
                  LEFT JOIN company comp ON j.company_id = comp.id
                  LEFT JOIN customer cust ON j.customer_id = cust.id
                  $driverJoin
                  $foremanJoin
                  WHERE $whereClause
                  ORDER BY $orderBy
                  LIMIT $limit OFFSET $offset";
                  
        $result = mysqli_query($con, $query);
        if (!$result) {
            sendResponse(false, 'Unable to load work orders: ' . mysqli_error($con), null, 500);
        }
        $workOrders = [];
        $jobIds = [];
        
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $jobId = intval($row['id']);
            $jobIds[] = $jobId;
            
            $workOrders[] = [
                'id' => $jobId,
                'workOrderNo' => $row['work_order_no'],
                'legacyStatus' => intval($row['status']),
                'canonicalStatus' => $row['canonical_status'],
                'vehicleId' => intval($row['vehicle_id']),
                'vehicleNo' => $row['vehicle_no'] ?? '-',
                'unitNo' => $row['unit_no'] ?? '',
                'regNo' => $row['reg_no'] ?? '',
                'brand' => $row['brand'] ?? '-',
                'model' => $row['model'] ?? '-',
                'equipmentType' => $row['equipment_type'] ?? '-',
                'companyId' => intval($row['company_id']),
                'companyName' => $row['company_name'] ?? '-',
                'customerId' => $row['customer_id'] ? intval($row['customer_id']) : null,
                'contactName' => $row['contact_name'] ?? '-',
                'contactType' => $row['contact_type'] ?? 'Unclassified',
                'customerPhone' => formatMalaysiaPhone($row['customer_phone'] ?? '-'),
                'serviceType' => $row['service_type'] ?? '',
                'serviceCentre' => $row['service_centre'] ?? '',
                'reportedProblem' => $row['reported_problem'] ?? '',
                'actualIssue' => $row['actual_issue'] ?? '',
                'customerNotes' => $row['customer_notes'] ?? '',
                'intakeType' => $row['intake_type'] ?? ($row['source_booking_id'] ? 'booking' : 'manual'),
                'requestChannel' => $row['request_channel'] ?? '',
                'broughtByDriverId' => !empty($row['brought_by_driver_id']) ? intval($row['brought_by_driver_id']) : null,
                'broughtByDriverName' => $row['brought_by_driver_name'] ?? '',
                'foremanId' => !empty($row['foreman_id']) ? intval($row['foreman_id']) : null,
                'foremanName' => $row['foreman_name'] ?? '',
                'checkinMileage' => isset($row['checkin_mileage']) ? intval($row['checkin_mileage']) : null,
                'autocountJobNo' => $row['autocount_job_no'] ?? '',
                'relatedVehicles' => [],
                'bay' => $row['bay'],
                'priority' => ($canonicalStatus === 'collected' || intval($row['status'] ?? 0) === 10) ? 'Normal' : normalizedWorkOrderPriority($row['priority'] ?? 'Normal'),
                'checkinAt' => $row['checkin_at'],
                'inspectedAt' => $row['inspected_at'],
                'quotationIssuedAt' => $row['quotation_issued_at'] ?? null,
                'approvedAt' => $row['approved_at'],
                'partsReadyAt' => $row['parts_ready_at'] ?? null,
                'partsStatus' => $row['parts_status'] ?? (!empty($row['parts_ready_at']) ? 'parts_ready' : null),
                'partsExpectedDate' => $row['parts_expected_date'] ?? null,
                'partsReference' => $row['parts_reference'] ?? '',
                'partsNotes' => $row['parts_notes'] ?? '',
                'partsStatusUpdatedAt' => $row['parts_status_updated_at'] ?? ($row['parts_ready_at'] ?? null),
                'partsStatusUpdatedBy' => isset($row['parts_status_updated_by']) ? intval($row['parts_status_updated_by']) : null,
                'partsAcknowledgedAt' => $row['parts_acknowledged_at'] ?? null,
                'partsAcknowledgedBy' => isset($row['parts_acknowledged_by']) ? intval($row['parts_acknowledged_by']) : null,
                'hasUnacknowledgedParts' => false,
                'underRepairAt' => $row['under_repair_at'] ?? null,
                'completedAt' => $row['completed_at'],
                'collectedAt' => $row['collected_at'],
                'estimatedOut' => !empty($row['estimated_out']) ? trim(strval($row['estimated_out'])) : null,
                'isBackOrder' => boolval($row['is_back_order'] ?? false),
                'technicians' => [],
                'photos' => [],
                'sourceBookingId' => $row['source_booking_id'] ? intval($row['source_booking_id']) : null
            ];
        }
        
        if (!empty($jobIds) && tableExists($con, 'job_assignment') && tableExists($con, 'staff')) {
            $idsStr = implode(',', $jobIds);
            $assignmentJobColumn = firstColumn($con, 'job_assignment', ['job_id', 'work_order_id']);
            $assignmentStaffColumn = firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']);
            $assignmentRoleColumn = firstColumn($con, 'job_assignment', ['role', 'assignment_role']);
            $staffNameColumn = firstColumn($con, 'staff', ['name', 'staff_name', 'full_name']);
            $staffRoleColumn = firstColumn($con, 'staff', ['role', 'position', 'type']);
            $assignmentRoleSelect = $assignmentRoleColumn
                ? "ja.`$assignmentRoleColumn`"
                : ($staffRoleColumn ? "s.`$staffRoleColumn`" : "'Technician'");
            $techQuery = $assignmentJobColumn && $assignmentStaffColumn && $staffNameColumn
                ? "SELECT ja.`$assignmentJobColumn` AS job_id,
                          s.id AS technician_id,
                          s.`$staffNameColumn` AS technician_name,
                          $assignmentRoleSelect AS role
                   FROM job_assignment ja
                   JOIN staff s ON ja.`$assignmentStaffColumn` = s.id
                   WHERE ja.`$assignmentJobColumn` IN ($idsStr)"
                : null;
            $techResult = $techQuery ? mysqli_query($con, $techQuery) : false;
            $techMap = [];
            while ($techResult && $tRow = mysqli_fetch_assoc($techResult)) {
                $techMap[$tRow['job_id']][] = [
                    'id' => intval($tRow['technician_id']),
                    'name' => $tRow['technician_name'],
                    'role' => $tRow['role']
                ];
            }
            
            foreach ($workOrders as &$wo) {
                $wo['technicians'] = $techMap[$wo['id']] ?? [];
            }
            unset($wo);
        }

        $photoMap = workOrderPhotoMap($con, $jobIds, false);
        foreach ($workOrders as &$wo) {
            $wo['photos'] = $photoMap[$wo['id']] ?? [];
        }
        unset($wo);

        if (!empty($jobIds) && tableExists($con, 'work_order_part_requirement')) {
            $idsStr = implode(',', $jobIds);
            $reqResult = mysqli_query($con, "SELECT work_order_id, part_id, item_code, description, required_quantity FROM work_order_part_requirement WHERE work_order_id IN ($idsStr)");
            $reqByJob = [];
            while ($reqResult && $rRow = mysqli_fetch_assoc($reqResult)) {
                $reqByJob[intval($rRow['work_order_id'])][] = $rRow;
            }
            if (!empty($reqByJob)) {
                $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
                $skuCol = $partTable ? firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']) : null;
                $stockCol = $partTable ? firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']) : null;
                $idCol = $partTable ? firstColumn($con, $partTable, ['id']) : null;
                
                $stockBySku = [];
                $stockById = [];
                if ($partTable && $stockCol && $idCol) {
                    $skuSelect = $skuCol ? "`$skuCol`" : "''";
                    $invRes = mysqli_query($con, "SELECT `$idCol` AS id, $skuSelect AS sku, `$stockCol` AS stock FROM `$partTable`");
                    while ($invRes && $iRow = mysqli_fetch_assoc($invRes)) {
                        $stockById[intval($iRow['id'])] = floatval($iRow['stock']);
                        if (!empty($iRow['sku'])) {
                            $stockBySku[strtoupper(trim($iRow['sku']))] = floatval($iRow['stock']);
                        }
                    }
                }

                foreach ($workOrders as &$wo) {
                    $jobRequirements = $reqByJob[$wo['id']] ?? null;
                    if (!empty($jobRequirements)) {
                        $isPostApproval = in_array($wo['canonicalStatus'] ?? '', ['approved', 'parts_ready', 'under_repair', 'ready_for_collection', 'collected'], true);
                        if (!$isPostApproval) {
                            $wo['hasUnacknowledgedParts'] = false;
                        } else {
                            $ackTime = !empty($wo['partsAcknowledgedAt']) ? strtotime($wo['partsAcknowledgedAt']) : (!empty($wo['approvedAt']) ? strtotime($wo['approvedAt']) : 0);
                            $updateTime = !empty($wo['partsStatusUpdatedAt']) ? strtotime($wo['partsStatusUpdatedAt']) : 0;
                            $wo['hasUnacknowledgedParts'] = ($updateTime > 0 && $ackTime > 0 && $updateTime > $ackTime);
                        }
                        $hasShortage = false;
                        foreach ($jobRequirements as $req) {
                            $reqQty = floatval($req['required_quantity']);
                            $pId = intval($req['part_id'] ?? 0);
                            $sku = strtoupper(trim(strval($req['item_code'] ?? '')));
                            $stock = 0.0;
                            if ($pId > 0 && isset($stockById[$pId])) {
                                $stock = $stockById[$pId];
                            } elseif ($sku !== '' && isset($stockBySku[$sku])) {
                                $stock = $stockBySku[$sku];
                            }
                            if ($stock < $reqQty) {
                                $hasShortage = true;
                                break;
                            }
                        }
                        if ($hasShortage) {
                            $wo['partsStatus'] = 'pending_parts';
                        } elseif ($wo['partsStatus'] === 'pending_parts' || empty($wo['partsStatus'])) {
                            $wo['partsStatus'] = 'parts_ready';
                        }
                    } else {
                        $wo['hasUnacknowledgedParts'] = false;
                    }
                }
                unset($wo);
            }
        }

        if (!empty($jobIds) && tableExists($con, 'work_order_vehicle')) {
            $idsStr = implode(',', $jobIds);
            $relatedRegColumn = firstColumn($con, 'customer_vehicle', ['reg_no', 'registration_no', 'plate_no', 'vec_no']);
            $relatedMap = [];
            if ($relatedRegColumn) {
                $relatedResult = mysqli_query($con, "SELECT wov.work_order_id, wov.vehicle_id, wov.relationship,
                    cv.`$relatedRegColumn` AS vehicle_no
                    FROM work_order_vehicle wov
                    JOIN customer_vehicle cv ON cv.id = wov.vehicle_id
                    WHERE wov.work_order_id IN ($idsStr)
                    ORDER BY wov.id");
                while ($relatedResult && $relatedRow = mysqli_fetch_assoc($relatedResult)) {
                    $relatedMap[intval($relatedRow['work_order_id'])][] = [
                        'id' => intval($relatedRow['vehicle_id']),
                        'vehicleNo' => $relatedRow['vehicle_no'],
                        'relationship' => $relatedRow['relationship']
                    ];
                }
            }
            foreach ($workOrders as &$workOrder) {
                $workOrder['relatedVehicles'] = $relatedMap[$workOrder['id']] ?? [];
            }
            unset($workOrder);
        }
        
        sendResponse(true, 'Admin work orders retrieved', [
            'workOrders' => $workOrders,
            'statusCounts' => $statusCounts,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => $totalPages
            ]
        ]);
        break;

    case 'admin-create-work-order':
        ensureColumn($con, 'job', 'is_back_order', 'TINYINT(1) NOT NULL DEFAULT 0');
        ensureColumn($con, 'job', 'service_type', 'VARCHAR(100) NULL DEFAULT NULL');
        ensureColumn($con, 'job', 'inspected_at', 'DATETIME NULL DEFAULT NULL');
        ensureColumnAcceptsNull($con, 'job', 'customer_id');
        $vehicleId = intval($inputData['vehicleId'] ?? 0);
        $companyId = intval($inputData['companyId'] ?? 0);
        $customerId = isset($inputData['customerId']) && $inputData['customerId'] !== '' ? intval($inputData['customerId']) : null;
        if (($customerId === null || $customerId <= 0) && $companyId > 0) {
            $fallbackCustomer = unifiedVehicleContact($con, 'customer_vehicle', $companyId, 0, true);
            if ($fallbackCustomer > 0) {
                $customerId = $fallbackCustomer;
            }
        }
        $serviceId = intval($inputData['serviceId'] ?? 0);
        $serviceType = trim(strval($inputData['serviceType'] ?? ''));
        $intakeType = trim(strval($inputData['intakeType'] ?? 'walk_in'));
        if (!in_array($intakeType, ['walk_in', 'rescue'], true)) {
            sendResponse(false, 'Select a valid intake type (Walk-in or Emergency Rescue).', null, 400);
        }
        $requestChannel = trim(strval($inputData['requestChannel'] ?? ''));
        $allowedChannels = ['WhatsApp', 'Verbal', 'Phone', 'Rescue Hotline', 'WhatsApp Rescue', 'Customer App', 'Walk-in', 'Direct'];
        if ($requestChannel === '' || !in_array($requestChannel, $allowedChannels, true)) {
            $requestChannel = ($intakeType === 'rescue') ? 'Rescue Hotline' : 'Walk-in';
        }
        $reportedProblem = trim(strval($inputData['reportedProblem'] ?? ''));
        if ($reportedProblem === '') {
            sendResponse(false, 'Customer request is required.', null, 400);
        }
        $driverId = intval($inputData['driverId'] ?? 0);
        $foremanId = intval($inputData['foremanId'] ?? 0);
        $checkinMileage = $inputData['checkinMileage'] ?? null;
        if ($checkinMileage !== null && $checkinMileage !== '' && (!is_numeric($checkinMileage) || intval($checkinMileage) < 0 || floatval($checkinMileage) != intval($checkinMileage))) {
            sendResponse(false, 'Check-in mileage must be a non-negative whole number.', null, 400);
        }
        $checkinMileage = ($checkinMileage === null || $checkinMileage === '') ? null : intval($checkinMileage);
        $checkinAtInput = trim(strval($inputData['checkinAt'] ?? ''));
        $checkinTimestamp = $checkinAtInput === '' ? time() : strtotime($checkinAtInput);
        if ($checkinTimestamp === false) {
            sendResponse(false, 'Invalid check-in date and time.', null, 400);
        }
        $checkinAt = date('Y-m-d H:i:s', $checkinTimestamp);
        $relatedVehicleIds = array_values(array_unique(array_filter(array_map('intval', is_array($inputData['relatedVehicleIds'] ?? null) ? $inputData['relatedVehicleIds'] : []))));
        $relatedVehicleIds = array_values(array_filter($relatedVehicleIds, function ($relatedId) use ($vehicleId) {
            return $relatedId > 0 && $relatedId !== $vehicleId;
        }));
        if (count($relatedVehicleIds) > 5) sendResponse(false, 'A work order may have up to five related vehicles or trailers.', null, 400);
        
        $priority = $inputData['priority'] ?? 'Normal';
        $allowedPriorities = ['Normal', 'High', 'Urgent'];
        if (!in_array($priority, $allowedPriorities)) {
            sendResponse(false, 'Invalid priority level', null, 400);
        }

        $bay = !empty($inputData['bay']) ? $inputData['bay'] : null;
        if ($bay !== null) {
            $allowedBays = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Engine Bay', 'Trailer Bay'];
            if (!in_array($bay, $allowedBays)) {
                sendResponse(false, 'Invalid workshop bay selection', null, 400);
            }
        }
        
        if ($vehicleId <= 0 || $companyId <= 0) {
            sendResponse(false, 'Vehicle and Company are required', null, 400);
        }
        
        mysqli_begin_transaction($con);
        try {
            $vQuery = "SELECT company_id, mileage FROM customer_vehicle WHERE id = $vehicleId LIMIT 1";
            $vRes = mysqli_query($con, $vQuery);
            if (!$vRes || mysqli_num_rows($vRes) === 0) {
                throw new Exception("Vehicle not found", 400);
            }
            $vRow = mysqli_fetch_assoc($vRes);
            if (intval($vRow['company_id']) !== $companyId) {
                throw new Exception("Mismatched company_id and vehicle_id. Vehicle belongs to another company.", 400);
            }

            // Rule: A vehicle can only have ONE active workshop job at any time (status in 2, 3, 4, 5, 6, 8)
            $activeJobCheckRes = mysqli_query($con, "
                SELECT id, work_order_no, status FROM job
                WHERE vehicle_id = $vehicleId AND status IN (2, 3, 4, 5, 6, 8)
                LIMIT 1
            ");
            if ($activeJobCheckRes && $activeJobRow = mysqli_fetch_assoc($activeJobCheckRes)) {
                $existingWo = $activeJobRow['work_order_no'];
                $statusCode = intval($activeJobRow['status']);
                $statusMap = [
                    2 => 'Checked In',
                    3 => 'Inspected',
                    4 => 'Approved',
                    5 => 'Parts Ready',
                    6 => 'Under Repair',
                    8 => 'Ready for Collection'
                ];
                $existingStatus = $statusMap[$statusCode] ?? 'In Workshop';
                throw new Exception("This vehicle already has an active work order ($existingWo - $existingStatus). A vehicle cannot have more than one ongoing workshop job simultaneously. Please complete and collect the existing work order first.", 400);
            }
            if ($checkinMileage !== null && $checkinMileage > 0) {
                $maxJobMileageRes = mysqli_query($con, "SELECT MAX(checkin_mileage) AS max_m FROM job WHERE vehicle_id = $vehicleId");
                $maxJobMileage = ($maxJobMileageRes && $mRow = mysqli_fetch_assoc($maxJobMileageRes)) ? intval($mRow['max_m']) : 0;
                $vProfileMileage = intval($vRow['mileage'] ?? 0);
                $priorRecorded = max($maxJobMileage, $vProfileMileage);
                if ($priorRecorded > 0 && $checkinMileage < $priorRecorded) {
                    throw new Exception("Check-in mileage (" . number_format($checkinMileage) . " km) cannot be less than the vehicle's previous recorded mileage (" . number_format($priorRecorded) . " km).", 400);
                }
            }
            foreach ($relatedVehicleIds as $relatedVehicleId) {
                $relatedResult = mysqli_query($con, "SELECT company_id FROM customer_vehicle WHERE id = $relatedVehicleId LIMIT 1");
                $relatedRow = $relatedResult ? mysqli_fetch_assoc($relatedResult) : null;
                if (!$relatedRow || intval($relatedRow['company_id']) !== $companyId) {
                    throw new Exception('Every related vehicle or trailer must belong to the selected company.', 400);
                }
            }

            if ($customerId !== null && unifiedVehicleContact($con, 'customer_vehicle', $companyId, $customerId, false) <= 0) {
                throw new Exception('Selected Company User does not belong to this company.', 400);
            }
            if ($driverId > 0 && unifiedVehicleDriver($con, $companyId, $driverId) <= 0) {
                $driverId = null;
            }
            if ($foremanId > 0) {
                $foreman = staffRecordById($con, $foremanId);
                $staffColumnMap = staffColumns($con);
                $rawForemanStatus = $foreman && $staffColumnMap['status'] ? ($foreman[$staffColumnMap['status']] ?? 'Active') : 'Active';
                if (!$foreman || in_array(strtolower(trim(strval($rawForemanStatus))), ['0', 'inactive', 'disabled'], true)) {
                    throw new Exception('Selected Foreman is not an active staff member.', 400);
                }
                $foremanRole = normalizeStaffRole($staffColumnMap['role'] ? ($foreman[$staffColumnMap['role']] ?? '') : '');
                if (!in_array($foremanRole, ['Foreman', 'Head Manager'], true)) {
                    throw new Exception('Selected intake owner must have the Foreman or Head Manager role.', 400);
                }
            }
            
            $estimatedOut = !empty($inputData['estimatedOut']) ? $inputData['estimatedOut'] : null;
            if ($estimatedOut !== null) {
                $estimatedOutTime = strtotime($estimatedOut);
                if ($estimatedOutTime === false) {
                    throw new Exception("Invalid expected completion date format", 400);
                }
                if ($estimatedOutTime < strtotime(date('Y-m-d'))) {
                    throw new Exception("Expected completion date cannot be in the past", 400);
                }
            }
            
            $createdBy = intval($_SESSION['admin_id'] ?? 0);
            $isBackOrder = !empty($inputData['isBackOrder']) ? 1 : 0;
            $insertSql = "INSERT INTO job (
                vehicle_id, company_id, customer_id, requested_by_company_user_id,
                service_id, service_type, brought_by_driver_id, foreman_id, checkin_mileage,
                bay, priority, intake_type, request_channel, reported_problem,
                status, checkin_at, inspected_at, created_at, scheduled_at, estimated_out, is_back_order, created_by
            ) VALUES (" . implode(', ', [
                unifiedVehicleSqlValue($con, $vehicleId, 'int'),
                unifiedVehicleSqlValue($con, $companyId, 'int'),
                unifiedVehicleSqlValue($con, $customerId, 'nullable-int'),
                unifiedVehicleSqlValue($con, $customerId, 'nullable-int'),
                unifiedVehicleSqlValue($con, $serviceId, 'int'),
                unifiedVehicleSqlValue($con, $serviceType, 'nullable-string'),
                unifiedVehicleSqlValue($con, $driverId, 'nullable-int'),
                unifiedVehicleSqlValue($con, $foremanId, 'nullable-int'),
                unifiedVehicleSqlValue($con, $checkinMileage, 'nullable-int'),
                unifiedVehicleSqlValue($con, $bay, 'nullable-string'),
                unifiedVehicleSqlValue($con, $priority),
                unifiedVehicleSqlValue($con, $intakeType),
                unifiedVehicleSqlValue($con, $requestChannel),
                unifiedVehicleSqlValue($con, $reportedProblem),
                '3',
                unifiedVehicleSqlValue($con, $checkinAt, 'date-time'),
                unifiedVehicleSqlValue($con, $checkinAt, 'date-time'),
                'NOW()',
                unifiedVehicleSqlValue($con, $checkinAt, 'date-time'),
                unifiedVehicleSqlValue($con, $estimatedOut, 'date'),
                $isBackOrder,
                $createdBy
            ]) . ')';
            if (!mysqli_query($con, $insertSql)) {
                throw new Exception('Failed to create walk-in work order: ' . mysqli_error($con), 500);
            }
            
            $jobId = mysqli_insert_id($con);
            
            $year = date('Y');
            $workOrderNo = sprintf("WO-%s-%06d", $year, $jobId);
            
            $stmt2 = mysqli_prepare($con, "UPDATE job SET work_order_no = ? WHERE id = ?");
            mysqli_stmt_bind_param($stmt2, "si", $workOrderNo, $jobId);
            
            if (!mysqli_stmt_execute($stmt2)) {
                throw new Exception("Failed to generate work order number: " . mysqli_stmt_error($stmt2), 500);
            }
            mysqli_stmt_close($stmt2);

            if (array_key_exists('technicianIds', $inputData)) {
                replaceJobAssignments($con, $jobId, $inputData['technicianIds']);
            }
            foreach ($relatedVehicleIds as $relatedVehicleId) {
                if (!mysqli_query($con, "INSERT INTO work_order_vehicle (work_order_id, vehicle_id, relationship) VALUES ($jobId, $relatedVehicleId, 'related')")) {
                    throw new Exception('Unable to save related vehicle: ' . mysqli_error($con), 500);
                }
            }
            if ($checkinMileage !== null && $checkinMileage > 0 && $vehicleId > 0) {
                syncVehicleMileageFromCheckin($con, $vehicleId, $checkinMileage, $jobId, $workOrderNo, 'walkin_checkin', $actualIssue ?: ($reportedProblem ?: 'Walk-in workshop intake'));
            }
            
            mysqli_commit($con);
            if ($customerId) {
                notifyVehicleCustomer(
                    $con,
                    $vehicleId,
                    tableExists($con, 'customer') ? 'customer' : 'users',
                    $companyId,
                    $customerId,
                    'Vehicle under inspection',
                    "$workOrderNo has been created. Your vehicle is checked in and currently undergoing inspection.",
                    'booking',
                    'work_order',
                    'wo' . $jobId,
                    '/bookings'
                );
            }
            sendResponse(true, 'Walk-in work order created successfully', [
                'id' => $jobId,
                'workOrderNo' => $workOrderNo
            ]);
        } catch (Exception $e) {
            mysqli_rollback($con);
            sendResponse(false, $e->getMessage(), null, $e->getCode() ?: 500);
        }
        break;



        // --- admin work order parts ---
    case 'admin-work-order-parts-overview':
        $jobId = intval($_GET['id'] ?? $inputData['id'] ?? 0);
        if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
        if (countRows($con, 'job', "id = $jobId") < 1) sendResponse(false, 'Work order not found.', null, 404);
        sendResponse(true, 'Work order parts overview retrieved.', workOrderPartsOverview($con, $jobId));
        break;

    case 'admin-get-work-order-part-requirements':
        $jobId = intval($_GET['id'] ?? $inputData['id'] ?? 0);
        if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
        if (countRows($con, 'job', "id = $jobId") < 1) sendResponse(false, 'Work order not found.', null, 404);
        sendResponse(true, 'Inspection part requirements retrieved.', workOrderPartRequirements($con, $jobId));
        break;

    case 'admin-save-work-order-part-requirements':
        $jobId = intval($inputData['workOrderId'] ?? 0);
        if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
        $jobResult = mysqli_query($con, "SELECT * FROM job WHERE id = $jobId LIMIT 1");
        $jobRow = $jobResult ? mysqli_fetch_assoc($jobResult) : null;
        if (!$jobRow) sendResponse(false, 'Work order not found.', null, 404);
        $canonical = deriveCanonicalStatus($jobRow);
        if (in_array($canonical, ['ready_for_collection', 'collected'], true)) {
            sendResponse(false, 'This work order repair is completed or ready for collection. Part requirements are locked.', null, 409);
        }
        $oldRequirements = workOrderPartRequirements($con, $jobId);
        $incomingItems = $inputData['items'] ?? [];

        // Helper to check if parts requirement list actually changed
        $normalizeItems = function($list) {
            $map = [];
            foreach ($list as $it) {
                $code = strtoupper(trim(strval($it['code'] ?? $it['itemCode'] ?? '')));
                $desc = strtoupper(trim(strval($it['description'] ?? '')));
                $qty = floatval($it['quantity'] ?? $it['requiredQuantity'] ?? 0);
                if ($code === '' && $desc === '' && $qty <= 0) continue;
                $key = $code !== '' ? 'C:' . $code : 'D:' . $desc;
                $map[$key] = ($map[$key] ?? 0) + $qty;
            }
            ksort($map);
            return $map;
        };
        $partsChanged = ($normalizeItems($oldRequirements) !== $normalizeItems($incomingItems));

        try {
            $savedRequirements = replaceWorkOrderPartRequirements($con, $jobId, $incomingItems);
        } catch (Throwable $error) {
            sendResponse(false, 'Unable to save inspection parts: ' . $error->getMessage(), null, $error->getCode() ?: 500);
        }

        // If new parts added or changed mid-repair (or in post-approval stage), revise quotation and revert status to quotation_issued
        $quotationRevised = false;
        $newRevision = 1;
        if ($partsChanged && in_array($canonical, ['under_repair', 'parts_ready', 'pending_parts', 'approved'], true)) {
            if (tableExists($con, 'work_order_quotation')) {
                $quoteRes = mysqli_query($con, "SELECT id, revision, status FROM work_order_quotation WHERE work_order_id = $jobId LIMIT 1");
                if ($quoteRes && $quoteRow = mysqli_fetch_assoc($quoteRes)) {
                    $quotationId = intval($quoteRow['id']);
                    $currentRev = max(1, intval($quoteRow['revision'] ?? 1));
                    $newRevision = $currentRev + 1;
                    mysqli_query($con, "UPDATE work_order_quotation SET status = 'draft', revision = $newRevision, approved_at = NULL, customer_response_note = NULL, updated_at = NOW() WHERE id = $quotationId");
                    $quotationRevised = true;
                }
            }

            // Roll back job lifecycle status to quotation_issued
            $jobStatusSql = "UPDATE job SET
                status = 3,
                quotation_issued_at = NOW(),
                under_repair_at = NULL,
                approved_at = NULL,
                parts_ready_at = NULL
                WHERE id = $jobId";
            mysqli_query($con, $jobStatusSql);

            // Record status history for audit trail
            requireWorkOrderStatusHistorySchema($con);
            recordWorkOrderStatusHistory(
                $con,
                $jobId,
                $canonical,
                'quotation_issued',
                'mid_repair_parts_revision',
                "Parts modified mid-repair. Quotation revised to Rev $newRevision for re-approval."
            );
        }

        sendResponse(true, $quotationRevised ? "Part requirements saved. Quotation revised to Rev $newRevision and requires re-approval." : 'Inspection part requirements saved.', [
            'requirements' => $savedRequirements,
            'quotationRevised' => $quotationRevised,
            'newRevision' => $newRevision,
            'canonicalStatus' => $quotationRevised ? 'quotation_issued' : $canonical,
            'previousStatus' => $canonical
        ]);
        break;

    case 'admin-acknowledge-work-order-parts':
        $jobId = intval($inputData['workOrderId'] ?? $inputData['id'] ?? 0);
        if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
        if (countRows($con, 'job', "id = $jobId") < 1) sendResponse(false, 'Work order not found.', null, 404);
        $adminId = intval($_SESSION['admin_id'] ?? 0);
        saveWorkOrderAcknowledgedPartsSnapshot($con, $jobId);
        mysqli_query($con, "UPDATE job SET parts_acknowledged_at = NOW(), parts_acknowledged_by = " . ($adminId > 0 ? $adminId : 'NULL') . " WHERE id = $jobId");
        sendResponse(true, 'Work order parts update acknowledged successfully.', ['workOrderId' => $jobId]);
        break;

    case 'admin-unacknowledged-parts-alert':
        $count = 0;
        if (columnExists($con, 'job', 'parts_status_updated_at') && tableExists($con, 'work_order_part_requirement')) {
            $canonicalStatusSql = getCanonicalStatusSql($con, 'j');
            $query = "SELECT COUNT(DISTINCT j.id) AS cnt
                      FROM job j
                      JOIN work_order_part_requirement r ON r.work_order_id = j.id
                      WHERE j.parts_status_updated_at IS NOT NULL
                        AND ($canonicalStatusSql) IN ('approved', 'parts_ready', 'under_repair')
                        AND j.parts_status_updated_at > COALESCE(j.parts_acknowledged_at, j.approved_at, '9999-12-31')
                        AND ($canonicalStatusSql) <> 'collected'";
            $res = mysqli_query($con, $query);
            $count = ($res && $row = mysqli_fetch_assoc($res)) ? intval($row['cnt']) : 0;
        }
        sendResponse(true, 'Unacknowledged parts alert count', [
            'hasUnacknowledgedParts' => $count > 0,
            'count' => $count
        ]);
        break;



        // --- admin work orders 2 ---
    case 'admin-rollback-work-order':
        $jobId = intval($inputData['id'] ?? 0);
        $reason = substr(trim(strval($inputData['reason'] ?? '')), 0, 500);
        if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
        if (strlen($reason) < 1) sendResponse(false, 'Enter a rollback reason (at least 1 character).', null, 400);
        $currentRole = currentAdminRoleName($con);
        if (!in_array($currentRole, ['Admin', 'Head Manager'], true)) {
            sendResponse(false, 'Only an Admin or Head Manager may roll back a work order status.', null, 403);
        }
        $jobResult = mysqli_query($con, "SELECT * FROM job WHERE id = $jobId LIMIT 1");
        $jobRow = $jobResult ? mysqli_fetch_assoc($jobResult) : null;
        if (!$jobRow) sendResponse(false, 'Work order not found.', null, 404);
        $fromStatus = deriveCanonicalStatus($jobRow);
        if ($fromStatus === 'checked_in' && $currentRole !== 'Admin') {
            sendResponse(false, 'Only an Admin may undo vehicle Check In.', null, 403);
        }
        $toStatus = workOrderRollbackTarget($con, $jobRow);
        if (!$toStatus) {
            $message = $fromStatus === 'collected'
                ? 'Collected is final and cannot be rolled back. Use a separate correction workflow.'
                : 'This work order has no earlier status available.';
            sendResponse(false, $message, null, 409);
        }
        if ($fromStatus === 'ready_for_collection' && tableExists($con, 'work_order_invoice') && countRows($con, 'work_order_invoice', "work_order_id = $jobId") > 0) {
            sendResponse(false, 'This work order already has an invoice. Void or correct the invoice before rolling its status back.', null, 409);
        }

        $statusUpdates = [];
        if ($toStatus === 'scheduled') {
            $statusUpdates = ['status = 1', 'checkin_at = NULL', 'inspected_at = NULL', 'approved_at = NULL', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'quotation_issued_at')) $statusUpdates[] = 'quotation_issued_at = NULL';
            if (columnExists($con, 'job', 'parts_ready_at')) $statusUpdates[] = 'parts_ready_at = NULL';
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = NULL';
        } elseif ($toStatus === 'checked_in') {
            $statusUpdates = ['status = 2', 'checkin_at = COALESCE(checkin_at, NOW())', 'inspected_at = NULL', 'approved_at = NULL', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'quotation_issued_at')) $statusUpdates[] = 'quotation_issued_at = NULL';
            if (columnExists($con, 'job', 'parts_ready_at')) $statusUpdates[] = 'parts_ready_at = NULL';
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = NULL';
        } elseif ($toStatus === 'inspected') {
            $statusUpdates = ['status = 3', 'checkin_at = COALESCE(checkin_at, NOW())', 'inspected_at = COALESCE(inspected_at, NOW())', 'approved_at = NULL', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'quotation_issued_at')) $statusUpdates[] = 'quotation_issued_at = NULL';
            if (columnExists($con, 'job', 'parts_ready_at')) $statusUpdates[] = 'parts_ready_at = NULL';
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = NULL';
        } elseif ($toStatus === 'quotation_issued') {
            $statusUpdates = ['status = 3', 'checkin_at = COALESCE(checkin_at, NOW())', 'inspected_at = COALESCE(inspected_at, NOW())', 'approved_at = NULL', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'quotation_issued_at')) $statusUpdates[] = 'quotation_issued_at = COALESCE(quotation_issued_at, NOW())';
            if (columnExists($con, 'job', 'parts_ready_at')) $statusUpdates[] = 'parts_ready_at = NULL';
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = NULL';
        } elseif ($toStatus === 'approved') {
            $statusUpdates = ['status = 4', 'checkin_at = COALESCE(checkin_at, NOW())', 'inspected_at = COALESCE(inspected_at, NOW())', 'approved_at = COALESCE(approved_at, NOW())', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'parts_ready_at')) $statusUpdates[] = 'parts_ready_at = NULL';
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = NULL';
            if (columnExists($con, 'job', 'parts_status')) $statusUpdates[] = 'parts_status = NULL';
            if (columnExists($con, 'job', 'parts_expected_date')) $statusUpdates[] = 'parts_expected_date = NULL';
        } elseif ($toStatus === 'parts_ready') {
            $statusUpdates = ['status = 5', 'checkin_at = COALESCE(checkin_at, NOW())', 'inspected_at = COALESCE(inspected_at, NOW())', 'approved_at = COALESCE(approved_at, NOW())', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'parts_ready_at')) $statusUpdates[] = 'parts_ready_at = COALESCE(parts_ready_at, NOW())';
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = NULL';
            if (columnExists($con, 'job', 'parts_status')) $statusUpdates[] = "parts_status = 'parts_ready'";
        } elseif ($toStatus === 'under_repair') {
            $statusUpdates = ['status = 6', 'checkin_at = COALESCE(checkin_at, NOW())', 'inspected_at = COALESCE(inspected_at, NOW())', 'approved_at = COALESCE(approved_at, NOW())', 'completed_at = NULL', 'collected_at = NULL'];
            if (columnExists($con, 'job', 'under_repair_at')) $statusUpdates[] = 'under_repair_at = COALESCE(under_repair_at, NOW())';
        }
        if (!$statusUpdates) sendResponse(false, 'Unable to determine rollback changes.', null, 409);

        requireWorkOrderStatusHistorySchema($con);
        mysqli_begin_transaction($con);
        try {
            if (!mysqli_query($con, 'UPDATE job SET ' . implode(', ', $statusUpdates) . " WHERE id = $jobId")) {
                throw new Exception('Unable to roll back work order: ' . mysqli_error($con), 500);
            }
            $quotation = workOrderQuotation($con, $jobId);
            if ($quotation && $fromStatus === 'quotation_issued' && $toStatus === 'inspected') {
                $quotationId = intval($quotation['id']);
                if (!mysqli_query($con, "UPDATE work_order_quotation SET status = 'draft', issued_at = NULL, approved_at = NULL, rejected_at = NULL, updated_at = NOW() WHERE id = $quotationId")) throw new Exception(mysqli_error($con), 500);
            } elseif ($quotation && $fromStatus === 'approved' && $toStatus === 'quotation_issued') {
                $quotationId = intval($quotation['id']);
                if (!mysqli_query($con, "UPDATE work_order_quotation SET status = 'issued', approved_at = NULL, rejected_at = NULL, updated_at = NOW() WHERE id = $quotationId")) throw new Exception(mysqli_error($con), 500);
            }
            $sourceBookingId = intval($jobRow['source_booking_id'] ?? 0);
            if ($sourceBookingId > 0 && tableExists($con, 'customer_appointment')) {
                $bookingStatusColumn = firstColumn($con, 'customer_appointment', ['status']);
                if ($bookingStatusColumn) mysqli_query($con, "UPDATE customer_appointment SET `$bookingStatusColumn` = 'in_progress' WHERE id = $sourceBookingId");
            }
            if (!recordWorkOrderStatusHistory($con, $jobId, $fromStatus, $toStatus, 'rollback', $reason)) throw new Exception(mysqli_error($con), 500);
            if ($fromStatus === 'collected') {
                restoreWorkOrderPartsInventory($con, $jobId);
            }
            mysqli_commit($con);
        } catch (Throwable $error) {
            mysqli_rollback($con);
            sendResponse(false, $error->getMessage(), null, $error->getCode() ?: 500);
        }

        $workOrderNumber = rowValue($jobRow, ['work_order_no'], 'WO-' . $jobId);
        $fromLabel = ucwords(str_replace('_', ' ', $fromStatus));
        $toLabel = ucwords(str_replace('_', ' ', $toStatus));
        $customerMessage = "$workOrderNumber progress was corrected from $fromLabel back to $toLabel. Reason: $reason";
        $sourceBookingId = intval($jobRow['source_booking_id'] ?? 0);
        if ($sourceBookingId > 0) {
            $target = bookingNotificationTarget($con, $sourceBookingId);
            if ($target && $target['contactId'] > 0) createCustomerRecordNotification($con, $target['source'], $target['companyId'], $target['contactId'], 'Service status corrected', $customerMessage, 'status_rollback', 'work_order', 'wo' . $jobId, '/repair-progress/wo' . $jobId);
        } else {
            $contactId = intval($jobRow['customer_id'] ?? 0);
            if ($contactId > 0) notifyVehicleCustomer($con, intval($jobRow['vehicle_id'] ?? 0), tableExists($con, 'customer') ? 'customer' : 'users', intval($jobRow['company_id'] ?? 0), $contactId, 'Service status corrected', $customerMessage, 'status_rollback', 'work_order', 'wo' . $jobId, '/repair-progress/wo' . $jobId);
        }
        sendResponse(true, "Work order rolled back to $toLabel.", ['fromStatus' => $fromStatus, 'toStatus' => $toStatus]);
        break;

    case 'admin-update-work-order':
        $jobId = intval($inputData['id'] ?? 0);
        if ($jobId <= 0) {
            sendResponse(false, 'Job ID is required', null, 400);
        }
        
        $getQuery = "SELECT * FROM job WHERE id = $jobId LIMIT 1";
        $getRes = mysqli_query($con, $getQuery);
        if (!$getRes || mysqli_num_rows($getRes) === 0) {
            sendResponse(false, 'Work order not found', null, 404);
        }
        $jobRow = mysqli_fetch_assoc($getRes);

        $currentRole = currentAdminRoleName($con);
        if ($currentRole === 'Foreman' || $currentRole === 'Technician') {
            $signedInStaffId = intval($_SESSION['admin_id'] ?? 0);
            $assignmentJobColumn = firstColumn($con, 'job_assignment', ['job_id', 'work_order_id']);
            $assignmentStaffColumn = firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']);
            $isAssigned = (
                $signedInStaffId > 0 &&
                (
                    intval($jobRow['foreman_id'] ?? 0) === $signedInStaffId ||
                    (
                        tableExists($con, 'job_assignment') &&
                        $assignmentJobColumn &&
                        $assignmentStaffColumn &&
                        countRows(
                            $con,
                            'job_assignment',
                            "`$assignmentJobColumn` = $jobId AND `$assignmentStaffColumn` = $signedInStaffId"
                        ) > 0
                    )
                )
            );
            if (!$isAssigned) {
                sendResponse(false, 'You may update only work orders assigned to you.', null, 403);
            }
        }
        if ($currentRole === 'Technician') {
            foreach (['partsStatus', 'partsExpectedDate', 'partsReference', 'partsNotes'] as $restrictedField) {
                if (array_key_exists($restrictedField, $inputData)) {
                    sendResponse(false, 'Parts status can only be updated by a Manager or Admin.', null, 403);
                }
            }
        }
        
        $priority = array_key_exists('priority', $inputData)
            ? $inputData['priority']
            : normalizedWorkOrderPriority($jobRow['priority'] ?? 'Normal');
        $allowedPriorities = ['Normal', 'High', 'Urgent'];
        if (!in_array($priority, $allowedPriorities)) {
            sendResponse(false, 'Invalid priority level', null, 400);
        }

        $bay = !empty($inputData['bay']) ? $inputData['bay'] : null;
        if ($bay !== null) {
            $allowedBays = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Engine Bay', 'Trailer Bay'];
            if (!in_array($bay, $allowedBays)) {
                sendResponse(false, 'Invalid workshop bay selection', null, 400);
            }
        }
        
        $estimatedOut = !empty($inputData['estimatedOut']) ? $inputData['estimatedOut'] : null;
        if ($estimatedOut !== null) {
            $estimatedOutTime = strtotime($estimatedOut);
            if ($estimatedOutTime === false) {
                sendResponse(false, 'Invalid expected completion date format', null, 400);
            }
            $checkinTime = !empty($jobRow['checkin_at']) ? strtotime($jobRow['checkin_at']) : time();
            if ($estimatedOutTime < strtotime(date('Y-m-d', $checkinTime))) {
                sendResponse(false, 'Expected completion date cannot be before check-in date', null, 400);
            }
        }
        
        $canonicalStatus = $inputData['canonicalStatus'] ?? null;
        $updates = [];
        ensureColumn($con, 'job', 'is_back_order', 'TINYINT(1) NOT NULL DEFAULT 0');
        if (array_key_exists('isBackOrder', $inputData)) {
            $isBackOrderVal = !empty($inputData['isBackOrder']) ? 1 : 0;
            $updates[] = "is_back_order = $isBackOrderVal";
        }
        $currentCanonicalStatus = deriveCanonicalStatus($jobRow);

        if (array_key_exists('partsStatus', $inputData)) {
            if (!in_array($currentRole, ['Admin', 'Head Manager'], true)) {
                sendResponse(false, 'Parts Status can only be updated by an Admin or Head Manager.', null, 403);
            }
            if (!columnExists($con, 'job', 'parts_status')) {
                sendResponse(false, 'Apply migration 020_work_order_parts_status.sql before updating Parts Status.', null, 409);
            }
            if (!in_array($currentCanonicalStatus, ['approved', 'parts_ready', 'under_repair', 'ready_for_collection', 'collected'], true)) {
                sendResponse(false, 'Parts Status can be updated after the repair is approved.', null, 409);
            }

            $partsStatus = strtolower(trim(strval($inputData['partsStatus'] ?? '')));
            $allowedPartsStatuses = ['not_required', 'pending_parts', 'partially_arrived', 'parts_ready'];
            if (!in_array($partsStatus, $allowedPartsStatuses, true)) {
                sendResponse(false, 'Invalid Parts Status.', null, 400);
            }

            $automaticPartsStatus = automaticPartsStatusFromOverview(workOrderPartsOverview($con, $jobId));
            $canAutoOverride = in_array($currentRole, ['Admin', 'Head Manager', 'Manager', 'Service Advisor'], true);
            $isPartsOverride = (!empty($inputData['partsStatusOverride']) || $canAutoOverride || $canonicalStatus !== null) && $partsStatus !== $automaticPartsStatus;
            $partsOverrideReason = substr(trim(strval($inputData['partsStatusOverrideReason'] ?? '')), 0, 500);
            if ($isPartsOverride && $partsOverrideReason === '') {
                $partsOverrideReason = "Authorized update to $partsStatus by $currentRole";
            }
            if ($partsStatus !== $automaticPartsStatus && !$isPartsOverride && !$canAutoOverride && $canonicalStatus === null) {
                sendResponse(false, 'Live stock calculates Parts Status as ' . ucwords(str_replace('_', ' ', $automaticPartsStatus)) . '. Use an authorised override and provide a reason to choose another status.', null, 409);
            }

            $partsExpectedDate = trim(strval($inputData['partsExpectedDate'] ?? ''));
            if (in_array($partsStatus, ['pending_parts', 'partially_arrived'], true) && $partsExpectedDate === '') {
                sendResponse(false, 'Expected arrival date is required while parts are pending.', null, 400);
            }
            if ($partsExpectedDate !== '') {
                $parsedPartsDate = DateTime::createFromFormat('!Y-m-d', $partsExpectedDate);
                if (!$parsedPartsDate || $parsedPartsDate->format('Y-m-d') !== $partsExpectedDate) {
                    sendResponse(false, 'Invalid expected parts arrival date.', null, 400);
                }
            }
            $partsReference = substr(trim(strval($inputData['partsReference'] ?? '')), 0, 120);
            $partsNotes = substr(trim(strval($inputData['partsNotes'] ?? '')), 0, 2000);
            if ($partsStatus === 'not_required') {
                $partsExpectedDate = '';
                $partsReference = '';
                $partsNotes = '';
            } elseif ($partsStatus === 'parts_ready') {
                $partsExpectedDate = '';
            }
            if ($isPartsOverride) {
                $overrideAudit = '[Override by ' . $currentRole . ' on ' . date('Y-m-d H:i') . '] ' . $partsOverrideReason;
                $partsNotes = substr(trim($partsNotes . ($partsNotes === '' ? '' : "\n") . $overrideAudit), 0, 2000);
            }

            $partsStatusSql = mysqli_real_escape_string($con, $partsStatus);
            $partsExpectedDateSql = $partsExpectedDate === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $partsExpectedDate) . "'";
            $partsReferenceSql = $partsReference === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $partsReference) . "'";
            $partsNotesSql = $partsNotes === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $partsNotes) . "'";
            $adminId = intval($_SESSION['admin_id'] ?? 0);
            $updates[] = "parts_status = '$partsStatusSql'";
            $updates[] = "parts_expected_date = $partsExpectedDateSql";
            $updates[] = "parts_reference = $partsReferenceSql";
            $updates[] = "parts_notes = $partsNotesSql";
            $updates[] = 'parts_status_updated_at = NOW()';
            $updates[] = 'parts_status_updated_by = ' . ($adminId > 0 ? $adminId : 'NULL');

            if (columnExists($con, 'job', 'parts_ready_at')) {
                if ($partsStatus === 'parts_ready') {
                    $updates[] = 'parts_ready_at = COALESCE(parts_ready_at, NOW())';
                    if ($currentCanonicalStatus === 'approved') $updates[] = 'status = 5';
                } elseif ($currentCanonicalStatus === 'parts_ready') {
                    $updates[] = 'parts_ready_at = NULL';
                    $updates[] = 'status = 3';
                }
            }
        }
        
        if ($canonicalStatus !== null) {
            $hasPartsRequirement = tableExists($con, 'work_order_part_requirement') && (countRows($con, 'work_order_part_requirement', "work_order_id = $jobId") > 0);
            $isPostApprovalStage = in_array($currentCanonicalStatus, ['approved', 'parts_ready', 'under_repair', 'ready_for_collection'], true);
            $ackTime = !empty($jobRow['parts_acknowledged_at']) ? strtotime($jobRow['parts_acknowledged_at']) : (!empty($jobRow['approved_at']) ? strtotime($jobRow['approved_at']) : 0);
            $updateTime = !empty($jobRow['parts_status_updated_at']) ? strtotime($jobRow['parts_status_updated_at']) : 0;
            $hasUnacknowledgedParts = $hasPartsRequirement && $isPostApprovalStage && ($updateTime > 0 && $ackTime > 0 && $updateTime > $ackTime);
            if ($hasUnacknowledgedParts) {
                sendResponse(false, 'Please review and acknowledge newly added parts before updating work order status.', null, 409);
            }

            $allowedStatuses = ['scheduled', 'checked_in', 'inspected', 'quotation_issued', 'approved', 'pending_parts', 'parts_ready', 'under_repair', 'ready_for_collection', 'collected'];
            if (!in_array($canonicalStatus, $allowedStatuses)) {
                sendResponse(false, 'Invalid target canonical status', null, 400);
            }

            if ($canonicalStatus === 'quotation_issued') {
                sendResponse(false, 'Create and issue the quotation from the Quotation action. The lifecycle will update automatically.', null, 409);
            }
            if ($canonicalStatus === 'parts_ready' && !in_array($currentRole, ['Admin', 'Head Manager'], true)) {
                sendResponse(false, 'Only an Admin or Head Manager may confirm that parts are ready.', null, 403);
            }

            $isBackOrderJob = array_key_exists('isBackOrder', $inputData) ? !empty($inputData['isBackOrder']) : !empty($jobRow['is_back_order']);
            if (!$isBackOrderJob && in_array($canonicalStatus, ['parts_ready', 'under_repair', 'ready_for_collection', 'collected'], true)) {
                $overview = workOrderPartsOverview($con, $jobId);
                $autoStatus = automaticPartsStatusFromOverview($overview);
                if (in_array($autoStatus, ['pending_parts', 'partially_arrived'], true)) {
                    sendResponse(false, 'Cannot advance work order lifecycle while spare parts have stock shortage. Please receive parts into stock or enable Back Order.', null, 409);
                }
            }

            $allowedTransitions = [
                'scheduled' => ['checked_in'],
                'checked_in' => ['inspected'],
                'inspected' => ['approved', 'pending_parts', 'parts_ready', 'under_repair'],
                'quotation_issued' => ['approved', 'pending_parts', 'parts_ready', 'under_repair'],
                'approved' => ['pending_parts', 'parts_ready', 'under_repair'],
                'pending_parts' => ['parts_ready', 'under_repair'],
                'parts_ready' => ['under_repair'],
                'under_repair' => ['ready_for_collection'],
                'ready_for_collection' => ['collected'],
                'collected' => []
            ];
            $validTargets = $allowedTransitions[$currentCanonicalStatus] ?? [];
            if (!in_array($canonicalStatus, $validTargets, true)) {
                $currentLabel = ucwords(str_replace('_', ' ', $currentCanonicalStatus));
                if (empty($validTargets)) {
                    sendResponse(false, "$currentLabel is a final or locked work order status.", null, 409);
                }
                $nextLabels = array_map(
                    function ($status) {
                        return ucwords(str_replace('_', ' ', $status));
                    },
                    $validTargets
                );
                sendResponse(
                    false,
                    "Invalid lifecycle transition from $currentLabel. Next allowed status: " . implode(' or ', $nextLabels) . '.',
                    null,
                    409
                );
            }
            if (
                in_array($currentRole, ['Foreman', 'Technician'], true) &&
                !in_array($canonicalStatus, ['inspected', 'parts_ready', 'under_repair', 'ready_for_collection'], true)
            ) {
                $message = in_array($canonicalStatus, ['checked_in', 'collected'], true)
                    ? 'Check In and Collect status updates require an Admin.'
                    : 'This lifecycle status requires a Head Manager or Admin.';
                sendResponse(false, $message, null, 403);
            }
            if (
                $currentRole === 'Head Manager' &&
                !in_array($canonicalStatus, ['inspected', 'quotation_issued', 'approved', 'parts_ready', 'under_repair', 'ready_for_collection'], true)
            ) {
                sendResponse(false, 'Check In and Collect status updates require an Admin.', null, 403);
            }
            if ($canonicalStatus === 'approved') {
                $quotation = workOrderQuotation($con, $jobId);
                if (!$quotation || empty($quotation['items'])) {
                    sendResponse(false, 'Every work order must have a valid quotation with items before repair approval. Please complete the quotation first.', null, 409);
                }
                if ($quotation['status'] !== 'approved') {
                    $quotationId = intval($quotation['id']);
                    $adminId = intval($_SESSION['admin_id'] ?? 0);
                    $adminRole = currentAdminRoleName($con);
                    $note = mysqli_real_escape_string($con, "Internally approved by $adminRole on " . date('Y-m-d H:i'));
                    mysqli_query($con, "UPDATE work_order_quotation SET status = 'approved', approved_at = NOW(), customer_response_note = '$note', updated_at = NOW() WHERE id = $quotationId");
                    if (columnExists($con, 'job', 'quotation_issued_at')) {
                        $updates[] = 'quotation_issued_at = COALESCE(quotation_issued_at, NOW())';
                    }
                }
            }
            if ($canonicalStatus === 'under_repair') {
                $isBackOrderJob = array_key_exists('isBackOrder', $inputData) ? !empty($inputData['isBackOrder']) : !empty($jobRow['is_back_order']);
                if (!$isBackOrderJob) {
                    $overview = workOrderPartsOverview($con, $jobId);
                    $autoStatus = automaticPartsStatusFromOverview($overview);
                    if (in_array($autoStatus, ['pending_parts', 'partially_arrived'], true)) {
                        sendResponse(false, 'Repair cannot start while parts have stock shortage. Please wait for parts delivery or enable Back Order.', null, 409);
                    }
                }
                $effectiveBay = array_key_exists('bay', $inputData) ? $bay : ($jobRow['bay'] ?? null);
                $effectiveEstimatedOut = array_key_exists('estimatedOut', $inputData) ? $estimatedOut : ($jobRow['estimated_out'] ?? null);
                if (empty($effectiveBay)) {
                    sendResponse(false, 'Workshop Bay allocation is required before starting repair.', null, 400);
                }
                if (empty($effectiveEstimatedOut)) {
                    sendResponse(false, 'Expected Handover (ETA) is required before starting repair.', null, 400);
                }
            }
            
            if ($canonicalStatus === 'scheduled') {
                $updates[] = "status = 1";
                $updates[] = "checkin_at = NULL";
                $updates[] = "inspected_at = NULL";
                if (columnExists($con, 'job', 'quotation_issued_at')) $updates[] = "quotation_issued_at = NULL";
                $updates[] = "approved_at = NULL";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
            } elseif ($canonicalStatus === 'checked_in') {
                $updates[] = "status = 2";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = NULL";
                if (columnExists($con, 'job', 'quotation_issued_at')) $updates[] = "quotation_issued_at = NULL";
                $updates[] = "approved_at = NULL";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
            } elseif ($canonicalStatus === 'inspected') {
                $updates[] = "status = 3";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                if (columnExists($con, 'job', 'quotation_issued_at')) $updates[] = "quotation_issued_at = NULL";
                $updates[] = "approved_at = NULL";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
            } elseif ($canonicalStatus === 'quotation_issued') {
                if (!columnExists($con, 'job', 'quotation_issued_at')) {
                    sendResponse(false, 'Quotation lifecycle storage is unavailable. Apply migration 014_work_order_quotation_stage.sql.', null, 409);
                }
                $updates[] = "status = 3";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                $updates[] = "quotation_issued_at = COALESCE(quotation_issued_at, NOW())";
                $updates[] = "approved_at = NULL";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
            } elseif ($canonicalStatus === 'approved') {
                $updates[] = "status = 4";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                if ($currentCanonicalStatus === 'quotation_issued' && columnExists($con, 'job', 'quotation_issued_at')) {
                    $updates[] = "quotation_issued_at = COALESCE(quotation_issued_at, NOW())";
                }
                $updates[] = "approved_at = COALESCE(approved_at, NOW())";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
                if (columnExists($con, 'job', 'parts_status')) $updates[] = "parts_status = NULL";
            } elseif ($canonicalStatus === 'pending_parts') {
                $updates[] = "status = 5";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                $updates[] = "approved_at = COALESCE(approved_at, NOW())";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
                if (columnExists($con, 'job', 'parts_status')) {
                    $adminId = intval($_SESSION['admin_id'] ?? 0);
                    $updates[] = "parts_status = 'pending_parts'";
                    $updates[] = "parts_status_updated_at = NOW()";
                    $updates[] = 'parts_status_updated_by = ' . ($adminId > 0 ? $adminId : 'NULL');
                }
            } elseif ($canonicalStatus === 'parts_ready') {
                $updates[] = "status = 5";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                $updates[] = "approved_at = COALESCE(approved_at, NOW())";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = COALESCE(parts_ready_at, NOW())";
                if (columnExists($con, 'job', 'parts_status')) {
                    $adminId = intval($_SESSION['admin_id'] ?? 0);
                    $updates[] = "parts_status = 'parts_ready'";
                    $updates[] = "parts_expected_date = NULL";
                    $updates[] = "parts_status_updated_at = NOW()";
                    $updates[] = 'parts_status_updated_by = ' . ($adminId > 0 ? $adminId : 'NULL');
                }
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = NULL";
            } elseif ($canonicalStatus === 'under_repair') {
                $updates[] = "status = 6";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                $updates[] = "approved_at = COALESCE(approved_at, NOW())";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = COALESCE(parts_ready_at, NOW())";
                $updates[] = "completed_at = NULL";
                $updates[] = "collected_at = NULL";
                if (columnExists($con, 'job', 'under_repair_at')) $updates[] = "under_repair_at = COALESCE(under_repair_at, NOW())";
                if (columnExists($con, 'job', 'parts_status')) {
                    $adminId = intval($_SESSION['admin_id'] ?? 0);
                    $updates[] = "parts_status = 'parts_ready'";
                    $updates[] = "parts_expected_date = NULL";
                    $updates[] = "parts_status_updated_at = NOW()";
                    $updates[] = 'parts_status_updated_by = ' . ($adminId > 0 ? $adminId : 'NULL');
                }
            } elseif ($canonicalStatus === 'ready_for_collection') {
                $updates[] = "status = 10";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                $updates[] = "approved_at = COALESCE(approved_at, NOW())";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = COALESCE(parts_ready_at, NOW())";
                $updates[] = "completed_at = COALESCE(completed_at, NOW())";
                $updates[] = "collected_at = NULL";
            } elseif ($canonicalStatus === 'collected') {
                $updates[] = "status = 10";
                $updates[] = "priority = 'Normal'";
                $updates[] = "checkin_at = COALESCE(checkin_at, NOW())";
                $updates[] = "inspected_at = COALESCE(inspected_at, NOW())";
                $updates[] = "approved_at = COALESCE(approved_at, NOW())";
                if (columnExists($con, 'job', 'parts_ready_at')) $updates[] = "parts_ready_at = COALESCE(parts_ready_at, NOW())";
                $updates[] = "completed_at = COALESCE(completed_at, NOW())";
                $updates[] = "collected_at = COALESCE(collected_at, NOW())";
            }
        }
        
        if (array_key_exists('priority', $inputData)) {
            $updates[] = "priority = '$priority'";
        }
        if (array_key_exists('bay', $inputData)) {
            $updates[] = "bay = " . ($bay !== null ? "'" . mysqli_real_escape_string($con, $bay) . "'" : "NULL");
        }
        if (array_key_exists('estimatedOut', $inputData)) {
            if (columnExists($con, 'job', 'estimated_out')) {
                $updates[] = "estimated_out = " . ($estimatedOut !== null ? "'" . mysqli_real_escape_string($con, $estimatedOut) . "'" : "NULL");
            }
        }
        if (array_key_exists('checkinMileage', $inputData)) {
            $checkinMileageVal = $inputData['checkinMileage'] !== null && $inputData['checkinMileage'] !== '' && is_numeric($inputData['checkinMileage'])
                ? intval($inputData['checkinMileage'])
                : null;
            if ($checkinMileageVal !== null && $checkinMileageVal > 0 && intval($jobRow['vehicle_id'] ?? 0) > 0) {
                $vehId = intval($jobRow['vehicle_id']);
                $jobDate = $jobRow['checkin_at'] ?: $jobRow['created_at'];
                if ($jobDate) {
                    $priorRes = mysqli_query($con, "SELECT MAX(checkin_mileage) AS prior_m FROM job WHERE vehicle_id = $vehId AND id != $jobId AND COALESCE(checkin_at, created_at) < '$jobDate'");
                    if ($priorRes && $pRow = mysqli_fetch_assoc($priorRes)) {
                        $priorMileage = intval($pRow['prior_m']);
                        if ($priorMileage > 0 && $checkinMileageVal < $priorMileage) {
                            sendResponse(false, "Check-in mileage (" . number_format($checkinMileageVal) . " km) cannot be less than the prior service mileage (" . number_format($priorMileage) . " km).", null, 400);
                        }
                    }
                }
            }
            if (columnExists($con, 'job', 'checkin_mileage')) {
                $updates[] = "checkin_mileage = " . ($checkinMileageVal !== null ? strval($checkinMileageVal) : "NULL");
                if ($checkinMileageVal !== null && $checkinMileageVal > 0 && intval($jobRow['vehicle_id'] ?? 0) > 0) {
                    syncVehicleMileageFromCheckin($con, intval($jobRow['vehicle_id']), $checkinMileageVal, $jobId, $jobRow['work_order_no'], 'work_order_update', 'Work order check-in mileage adjustment');
                }
            }
        }
        if (array_key_exists('reportedProblem', $inputData) || array_key_exists('notes', $inputData)) {
            $notesVal = trim(strval($inputData['reportedProblem'] ?? $inputData['notes'] ?? ''));
            $notesSql = mysqli_real_escape_string($con, $notesVal);
            if (columnExists($con, 'job', 'reported_problem')) {
                $updates[] = "reported_problem = '$notesSql'";
            }
            if (columnExists($con, 'job', 'customer_notes')) {
                $updates[] = "customer_notes = '$notesSql'";
            }
        }
        if (array_key_exists('actualIssue', $inputData) || array_key_exists('actualProblem', $inputData)) {
            ensureColumn($con, 'job', 'actual_issue', 'TEXT NULL DEFAULT NULL');
            $actualIssueVal = trim(strval($inputData['actualIssue'] ?? $inputData['actualProblem'] ?? ''));
            $actualIssueSql = mysqli_real_escape_string($con, $actualIssueVal);
            $updates[] = "actual_issue = '$actualIssueSql'";
        }
        if (array_key_exists('reference', $inputData) || array_key_exists('partsReference', $inputData)) {
            $refVal = trim(strval($inputData['reference'] ?? $inputData['partsReference'] ?? ''));
            $refSql = mysqli_real_escape_string($con, $refVal);
            if (columnExists($con, 'job', 'reference')) {
                $updates[] = "reference = '$refSql'";
            }
            if (columnExists($con, 'job', 'parts_reference')) {
                $updates[] = "parts_reference = '$refSql'";
            }
        }
        if (empty($updates) && !array_key_exists('technicianIds', $inputData)) {
            sendResponse(false, 'No work order changes were provided.', null, 400);
        }
        $shouldSyncLastService = (
            in_array($canonicalStatus, ['ready_for_collection', 'collected'], true) &&
            (
                empty($jobRow['completed_at']) ||
                $jobRow['completed_at'] === '0000-00-00 00:00:00'
            )
        );
        
        mysqli_begin_transaction($con);
        try {
            $updateSql = "UPDATE job SET " . implode(', ', $updates) . " WHERE id = $jobId";
            if (!mysqli_query($con, $updateSql)) {
                throw new Exception('Failed to update work order: ' . mysqli_error($con), 500);
            }
            if ($shouldSyncLastService) {
                syncVehicleLastServiceFromWorkOrder(
                    $con,
                    intval($jobRow['vehicle_id'] ?? 0),
                    date('Y-m-d')
                );
            }
            $sourceBookingId = intval($jobRow['source_booking_id'] ?? 0);
            if (
                $canonicalStatus !== null &&
                $sourceBookingId > 0 &&
                tableExists($con, 'customer_appointment')
            ) {
                $bookingStatusColumn = firstColumn($con, 'customer_appointment', ['status']);
                if ($bookingStatusColumn) {
                    $linkedBookingStatus = $canonicalStatus === 'collected'
                        ? 'completed'
                        : ($canonicalStatus === 'scheduled' ? 'upcoming' : 'in_progress');
                    if (!mysqli_query(
                        $con,
                        "UPDATE customer_appointment
                         SET `$bookingStatusColumn` = '$linkedBookingStatus'
                         WHERE id = $sourceBookingId"
                    )) {
                        throw new Exception('Failed to synchronise booking status: ' . mysqli_error($con), 500);
                    }
                }
            }
            if (array_key_exists('technicianIds', $inputData)) {
                replaceJobAssignments($con, $jobId, $inputData['technicianIds']);
            }
            mysqli_commit($con);
            if ($canonicalStatus !== null) {
                $statusLabels = [
                    'scheduled' => 'Scheduled',
                    'checked_in' => 'Vehicle Checked In',
                    'inspected' => 'Inspection Completed',
                    'quotation_issued' => 'Quotation Issued',
                    'approved' => 'Repair Approved',
                    'parts_ready' => 'Parts Ready',
                    'under_repair' => 'Under Repair',
                    'ready_for_collection' => 'Ready for Collection',
                    'collected' => 'Completed / Collected'
                ];
                $statusLabel = $statusLabels[$canonicalStatus] ?? ucwords(str_replace('_', ' ', $canonicalStatus));
                $workOrderNumber = rowValue($jobRow, ['work_order_no'], 'WO-' . $jobId);
                if ($sourceBookingId > 0) {
                    notifyBookingCustomer(
                        $con,
                        $sourceBookingId,
                        'Service progress updated',
                        "$workOrderNumber is now $statusLabel."
                    );
                } else {
                    $contactId = intval($jobRow['customer_id'] ?? 0);
                    if ($contactId > 0) {
                        notifyVehicleCustomer(
                            $con,
                            intval($jobRow['vehicle_id'] ?? 0),
                            tableExists($con, 'customer') ? 'customer' : 'users',
                            intval($jobRow['company_id'] ?? 0),
                            $contactId,
                            'Service progress updated',
                            "$workOrderNumber is now $statusLabel.",
                            'booking',
                            'work_order',
                            'wo' . $jobId,
                            '/bookings'
                        );
                    }
                }
            }
            if (in_array($canonicalStatus, ['ready_for_collection', 'collected'], true)) {
                deductWorkOrderPartsInventory($con, $jobId);
            }
            sendResponse(true, 'Work order updated successfully');
        } catch (Exception $e) {
            mysqli_rollback($con);
            sendResponse(false, $e->getMessage(), null, $e->getCode() ?: 500);
        }
        break;



        default:
            sendResponse(false, "Invalid work order action", null, 400);
            break;
    }
}

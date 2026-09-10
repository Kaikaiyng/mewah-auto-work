<?php
// System Settings, Staff, Notifications & Audit Domain Module
// Extracted from api.php to improve maintainability and modularity

// --- toAdminNotificationType ---
function toAdminNotificationType($type) {
    $map = [
        'reminder' => 'Reminder',
        'booking' => 'Success',
        'parts' => 'Info',
        'system' => 'Info',
        'status_rollback' => 'Warning'
    ];
    return $map[$type] ?? 'Info';
}



// --- staff helpers ---
function normalizeStaffRole($role) {
    $value = strtolower(trim(preg_replace('/\s+/', ' ', strval($role))));
    $map = [
        'admin' => 'Admin',
        'administrator' => 'Admin',
        'head manager' => 'Head Manager',
        'manager' => 'Head Manager',
        'service advisor' => 'Head Manager',
        'advisor' => 'Head Manager',
        'receptionist' => 'Head Manager',
        'foreman' => 'Foreman',
        'technician' => 'Technician',
        'tech' => 'Technician',
        'mechanic' => 'Technician'
    ];
    return $map[$value] ?? trim(strval($role));
}

function staffColumns($con) {
    return [
        'name' => firstColumn($con, 'staff', ['name', 'staff_name', 'full_name', 'username']),
        'username' => firstColumn($con, 'staff', ['username', 'login_name']),
        'icNo' => firstColumn($con, 'staff', ['ic_no', 'ic_number', 'nric', 'identity_no', 'passport_no']),
        'departmentId' => firstColumn($con, 'staff', ['department_id', 'dept_id']),
        'email' => firstColumn($con, 'staff', ['email', 'email_address']),
        'phone' => firstColumn($con, 'staff', ['phone', 'phone_no', 'mobile', 'hp_no', 'contact_no']),
        'role' => firstColumn($con, 'staff', ['role', 'position', 'type', 'designation', 'job_title', 'maw_role']),
        'status' => firstColumn($con, 'staff', ['status', 'active', 'is_active', 'current_status', 'currentStatus', 'maw_status']),
        'password' => firstColumn($con, 'staff', ['password', 'password_hash'])
    ];
}

function staffStatusForStorage($con, $column, $status) {
    if (!$column) return null;
    $active = strtolower(trim(strval($status))) !== 'inactive';
    if (in_array($column, ['active', 'is_active'], true)) {
        return $active ? '1' : '0';
    }
    return $active ? 'Active' : 'Inactive';
}

function staffRecordById($con, $staffId) {
    if ($staffId <= 0 || !tableExists($con, 'staff')) return null;
    $result = mysqli_query($con, "SELECT * FROM staff WHERE id = " . intval($staffId) . " LIMIT 1");
    return $result && mysqli_num_rows($result) > 0 ? mysqli_fetch_assoc($result) : null;
}

function staffPermissionRole($role) {
    $normalized = normalizeStaffRole($role);
    if ($normalized === 'Admin') return 'admin';
    if ($normalized === 'Head Manager') return 'manager';
    if ($normalized === 'Foreman') return 'editor';
    if ($normalized === 'Technician') return 'editor';
    return '';
}

function currentAdminRoleName($con = null) {
    $sessionRole = strtolower(trim(strval($_SESSION['admin_role'] ?? '')));
    if ($sessionRole === 'admin') return 'Admin';
    if ($sessionRole === 'manager') return 'Head Manager';
    if ($sessionRole === 'staff') {
        $staffId = intval($_SESSION['admin_id'] ?? 0);
        if ($con && $staffId > 0 && tableExists($con, 'staff')) {
            $columns = staffColumns($con);
            $staff = staffRecordById($con, $staffId);
            $resolvedRole = normalizeStaffRole($staff[$columns['role']] ?? '');
            if ($resolvedRole) return $resolvedRole;
        }
        return normalizeStaffRole($_SESSION['admin_staff_role'] ?? '');
    }
    if ($sessionRole === 'editor') return 'Technician';
    return 'Admin';
}



// --- vehicle/customer notifications ---
function createVehicleReviewNotification($con, $companyId, $contactId, $vehicleId, $regNo, $decision, $reason = '') {
    $table = tableExists($con, 'customer_notification')
        ? 'customer_notification'
        : (tableExists($con, 'notifications') ? 'notifications' : null);
    if (!$table) return false;

    $approved = $decision === 'approved';
    $title = $approved ? 'Vehicle approved' : 'Vehicle verification rejected';
    $message = $approved
        ? "$regNo has been approved and can now be used for service bookings."
        : "$regNo was not approved." . ($reason !== '' ? " Reason: $reason" : '');
    $values = [
        'title' => $title,
        'message' => $message,
        'type' => 'system',
        'channel' => 'Push Notification',
        'company_id' => intval($companyId),
        $table === 'customer_notification' ? 'customer_id' : 'user_id' => intval($contactId),
        'is_read' => 0,
        'related_record_type' => 'vehicle',
        'related_record_id' => 'v' . intval($vehicleId),
        'action_route' => '/vehicle/v' . intval($vehicleId)
    ];
    $candidateColumns = [
        'title' => ['title', 'subject'],
        'message' => ['message', 'description', 'content'],
        'type' => ['type'],
        'channel' => ['channel'],
        'company_id' => ['company_id'],
        'customer_id' => ['customer_id'],
        'user_id' => ['user_id'],
        'is_read' => ['is_read', 'read_status'],
        'related_record_type' => ['related_record_type'],
        'related_record_id' => ['related_record_id'],
        'action_route' => ['action_route']
    ];
    $columns = [];
    $sqlValues = [];
    foreach ($values as $key => $value) {
        $column = firstColumn($con, $table, $candidateColumns[$key] ?? [$key]);
        if (!$column) continue;
        $columns[] = "`$column`";
        $sqlValues[] = is_int($value)
            ? strval($value)
            : "'" . mysqli_real_escape_string($con, $value) . "'";
    }
    if (columnExists($con, $table, 'created_at')) {
        $columns[] = '`created_at`';
        $sqlValues[] = 'NOW()';
    }
    if (count($columns) < 2) return false;
    return mysqli_query(
        $con,
        "INSERT INTO `$table` (" . implode(', ', $columns) . ') VALUES (' . implode(', ', $sqlValues) . ')'
    );
}

function createCustomerRecordNotification(
    $con,
    $source,
    $companyId,
    $contactId,
    $title,
    $message,
    $type,
    $relatedRecordType,
    $relatedRecordId,
    $actionRoute
) {
    $notificationSettingKey = null;
    if (in_array(strtolower(strval($type)), ['booking', 'work_order'], true)) {
        $notificationSettingKey = 'notifications.booking_updates';
    } elseif (stripos(strval($title), 'insurance') !== false) {
        $notificationSettingKey = 'notifications.insurance_reminders';
    } elseif (stripos(strval($title), 'service reminder') !== false) {
        $notificationSettingKey = 'notifications.service_reminders';
    }
    if ($notificationSettingKey && systemSettingValue($con, $notificationSettingKey) !== '1') return false;

    $table = $source === 'customer' && tableExists($con, 'customer_notification')
        ? 'customer_notification'
        : (tableExists($con, 'notifications')
            ? 'notifications'
            : (tableExists($con, 'customer_notification') ? 'customer_notification' : null));
    if (!$table) return false;

    $values = [
        'title' => $title,
        'message' => $message,
        'type' => $type,
        'channel' => 'Push Notification',
        'company_id' => intval($companyId),
        $table === 'customer_notification' ? 'customer_id' : 'user_id' => intval($contactId),
        'is_read' => 0,
        'related_record_type' => $relatedRecordType,
        'related_record_id' => $relatedRecordId,
        'action_route' => $actionRoute
    ];
    $candidateColumns = [
        'title' => ['title', 'subject'],
        'message' => ['message', 'description', 'content'],
        'type' => ['type'],
        'channel' => ['channel'],
        'company_id' => ['company_id'],
        'customer_id' => ['customer_id'],
        'user_id' => ['user_id'],
        'is_read' => ['is_read', 'read_status'],
        'related_record_type' => ['related_record_type'],
        'related_record_id' => ['related_record_id'],
        'action_route' => ['action_route']
    ];
    $columns = [];
    $sqlValues = [];
    foreach ($values as $key => $value) {
        $column = firstColumn($con, $table, $candidateColumns[$key] ?? [$key]);
        if (!$column) continue;
        $columns[] = "`$column`";
        $sqlValues[] = is_int($value)
            ? strval($value)
            : "'" . mysqli_real_escape_string($con, $value) . "'";
    }
    if (columnExists($con, $table, 'created_at')) {
        $columns[] = '`created_at`';
        $sqlValues[] = 'NOW()';
    }
    if (count($columns) < 2) return false;

    return mysqli_query(
        $con,
        "INSERT INTO `$table` (" . implode(', ', $columns) . ') VALUES (' . implode(', ', $sqlValues) . ')'
    );
}

function createAdminSystemNotification(
    $con,
    $title,
    $message,
    $type = 'system',
    $relatedRecordType = 'vehicle',
    $relatedRecordId = null,
    $actionRoute = null
) {
    $table = tableExists($con, 'customer_notification')
        ? 'customer_notification'
        : (tableExists($con, 'notifications') ? 'notifications' : null);
    if (!$table) return false;

    $values = [
        'title' => $title,
        'message' => $message,
        'type' => $type,
        'channel' => 'Push Notification',
        'company_id' => 0,
        $table === 'customer_notification' ? 'customer_id' : 'user_id' => 0,
        'is_read' => 0,
        'related_record_type' => $relatedRecordType,
        'related_record_id' => $relatedRecordId,
        'action_route' => $actionRoute
    ];
    $candidateColumns = [
        'title' => ['title', 'subject'],
        'message' => ['message', 'description', 'content'],
        'type' => ['type'],
        'channel' => ['channel'],
        'company_id' => ['company_id'],
        'customer_id' => ['customer_id'],
        'user_id' => ['user_id'],
        'is_read' => ['is_read', 'read_status'],
        'related_record_type' => ['related_record_type'],
        'related_record_id' => ['related_record_id'],
        'action_route' => ['action_route']
    ];
    $columns = [];
    $sqlValues = [];
    foreach ($values as $key => $value) {
        $column = firstColumn($con, $table, $candidateColumns[$key] ?? [$key]);
        if (!$column) continue;
        if ($value === null) continue;
        $columns[] = "`$column`";
        $sqlValues[] = is_int($value)
            ? strval($value)
            : "'" . mysqli_real_escape_string($con, strval($value)) . "'";
    }
    if (columnExists($con, $table, 'created_at')) {
        $columns[] = '`created_at`';
        $sqlValues[] = 'NOW()';
    }
    if (count($columns) < 2) return false;

    return @mysqli_query(
        $con,
        "INSERT INTO `$table` (" . implode(', ', $columns) . ') VALUES (' . implode(', ', $sqlValues) . ')'
    );
}

function vehicleCustomerTarget($con, $vehicleId, $fallbackSource, $fallbackCompanyId, $fallbackContactId) {
    $vehicleId = intval($vehicleId);
    $target = [
        'source' => $fallbackSource,
        'companyId' => intval($fallbackCompanyId),
        'contactId' => intval($fallbackContactId)
    ];
    if ($vehicleId <= 0) return $target;
    $table = unifiedVehicleTable($con);
    if (!$table) return $target;
    $contactColumn = $table === 'customer_vehicle'
        ? firstColumn($con, $table, ['customer_id', 'user_id', 'owner_id'])
        : firstColumn($con, $table, ['user_id', 'customer_id', 'owner_id']);
    if (!$contactColumn) return $target;
    $companySelect = columnExists($con, $table, 'company_id') ? 'company_id' : '0 AS company_id';
    $result = mysqli_query($con, "SELECT `$contactColumn` AS contact_id, $companySelect FROM `$table` WHERE id = $vehicleId LIMIT 1");
    $vehicle = $result ? mysqli_fetch_assoc($result) : null;
    $contactId = intval($vehicle['contact_id'] ?? 0);
    if ($contactId > 0) {
        $target['source'] = $table === 'customer_vehicle' ? 'customer' : 'users';
        $target['contactId'] = $contactId;
    }
    if (intval($vehicle['company_id'] ?? 0) > 0) $target['companyId'] = intval($vehicle['company_id']);
    return $target;
}

function notifyVehicleCustomer($con, $vehicleId, $fallbackSource, $companyId, $fallbackContactId, $title, $message, $type, $relatedRecordType, $relatedRecordId, $actionRoute) {
    $companyId = intval($companyId);
    if ($companyId <= 0 && $vehicleId > 0) {
        $vTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
        $vRes = mysqli_query($con, "SELECT company_id FROM `$vTable` WHERE id = " . intval($vehicleId) . " LIMIT 1");
        if ($vRes && $vRow = mysqli_fetch_assoc($vRes)) {
            $companyId = intval($vRow['company_id'] ?? 0);
        }
    }
    if ($companyId > 0) {
        $companyUserTable = tableExists($con, 'customer') ? 'customer' : 'users';
        $activeCol = columnExists($con, $companyUserTable, 'is_active') ? ' AND is_active = 1' : '';
        $res = mysqli_query($con, "SELECT id FROM `$companyUserTable` WHERE company_id = $companyId$activeCol ORDER BY id ASC");
        $notifiedAny = false;
        while ($res && $uRow = mysqli_fetch_assoc($res)) {
            $cId = intval($uRow['id']);
            if ($cId > 0) {
                createCustomerRecordNotification(
                    $con, $companyUserTable, $companyId, $cId,
                    $title, $message, $type, $relatedRecordType, $relatedRecordId, $actionRoute
                );
                $notifiedAny = true;
            }
        }
        if ($notifiedAny) return true;
    }
    $target = vehicleCustomerTarget($con, $vehicleId, $fallbackSource, $companyId, $fallbackContactId);
    if ($target['contactId'] <= 0) return false;
    return createCustomerRecordNotification(
        $con, $target['source'], $target['companyId'], $target['contactId'],
        $title, $message, $type, $relatedRecordType, $relatedRecordId, $actionRoute
    );
}



// --- legacyNotifications ---
function legacyNotifications($con) {
    if (!tableExists($con, 'customer_notification')) {
        return null;
    }

    $notifications = [];
    $hasCustomerJoin = tableExists($con, 'customer') && columnExists($con, 'customer_notification', 'customer_id');
    $hasCompanyJoin = tableExists($con, 'company') && columnExists($con, 'customer_notification', 'company_id');
    $customerJoin = $hasCustomerJoin
        ? 'LEFT JOIN customer notification_customer ON notification_customer.id = customer_notification.customer_id'
        : '';
    $companyJoin = $hasCompanyJoin
        ? 'LEFT JOIN company notification_company ON notification_company.id = customer_notification.company_id'
        : '';
    $customerSelect = $hasCustomerJoin
        ? 'notification_customer.name AS notification_customer_name'
        : 'NULL AS notification_customer_name';
    $companySelect = $hasCompanyJoin
        ? 'notification_company.name AS notification_company_name'
        : 'NULL AS notification_company_name';
    $result = mysqli_query(
        $con,
        "SELECT customer_notification.*,
                $customerSelect,
                $companySelect
         FROM customer_notification
         $customerJoin
         $companyJoin
         ORDER BY customer_notification.id DESC"
    );
    while ($result && $row = mysqli_fetch_assoc($result)) {
        if (strtolower(strval(rowValue($row, ['type'], 'system'))) === 'status_rollback') continue;
        $dateValue = rowValue($row, ['date', 'created_at'], date('Y-m-d H:i:s'));
        $recipient = trim(strval($row['notification_customer_name'] ?? ''));
        if ($recipient === '') $recipient = trim(strval($row['notification_company_name'] ?? ''));
        if ($recipient === '') $recipient = rowValue($row, ['customer_name', 'recipient'], 'Customer');
        $notifications[] = [
            'id' => intval(rowValue($row, ['id'], 0)),
            'title' => rowValue($row, ['title', 'subject'], 'Notification'),
            'message' => rowValue($row, ['message', 'description', 'content'], ''),
            'recipient' => $recipient,
            'type' => toAdminNotificationType(strtolower(rowValue($row, ['type'], 'system'))),
            'status' => 'Sent',
            'date' => date('Y-m-d H:i', strtotime($dateValue) ?: time()),
            'channel' => rowValue($row, ['channel'], 'Push Notification')
        ];
    }

    return $notifications;
}



// --- customerRelatedVehicleId & customerNotifications ---
function customerRelatedVehicleId($con, $recordType, $recordId) {
    $type = strtolower(trim(strval($recordType)));
    $id = intval(preg_replace('/\D+/', '', strval($recordId)));
    if ($id <= 0) return 0;
    if ($type === 'vehicle') return $id;
    if (in_array($type, ['work_order', 'quotation'], true) && tableExists($con, 'job')) {
        return intval(scalarQuery($con, "SELECT vehicle_id FROM job WHERE id = $id LIMIT 1", 'vehicle_id', 0));
    }
    if ($type === 'booking') {
        $table = tableExists($con, 'customer_appointment') ? 'customer_appointment' : 'bookings';
        $vehicleColumn = firstColumn($con, $table, ['vehicle_id']);
        if ($vehicleColumn) return intval(scalarQuery($con, "SELECT `$vehicleColumn` AS vehicle_id FROM `$table` WHERE id = $id LIMIT 1", 'vehicle_id', 0));
    }
    if ($type === 'invoice' && tableExists($con, 'work_order_invoice') && tableExists($con, 'job')) {
        return intval(scalarQuery($con, "SELECT j.vehicle_id FROM work_order_invoice wi JOIN job j ON j.id = wi.work_order_id WHERE wi.id = $id LIMIT 1", 'vehicle_id', 0));
    }
    return 0;
}

function customerNotifications($con, $auth) {
    $companyId = intval($auth['companyId']);
    $userId = intval($auth['userId']);
    $table = tableExists($con, 'customer_notification') ? 'customer_notification' : 'notifications';
    if (!tableExists($con, $table)) return [];
    if (!empty($auth['isSuperadmin'])) {
        $where = '1 = 1';
    } elseif (columnExists($con, $table, 'customer_id') && $auth['source'] === 'customer') {
        $where = "customer_id = $userId";
    } elseif ($table === 'notifications' && columnExists($con, $table, 'user_id') && $auth['source'] === 'users') {
        $where = "user_id = $userId";
    } elseif (columnExists($con, $table, 'company_id')) {
        $where = "company_id = $companyId";
    } else {
        return [];
    }
    $result = mysqli_query($con, "SELECT * FROM `$table` WHERE $where ORDER BY id DESC");
    $notifications = [];
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    while ($result && $row = mysqli_fetch_assoc($result)) {
        if ($vehicleScope['scoped']) {
            $recordType = strtolower(strval(rowValue($row, ['related_record_type'], '')));
            $notificationType = strtolower(strval(rowValue($row, ['type'], 'system')));
            $protectedTypes = ['vehicle', 'booking', 'work_order', 'quotation', 'invoice'];
            if (in_array($recordType, $protectedTypes, true)) {
                $relatedVehicleId = customerRelatedVehicleId($con, $recordType, rowValue($row, ['related_record_id'], ''));
                if (!customerVehicleIsAccessible($vehicleScope, $relatedVehicleId)) continue;
            } elseif (in_array($notificationType, ['booking', 'work_order', 'invoice'], true)) {
                continue;
            }
        }
        $notifications[] = [
            'id' => 'n' . intval($row['id']),
            'title' => rowValue($row, ['title', 'subject'], 'Notification'),
            'message' => rowValue($row, ['message', 'description', 'content'], ''),
            'date' => rowValue($row, ['created_at', 'date'], date('Y-m-d H:i:s')),
            'isRead' => boolval(rowValue($row, ['is_read', 'read_status'], 0)),
            'type' => strtolower(rowValue($row, ['type'], 'system')),
            'relatedRecordType' => rowValue($row, ['related_record_type'], null),
            'relatedRecordId' => rowValue($row, ['related_record_id'], null),
            'actionRoute' => rowValue($row, ['action_route'], null)
        ];
    }
    return $notifications;
}




// --- system settings helpers ---
function requireSystemSettingsSchema($con) {
    if (!tableExists($con, 'system_setting') || !tableExists($con, 'service_type')) {
        sendResponse(false, 'System Settings storage is unavailable. Apply migration 016_system_settings.sql.', null, 409);
    }
}

function systemSettingDefaults() {
    return [
        'company.legal_name' => 'MEWAH AUTOWORKS SDN BHD',
        'company.registration_no' => 'YOUR-REGISTRATION-NO',
        'company.group_name' => '',
        'company.address' => 'Configure your workshop address',
        'company.phone' => '+60 00-000 0000',
        'company.email' => 'contact@example.com',
        'company.operating_hours' => 'Monday - Saturday, 8:00 AM - 6:00 PM',
        'support.phone' => '+60 00-000 0000',
        'support.whatsapp' => '+60 00-000 0000',
        'support.email' => 'contact@example.com',
        'support.operating_hours' => 'Monday - Saturday, 8:00 AM - 6:00 PM',
        'pricing.tax_rate' => '0',
        'pricing.labor_rate' => '80',
        'pricing.parts_markup' => '25',
        'pricing.automatic_rounding' => '1',
        'notifications.service_reminders' => '1',
        'notifications.insurance_reminders' => '1',
        'notifications.booking_updates' => '1',
        'notifications.low_stock_alerts' => '1'
    ];
}

function systemSettingValue($con, $key) {
    $defaults = systemSettingDefaults();
    if (!tableExists($con, 'system_setting')) return $defaults[$key] ?? '';
    $escapedKey = mysqli_real_escape_string($con, $key);
    $result = mysqli_query($con, "SELECT setting_value FROM system_setting WHERE setting_key = '$escapedKey' LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    return $row ? strval($row['setting_value'] ?? '') : ($defaults[$key] ?? '');
}

function saveSystemSettingValues($con, $values) {
    $adminId = intval($_SESSION['admin_id'] ?? 0);
    foreach ($values as $key => $value) {
        $escapedKey = mysqli_real_escape_string($con, strval($key));
        $escapedValue = mysqli_real_escape_string($con, strval($value));
        if (!mysqli_query($con, "INSERT INTO system_setting (setting_key, setting_value, updated_by) VALUES ('$escapedKey', '$escapedValue', $adminId) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()")) {
            throw new Exception(mysqli_error($con), 500);
        }
    }
}

function systemSettingsPayload($con) {
    $serviceTypes = [];
    if (tableExists($con, 'service_type')) {
        $result = mysqli_query($con, 'SELECT * FROM service_type ORDER BY sort_order, name, id');
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $serviceTypes[] = [
                'id' => intval($row['id']),
                'name' => $row['name'],
                'description' => $row['description'] ?? '',
                'basePrice' => floatval($row['base_price']),
                'enabled' => boolval($row['is_enabled']),
                'sortOrder' => intval($row['sort_order'])
            ];
        }
    }
    return [
        'company' => [
            'legalName' => systemSettingValue($con, 'company.legal_name'),
            'registrationNo' => systemSettingValue($con, 'company.registration_no'),
            'groupName' => systemSettingValue($con, 'company.group_name'),
            'address' => systemSettingValue($con, 'company.address'),
            'phone' => systemSettingValue($con, 'company.phone'),
            'email' => systemSettingValue($con, 'company.email'),
            'operatingHours' => systemSettingValue($con, 'company.operating_hours')
        ],
        'support' => [
            'phone' => systemSettingValue($con, 'support.phone'),
            'whatsapp' => systemSettingValue($con, 'support.whatsapp'),
            'email' => systemSettingValue($con, 'support.email'),
            'operatingHours' => systemSettingValue($con, 'support.operating_hours')
        ],
        'pricing' => [
            'taxRate' => floatval(systemSettingValue($con, 'pricing.tax_rate')),
            'laborRate' => floatval(systemSettingValue($con, 'pricing.labor_rate')),
            'partsMarkup' => floatval(systemSettingValue($con, 'pricing.parts_markup')),
            'automaticRounding' => systemSettingValue($con, 'pricing.automatic_rounding') === '1'
        ],
        'notifications' => [
            'serviceReminders' => systemSettingValue($con, 'notifications.service_reminders') === '1',
            'insuranceReminders' => systemSettingValue($con, 'notifications.insurance_reminders') === '1',
            'bookingUpdates' => systemSettingValue($con, 'notifications.booking_updates') === '1',
            'lowStockAlerts' => systemSettingValue($con, 'notifications.low_stock_alerts') === '1'
        ],
        'serviceTypes' => $serviceTypes
    ];
}


function handleSettingsRoute($con, $mode, $inputData) {
    switch ($mode) {
        // --- audit trail & logs ---
    case 'admin-audit-trail':
        if (!isSuperAdminSession()) {
            sendResponse(false, 'Forbidden: Audit Trail is restricted to Super Admin.', null, 403);
        }
        requireAdminAuditSchema($con);
        $items = [];
        $result = mysqli_query($con, "SELECT * FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 1000");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $metadata = json_decode(strval($row['metadata_json'] ?? ''), true);
            $items[] = [
                'id' => intval($row['id']),
                'action' => $row['action'],
                'category' => $row['category'],
                'entityType' => $row['entity_type'] ?? '',
                'entityId' => $row['entity_id'] ?? '',
                'entityLabel' => $row['entity_label'] ?? '',
                'description' => $row['description'],
                'metadata' => is_array($metadata) ? $metadata : [],
                'actorId' => intval($row['actor_id'] ?? 0),
                'actorName' => $row['actor_name'] ?: 'System',
                'actorRole' => $row['actor_role'] ?: 'Admin',
                'actorSource' => $row['actor_source'] ?? '',
                'ipAddress' => $row['ip_address'] ?? '',
                'userAgent' => $row['user_agent'] ?? '',
                'createdAt' => $row['created_at']
            ];
        }
        $today = date('Y-m-d');
        $statsResult = mysqli_query($con, "SELECT COUNT(*) AS total, SUM(DATE(created_at) = '$today') AS today_count, COUNT(DISTINCT CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN actor_id END) AS active_actors, SUM(category = 'Security & Admin') AS security_count FROM admin_audit_log");
        $stats = $statsResult ? mysqli_fetch_assoc($statsResult) : [];
        sendResponse(true, 'Super Admin audit trail retrieved', [
            'items' => $items,
            'stats' => [
                'total' => intval($stats['total'] ?? 0),
                'today' => intval($stats['today_count'] ?? 0),
                'activeActors' => intval($stats['active_actors'] ?? 0),
                'securityEvents' => intval($stats['security_count'] ?? 0)
            ]
        ]);
        break;

    case 'admin-app-logs':
        if (!isSuperAdminSession()) {
            sendResponse(false, 'Forbidden: Application Logs are restricted to Super Admin.', null, 403);
        }
        $logsDir = is_dir(dirname(__DIR__) . '/storage/logs') ? dirname(__DIR__) . '/storage/logs' : __DIR__ . '/storage/logs';
        $availableFiles = [];
        if (is_dir($logsDir)) {
            foreach (glob($logsDir . '/app-*.log') as $f) {
                $basename = basename($f);
                preg_match('/app-(\d{4}-\d{2})\.log/', $basename, $m);
                if ($m) {
                    $lineCount = 0;
                    $fh = fopen($f, 'r');
                    while ($fh && !feof($fh)) { if (fgets($fh) !== false) $lineCount++; }
                    if ($fh) fclose($fh);
                    $availableFiles[] = ['month' => $m[1], 'sizeBytes' => intval(filesize($f)), 'lines' => $lineCount];
                }
            }
            usort($availableFiles, function ($a, $b) { return strcmp($b['month'], $a['month']); });
        }
        $requestedMonth = preg_replace('/[^0-9\-]/', '', strval($_GET['month'] ?? $inputData['month'] ?? ($availableFiles[0]['month'] ?? date('Y-m'))));
        $levelFilter = strtoupper(trim(strval($_GET['level'] ?? $inputData['level'] ?? 'ALL')));
        $search = strtolower(trim(strval($_GET['search'] ?? $inputData['search'] ?? '')));
        $page = max(1, intval($_GET['page'] ?? $inputData['page'] ?? 1));
        $perPage = 100;
        $logFile = $logsDir . '/app-' . $requestedMonth . '.log';
        $allEntries = [];
        $levelCounts = ['total' => 0, 'fatal' => 0, 'error' => 0, 'warn' => 0, 'info' => 0];
        if (is_file($logFile)) {
            $fh = fopen($logFile, 'r');
            while ($fh && !feof($fh)) {
                $line = fgets($fh);
                if ($line === false) break;
                $line = trim($line);
                if ($line === '') continue;
                $decoded = json_decode($line, true);
                if (!is_array($decoded)) continue;
                $entryLevel = strtoupper(strval($decoded['level'] ?? 'INFO'));
                $levelCounts['total']++;
                $lowerKey = strtolower($entryLevel);
                if (isset($levelCounts[$lowerKey])) {
                    $levelCounts[$lowerKey]++;
                }
                if ($levelFilter !== 'ALL' && $entryLevel !== $levelFilter) continue;
                if ($search !== '' && stripos(json_encode($decoded), $search) === false) continue;
                $allEntries[] = $decoded;
            }
            if ($fh) fclose($fh);
            $allEntries = array_reverse($allEntries);
        }
        $total = count($allEntries);
        
        $systemHealth = [
            'phpVersion' => PHP_VERSION,
            'serverTime' => date('Y-m-d H:i:s T'),
            'memoryUsage' => round(memory_get_usage(true) / 1024 / 1024, 2) . ' MB',
            'memoryLimit' => ini_get('memory_limit') ?: '256M',
            'mysqlConnected' => $con ? true : false,
            'mysqlVersion' => $con ? mysqli_get_server_info($con) : 'N/A',
            'logsDirWritable' => is_dir($logsDir) && is_writable($logsDir),
            'logFileExists' => is_file($logFile),
            'logFileSize' => is_file($logFile) ? intval(filesize($logFile)) : 0,
        ];

        // Download raw log if requested
        if (!empty($_GET['download']) || !empty($inputData['download'])) {
            if (is_file($logFile)) {
                header('Content-Type: text/plain; charset=utf-8');
                header('Content-Disposition: attachment; filename="app-' . $requestedMonth . '.log"');
                header('Content-Length: ' . filesize($logFile));
                readfile($logFile);
                exit;
            } else {
                sendResponse(false, 'No log file found for month ' . $requestedMonth, null, 404);
            }
        }

        sendResponse(true, 'Application logs retrieved', [
            'availableFiles' => $availableFiles,
            'month' => $requestedMonth,
            'entries' => array_slice($allEntries, ($page - 1) * $perPage, $perPage),
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => max(1, (int) ceil($total / $perPage))
            ],
            'levelCounts' => $levelCounts,
            'systemHealth' => $systemHealth
        ]);
        break;

        // Legacy implementation retained below for rollback reference. The
        // normalized analytics response above is the active implementation.
        if (tableExists($con, 'customer')) {
            $legacyRecent = legacyBookings($con) ?: [];
            
            // 1. Total Customers
            $currCustomers = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM customer", 'total', 0));
            $prevCustomers = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM customer WHERE created_at < DATE_FORMAT(NOW(), '%Y-%m-01')", 'total', 0));
            $customerChange = calculateChange($currCustomers, $prevCustomers);
            
            // 2. Today's Bookings
            $todayBookings = 0;
            $yesterdayBookings = 0;
            if (tableExists($con, 'customer_appointment')) {
                $todayBookings = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM customer_appointment WHERE DATE(appointment_at) = CURDATE()", 'total', 0));
                $yesterdayBookings = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM customer_appointment WHERE DATE(appointment_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)", 'total', 0));
            }
            $bookingsChange = calculateChange($todayBookings, $yesterdayBookings);
            
            // 3. Work Order Status Counts (reusing canonical status SQL)
            $statusCounts = [
                'scheduled' => 0,
                'checked_in' => 0,
                'inspected' => 0,
                'quotation_issued' => 0,
                'approved' => 0,
                'parts_ready' => 0,
                'under_repair' => 0,
                'ready_for_collection' => 0,
                'collected' => 0
            ];
            if (tableExists($con, 'job')) {
                $statusSql = getCanonicalStatusSql($con);
                $cQuery = "SELECT 
                    SUM(CASE WHEN ($statusSql) = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
                    SUM(CASE WHEN ($statusSql) = 'checked_in' THEN 1 ELSE 0 END) AS checked_in,
                    SUM(CASE WHEN ($statusSql) = 'inspected' THEN 1 ELSE 0 END) AS inspected,
                    SUM(CASE WHEN ($statusSql) = 'quotation_issued' THEN 1 ELSE 0 END) AS quotation_issued,
                    SUM(CASE WHEN ($statusSql) = 'approved' THEN 1 ELSE 0 END) AS approved,
                    SUM(CASE WHEN ($statusSql) = 'parts_ready' THEN 1 ELSE 0 END) AS parts_ready,
                    SUM(CASE WHEN ($statusSql) = 'under_repair' THEN 1 ELSE 0 END) AS under_repair,
                    SUM(CASE WHEN ($statusSql) = 'ready_for_collection' THEN 1 ELSE 0 END) AS ready_for_collection,
                    SUM(CASE WHEN ($statusSql) = 'collected' THEN 1 ELSE 0 END) AS collected
                    FROM job";
                $cRes = mysqli_query($con, $cQuery);
                if ($cRes) {
                    $cRow = mysqli_fetch_assoc($cRes);
                    foreach ($statusCounts as $k => $v) {
                        $statusCounts[$k] = intval($cRow[$k] ?? 0);
                    }
                }
            }
            
            sendResponse(true, 'Admin dashboard retrieved', [
                'stats' => [
                    'totalCustomers' => $currCustomers,
                    'totalCustomersChange' => $customerChange['change'],
                    'totalCustomersTrend' => $customerChange['trend'],
                    'todayBookings' => $todayBookings,
                    'todayBookingsChange' => $bookingsChange['change'],
                    'todayBookingsTrend' => $bookingsChange['trend'],
                    'workOrderStatusCounts' => $statusCounts
                ],
                'recentBookings' => array_slice($legacyRecent, 0, 5)
            ]);
            break;
        }

        $stats = [
            'totalCustomers' => 0,
            'totalCustomersChange' => '0%',
            'totalCustomersTrend' => 'neutral',
            'todayBookings' => 0,
            'todayBookingsChange' => '0%',
            'todayBookingsTrend' => 'neutral',
            'pendingOrders' => 0,
            'pendingOrdersChange' => '0%',
            'pendingOrdersTrend' => 'neutral',
            'monthRevenue' => 0,
            'monthRevenueChange' => '0%',
            'monthRevenueTrend' => 'neutral'
        ];

        if (!tableExists($con, 'users') || !tableExists($con, 'bookings')) {
            sendResponse(true, 'Admin dashboard retrieved', [
                'stats' => $stats,
                'recentBookings' => []
            ]);
            break;
        }

        // 1. Total Customers
        $currCustomers = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM users WHERE role = 'customer'", 'total', 0));
        $prevCustomers = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM users WHERE role = 'customer' AND created_at < DATE_FORMAT(NOW(), '%Y-%m-01')", 'total', 0));
        $customerChange = calculateChange($currCustomers, $prevCustomers);

        // 2. Today's Bookings
        $todayBookings = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM bookings WHERE order_type = 'service' AND DATE(service_date) = CURDATE()", 'total', 0));
        $yesterdayBookings = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM bookings WHERE order_type = 'service' AND DATE(service_date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)", 'total', 0));
        $bookingsChange = calculateChange($todayBookings, $yesterdayBookings);

        // 3. Pending Orders
        $pendingOrders = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM bookings WHERE order_type = 'parts' AND status IN ('pending', 'upcoming', 'ready')", 'total', 0));
        $currParts = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM bookings WHERE order_type = 'parts' AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())", 'total', 0));
        $prevParts = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM bookings WHERE order_type = 'parts' AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))", 'total', 0));
        $ordersChange = calculateChange($currParts, $prevParts);

        // 4. Month Revenue
        $currRevenue = floatval(scalarQuery($con, "SELECT COALESCE(SUM(total_price), 0) AS total FROM bookings WHERE payment_status = 'paid' AND MONTH(service_date) = MONTH(CURDATE()) AND YEAR(service_date) = YEAR(CURDATE())", 'total', 0));
        $prevRevenue = floatval(scalarQuery($con, "SELECT COALESCE(SUM(total_price), 0) AS total FROM bookings WHERE payment_status = 'paid' AND MONTH(service_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(service_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))", 'total', 0));
        $revenueChange = calculateChange($currRevenue, $prevRevenue);

        $stats = [
            'totalCustomers' => $currCustomers,
            'totalCustomersChange' => $customerChange['change'],
            'totalCustomersTrend' => $customerChange['trend'],
            'todayBookings' => $todayBookings,
            'todayBookingsChange' => $bookingsChange['change'],
            'todayBookingsTrend' => $bookingsChange['trend'],
            'pendingOrders' => $pendingOrders,
            'pendingOrdersChange' => $ordersChange['change'],
            'pendingOrdersTrend' => $ordersChange['trend'],
            'monthRevenue' => $currRevenue,
            'monthRevenueChange' => $revenueChange['change'],
            'monthRevenueTrend' => $revenueChange['trend']
        ];

        $recentBookings = [];
        $query = "SELECT b.*, u.name AS customer_name, v.equipment, v.brand, v.model
                  FROM bookings b
                  JOIN users u ON b.user_id = u.id
                  LEFT JOIN vehicles v ON b.vehicle_id = v.id
                  WHERE b.order_type = 'service'
                  ORDER BY b.service_date DESC
                  LIMIT 5";
        $result = mysqli_query($con, $query);
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $recentBookings[] = [
                'id' => $row['booking_number'],
                'customer' => $row['customer_name'],
                'vehicle' => trim(($row['brand'] ?? '') . ' ' . ($row['equipment'] ?? $row['model'] ?? '')),
                'service' => $row['service_type'],
                'date' => substr($row['service_date'], 0, 10),
                'status' => toAdminBookingStatus($row['status'])
            ];
        }

        sendResponse(true, 'Admin dashboard retrieved', [
            'stats' => $stats,
            'recentBookings' => $recentBookings
        ]);
        break;



        // --- staff ---
    case 'admin-staff':
        if (!tableExists($con, 'staff')) {
            sendResponse(true, 'Staff list retrieved', []);
        }
        $columns = staffColumns($con);
        if (!$columns['name']) {
            sendResponse(false, 'Staff table is missing a name column.', null, 500);
        }
        $missingAccountColumns = [];
        foreach (['email', 'phone', 'role', 'status', 'password'] as $requiredColumn) {
            if (!$columns[$requiredColumn]) $missingAccountColumns[] = $requiredColumn;
        }
        if (!empty($missingAccountColumns)) {
            sendResponse(
                false,
                'Staff account schema is incomplete (' . implode(', ', $missingAccountColumns) . '). Apply migration 006_staff_accounts before saving staff.',
                ['missingColumns' => $missingAccountColumns],
                503
            );
        }
        $result = mysqli_query($con, "SELECT * FROM staff ORDER BY `" . $columns['name'] . "` ASC, id ASC");
        $staffList = [];
        $currentRole = currentAdminRoleName($con);
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $normalizedRole = normalizeStaffRole($columns['role'] ? ($row[$columns['role']] ?? '') : 'Technician');
            if ($currentRole === 'Head Manager' && $normalizedRole !== 'Technician') continue;
            $rawStatus = $columns['status'] ? ($row[$columns['status']] ?? 'Active') : 'Active';
            $isActive = !in_array(strtolower(trim(strval($rawStatus))), ['0', 'inactive', 'disabled'], true);
            $staffList[] = [
                'id' => intval($row['id']),
                'name' => trim(strval($row[$columns['name']] ?? '')),
                'email' => $columns['email'] ? trim(strval($row[$columns['email']] ?? '')) : '',
                'phone' => $columns['phone'] ? formatMalaysiaPhone($row[$columns['phone']] ?? '') : '',
                'role' => $normalizedRole,
                'status' => $isActive ? 'Active' : 'Inactive'
            ];
        }
        sendResponse(true, 'Staff list retrieved', $staffList);
        break;

    case 'admin-create-staff':
    case 'admin-update-staff':
        if (!tableExists($con, 'staff')) {
            sendResponse(false, 'Staff table is unavailable in this database.', null, 500);
        }
        $columns = staffColumns($con);
        if (!$columns['name']) {
            sendResponse(false, 'Staff table is missing a name column.', null, 500);
        }
        $missingAccountColumns = [];
        foreach (['email', 'phone', 'role', 'status', 'password'] as $requiredColumn) {
            if (!$columns[$requiredColumn]) $missingAccountColumns[] = $requiredColumn;
        }
        if (!empty($missingAccountColumns)) {
            sendResponse(
                false,
                'Staff account schema is incomplete (' . implode(', ', $missingAccountColumns) . '). Apply migration 006_staff_accounts before saving staff.',
                ['missingColumns' => $missingAccountColumns],
                503
            );
        }

        $staffId = intval($inputData['id'] ?? 0);
        $isUpdate = $mode === 'admin-update-staff';
        $existingStaff = $isUpdate ? staffRecordById($con, $staffId) : null;
        if ($isUpdate && !$existingStaff) {
            sendResponse(false, 'Staff member not found.', null, 404);
        }
        $currentRole = currentAdminRoleName($con);
        if (
            $currentRole === 'Head Manager' &&
            $isUpdate &&
            normalizeStaffRole($existingStaff[$columns['role']] ?? '') !== 'Technician'
        ) {
            sendResponse(false, 'Head Manager may manage Technician accounts only.', null, 403);
        }

        $name = trim(preg_replace('/\s+/', ' ', strval($inputData['name'] ?? '')));
        $email = strtolower(trim(strval($inputData['email'] ?? '')));
        $phoneInput = trim(strval($inputData['phone'] ?? ''));
        $phone = $phoneInput !== '' && isValidMalaysiaPhone($phoneInput)
            ? formatMalaysiaPhone($phoneInput)
            : '';
        $role = normalizeStaffRole($inputData['role'] ?? '');
        $status = ucfirst(strtolower(trim(strval($inputData['status'] ?? 'Active'))));
        $password = strval($inputData['password'] ?? '');
        $allowedStaffRoles = ['Admin', 'Head Manager', 'Foreman', 'Technician'];

        if ($name === '') sendResponse(false, 'Staff name is required.', null, 400);
        if ($email === '' || !isValidEmailAddress($email)) {
            sendResponse(false, 'Enter a valid staff email address.', null, 400);
        }
        if ($phoneInput === '' || !isValidMalaysiaPhone($phoneInput)) {
            sendResponse(false, 'Enter a valid Malaysia phone number.', null, 400);
        }
        if (!in_array($role, $allowedStaffRoles, true)) {
            sendResponse(false, 'Select a valid staff role.', null, 400);
        }
        if ($currentRole === 'Head Manager' && $role !== 'Technician') {
            sendResponse(false, 'Head Manager may create or update Technician accounts only.', null, 403);
        }
        if (!in_array($status, ['Active', 'Inactive'], true)) {
            sendResponse(false, 'Select a valid staff status.', null, 400);
        }
        if (!$isUpdate && $password === '') {
            sendResponse(false, 'Password is required for new staff.', null, 400);
        }
        if ($password !== '') {
            $passwordError = passwordValidationError($password, $isUpdate ? 'New password' : 'Password');
            if ($passwordError !== null) {
                sendResponse(false, $passwordError, null, 422);
            }
            if (!$columns['password']) {
                sendResponse(false, 'Staff password storage is unavailable.', null, 500);
            }
            if ($isUpdate) {
                $currentStaff = staffRecordById($con, $staffId);
                $currentHash = strval($currentStaff[$columns['password']] ?? '');
                if ($currentHash !== '' && password_verify($password, $currentHash)) {
                    sendResponse(false, 'New password must be different from the current password.', null, 409);
                }
            }
        }

        $safeName = mysqli_real_escape_string($con, $name);
        $duplicateWhere = "LOWER(TRIM(`" . $columns['name'] . "`)) = LOWER('$safeName')";
        if ($isUpdate) $duplicateWhere .= " AND id <> $staffId";
        if (countRows($con, 'staff', $duplicateWhere) > 0) {
            sendResponse(false, 'A staff member with this name already exists.', null, 409);
        }
        if ($columns['email']) {
            $safeEmail = mysqli_real_escape_string($con, $email);
            $emailDuplicateWhere = "LOWER(TRIM(`" . $columns['email'] . "`)) = LOWER('$safeEmail')";
            if ($isUpdate) $emailDuplicateWhere .= " AND id <> $staffId";
            if (countRows($con, 'staff', $emailDuplicateWhere) > 0) {
                sendResponse(false, 'A staff account with this email already exists.', null, 409);
            }
        }

        $values = [$columns['name'] => $name];
        if (!$isUpdate && $columns['icNo'] && !columnAcceptsNull($con, 'staff', $columns['icNo'])) {
            // Compatibility fallback for legacy schemas that cannot be altered.
            // This is an internal unique token, not a personal identity number.
            $values[$columns['icNo']] = 'SYS-' . strtoupper(substr(hash('sha256', uniqid('', true)), 0, 12));
        }
        if (!$isUpdate && $columns['departmentId']) {
            // Staff roles are managed directly by MAW; a workshop department is optional.
            // Explicit NULL avoids legacy schemas inserting an invalid default such as 0.
            if (columnAcceptsNull($con, 'staff', $columns['departmentId'])) {
                $values[$columns['departmentId']] = null;
            } elseif (tableExists($con, 'department')) {
                $departmentResult = mysqli_query($con, 'SELECT id FROM department ORDER BY id LIMIT 1');
                $department = $departmentResult ? mysqli_fetch_assoc($departmentResult) : null;
                $departmentId = intval($department['id'] ?? 0);
                if ($departmentId <= 0) {
                    sendResponse(false, 'Create a department before adding staff, or make staff.department_id optional.', null, 409);
                }
                $values[$columns['departmentId']] = $departmentId;
            } else {
                sendResponse(false, 'Staff department configuration is incomplete.', null, 409);
            }
        }
        if ($columns['username'] && $columns['username'] !== $columns['name']) {
            $values[$columns['username']] = $name;
        }
        $values[$columns['email']] = $email;
        $values[$columns['phone']] = $phone;
        $values[$columns['role']] = $role;
        $values[$columns['status']] = staffStatusForStorage($con, $columns['status'], $status);
        if ($password !== '' && $columns['password']) {
            $values[$columns['password']] = password_hash($password, PASSWORD_DEFAULT);
        }

        if ($isUpdate) {
            $sets = [];
            foreach ($values as $column => $value) {
                $sets[] = $value === null
                    ? "`$column` = NULL"
                    : "`$column` = '" . mysqli_real_escape_string($con, strval($value)) . "'";
            }
            $ok = mysqli_query($con, "UPDATE staff SET " . implode(', ', $sets) . " WHERE id = $staffId");
        } else {
            $insertColumns = array_map(function ($column) { return "`$column`"; }, array_keys($values));
            $insertValues = array_map(function ($value) use ($con) {
                return $value === null
                    ? 'NULL'
                    : "'" . mysqli_real_escape_string($con, strval($value)) . "'";
            }, array_values($values));
            $ok = mysqli_query(
                $con,
                "INSERT INTO staff (" . implode(', ', $insertColumns) . ") VALUES (" . implode(', ', $insertValues) . ")"
            );
            $staffId = mysqli_insert_id($con);
        }

        if (!$ok) {
            if (mysqli_errno($con) === 1062) {
                sendResponse(false, 'A staff account with the same name or email already exists.', null, 409);
            }
            sendResponse(false, 'Unable to save staff member: ' . mysqli_error($con), null, 500);
        }
        sendResponse(true, $isUpdate ? 'Staff member updated.' : 'Staff member created.', ['id' => $staffId]);
        break;

    case 'admin-delete-staff':
        $staffId = intval($inputData['id'] ?? 0);
        $staffToDelete = staffRecordById($con, $staffId);
        if ($staffId <= 0 || !$staffToDelete) {
            sendResponse(false, 'Staff member not found.', null, 404);
        }
        $columns = staffColumns($con);
        if (
            currentAdminRoleName($con) === 'Head Manager' &&
            normalizeStaffRole($columns['role'] ? ($staffToDelete[$columns['role']] ?? '') : '') !== 'Technician'
        ) {
            sendResponse(false, 'Head Manager may delete Technician accounts only.', null, 403);
        }
        if (tableExists($con, 'job_assignment')) {
            $assignmentStaffColumn = firstColumn($con, 'job_assignment', ['technician_id', 'staff_id']);
            if ($assignmentStaffColumn && countRows($con, 'job_assignment', "`$assignmentStaffColumn` = $staffId") > 0) {
                sendResponse(false, 'This staff member is assigned to one or more work orders. Reassign or remove those assignments first.', null, 409);
            }
        }
        if (tableExists($con, 'job') && columnExists($con, 'job', 'foreman_id') && countRows($con, 'job', "foreman_id = $staffId") > 0) {
            sendResponse(false, 'This Foreman owns one or more work orders. Reassign those work orders first.', null, 409);
        }
        if (mysqli_query($con, "DELETE FROM staff WHERE id = $staffId")) {
            sendResponse(true, 'Staff member deleted.');
        }
        sendResponse(false, 'Unable to delete staff member: ' . mysqli_error($con), null, 500);
        break;



        // --- admin notifications ---
    case 'admin-notifications':
        $purchaseOrderReminders = purchaseOrderArrivalNotifications($con);
        $rollbackNotifications = workOrderRollbackNotifications($con, '1=1', 100);
        $partsUpdateNotifications = workOrderPartsUpdateNotifications($con, 50);
        $legacyNotifications = legacyNotifications($con);
        if ($legacyNotifications !== null) {
            $mergedNotifications = array_merge($purchaseOrderReminders, $rollbackNotifications, $partsUpdateNotifications, $legacyNotifications);
            usort($mergedNotifications, function ($left, $right) { return strcmp(strval($right['date']), strval($left['date'])); });
            sendResponse(true, 'Admin notifications retrieved', $mergedNotifications);
        }

        $notifications = array_merge($rollbackNotifications, $partsUpdateNotifications);
        $query = "SELECT n.*, u.name AS recipient
                  FROM notifications n
                  JOIN users u ON n.user_id = u.id
                  ORDER BY n.created_at DESC";
        $result = mysqli_query($con, $query);
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $notifications[] = [
                'id' => intval($row['id']),
                'title' => $row['title'],
                'message' => $row['message'],
                'recipient' => $row['recipient'],
                'type' => toAdminNotificationType($row['type']),
                'status' => 'Sent',
                'date' => date('Y-m-d H:i', strtotime($row['created_at'])),
                'channel' => $row['channel'] ?: 'Push Notification'
            ];
        }
        $notifications = array_merge($purchaseOrderReminders, $notifications);
        usort($notifications, function ($left, $right) { return strcmp(strval($right['date']), strval($left['date'])); });
        sendResponse(true, 'Admin notifications retrieved', $notifications);
        break;

    case 'admin-send-notification':
        $title = mysqli_real_escape_string($con, $inputData['title'] ?? '');
        $message = mysqli_real_escape_string($con, $inputData['message'] ?? '');
        $recipient = $inputData['recipient'] ?? 'all';
        $typeRaw = $inputData['type'] ?? 'Info';
        $typeMap = ['Reminder' => 'reminder', 'Warning' => 'reminder', 'Success' => 'booking', 'Info' => 'system'];
        $type = $typeMap[$typeRaw] ?? 'system';
        $channels = $inputData['channels'] ?? ['push' => true];
        $channelParts = [];
        if (!empty($channels['push'])) $channelParts[] = 'Push';
        if (!empty($channels['email'])) $channelParts[] = 'Email';
        if (!empty($channels['sms'])) $channelParts[] = 'SMS';
        $channel = mysqli_real_escape_string($con, implode(' + ', $channelParts) ?: 'Push Notification');

        if (!$title || !$message) {
            sendResponse(false, 'Title and message are required', null, 400);
        }

        $recipientType = 'all';
        $recipientId = 0;
        if (preg_match('/^(customer|company):(\d+)$/', strval($recipient), $recipientMatch)) {
            $recipientType = $recipientMatch[1];
            $recipientId = intval($recipientMatch[2]);
        } elseif ($recipient === 'active') {
            $recipientType = 'active';
        } elseif ($recipient !== 'all') {
            sendResponse(false, 'Select a valid notification recipient.', null, 422);
        }

        $contactTable = tableExists($con, 'customer') ? 'customer' : (tableExists($con, 'users') ? 'users' : null);
        if (!$contactTable) {
            sendResponse(false, 'Customer contacts are unavailable.', null, 409);
        }
        $source = $contactTable === 'customer' ? 'customer' : 'users';
        $companyColumn = firstColumn($con, $contactTable, ['company_id']);
        $where = $contactTable === 'users' && columnExists($con, 'users', 'role')
            ? "role = 'customer'"
            : '1 = 1';
        if ($recipientType === 'customer') {
            $where .= ' AND id = ' . $recipientId;
        } elseif ($recipientType === 'company') {
            if (!$companyColumn) {
                sendResponse(false, 'Customer company assignment is unavailable.', null, 409);
            }
            $where .= " AND `$companyColumn` = $recipientId";
        } elseif ($recipientType === 'active') {
            $activityTable = $contactTable === 'customer' ? 'customer_appointment' : 'bookings';
            $activityContactColumn = $contactTable === 'customer' ? 'customer_id' : 'user_id';
            $activityDateColumn = tableExists($con, $activityTable)
                ? firstColumn($con, $activityTable, ['appointment_at', 'service_date', 'created_at'])
                : null;
            if ($activityDateColumn && columnExists($con, $activityTable, $activityContactColumn)) {
                $where .= " AND id IN (
                    SELECT DISTINCT `$activityContactColumn`
                    FROM `$activityTable`
                    WHERE `$activityDateColumn` >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                )";
            }
        }

        $companySelect = $companyColumn ? "`$companyColumn` AS company_id" : '0 AS company_id';
        $contacts = mysqli_query($con, "SELECT id, $companySelect FROM `$contactTable` WHERE $where");
        $count = 0;
        while ($contacts && $contact = mysqli_fetch_assoc($contacts)) {
            if (createCustomerRecordNotification(
                $con,
                $source,
                intval($contact['company_id'] ?? 0),
                intval($contact['id']),
                $inputData['title'] ?? '',
                $inputData['message'] ?? '',
                $type,
                'manual',
                '',
                ''
            )) {
                $count++;
            }
        }

        if ($count === 0) {
            sendResponse(false, 'No matching customer recipients were found.', null, 422);
        }
        sendResponse(true, 'Notification sent', ['sent' => $count]);
        break;
    
    // ----------------------------------------------------


        // --- system settings & service types ---
    case 'admin-system-settings':
        requireSystemSettingsSchema($con);
        sendResponse(true, 'System settings retrieved.', systemSettingsPayload($con));
        break;

    case 'admin-save-system-settings':
        requireSystemSettingsSchema($con);
        $section = strtolower(trim(strval($inputData['section'] ?? '')));
        $values = [];
        if ($section === 'company') {
            $company = is_array($inputData['company'] ?? null) ? $inputData['company'] : [];
            $legalName = trim(strval($company['legalName'] ?? ''));
            $registrationNo = trim(strval($company['registrationNo'] ?? ''));
            $groupName = trim(strval($company['groupName'] ?? ''));
            $address = trim(strval($company['address'] ?? ''));
            $phone = trim(strval($company['phone'] ?? ''));
            $email = strtolower(trim(strval($company['email'] ?? '')));
            $operatingHours = trim(strval($company['operatingHours'] ?? ''));
            $phoneDigits = preg_replace('/\D+/', '', $phone);
            if ($legalName === '' || strlen($legalName) > 180) sendResponse(false, 'Company legal name is required and must not exceed 180 characters.', null, 400);
            if ($address === '' || strlen($address) > 500) sendResponse(false, 'Company address is required and must not exceed 500 characters.', null, 400);
            if (strlen($phoneDigits) < 9 || strlen($phoneDigits) > 12) sendResponse(false, 'Enter a valid company phone number.', null, 400);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) sendResponse(false, 'Enter a valid company email address.', null, 400);
            if ($operatingHours === '' || strlen($operatingHours) > 250) sendResponse(false, 'Operating hours are required.', null, 400);
            $values = [
                'company.legal_name' => $legalName,
                'company.registration_no' => substr($registrationNo, 0, 100),
                'company.group_name' => substr($groupName, 0, 180),
                'company.address' => $address,
                'company.phone' => $phone,
                'company.email' => $email,
                'company.operating_hours' => $operatingHours
            ];
        } elseif ($section === 'pricing') {
            $pricing = is_array($inputData['pricing'] ?? null) ? $inputData['pricing'] : [];
            $taxRate = round(floatval($pricing['taxRate'] ?? 0), 2);
            $laborRate = round(floatval($pricing['laborRate'] ?? 0), 2);
            $partsMarkup = round(floatval($pricing['partsMarkup'] ?? 0), 2);
            if ($taxRate < 0 || $taxRate > 100) sendResponse(false, 'Tax rate must be between 0% and 100%.', null, 400);
            if ($laborRate < 0 || $laborRate > 100000) sendResponse(false, 'Labor rate must be between RM 0 and RM 100,000.', null, 400);
            if ($partsMarkup < 0 || $partsMarkup > 1000) sendResponse(false, 'Parts markup must be between 0% and 1,000%.', null, 400);
            $values = [
                'pricing.tax_rate' => number_format($taxRate, 2, '.', ''),
                'pricing.labor_rate' => number_format($laborRate, 2, '.', ''),
                'pricing.parts_markup' => number_format($partsMarkup, 2, '.', ''),
                'pricing.automatic_rounding' => !empty($pricing['automaticRounding']) ? '1' : '0'
            ];
        } elseif ($section === 'support') {
            $support = is_array($inputData['support'] ?? null) ? $inputData['support'] : [];
            $phone = trim(strval($support['phone'] ?? ''));
            $whatsapp = trim(strval($support['whatsapp'] ?? ''));
            $email = strtolower(trim(strval($support['email'] ?? '')));
            $operatingHours = trim(strval($support['operatingHours'] ?? ''));
            $phoneDigits = preg_replace('/\D+/', '', $phone);
            $whatsappDigits = preg_replace('/\D+/', '', $whatsapp);
            if (strlen($phoneDigits) < 9 || strlen($phoneDigits) > 15) sendResponse(false, 'Enter a valid support phone number.', null, 400);
            if (strlen($whatsappDigits) < 9 || strlen($whatsappDigits) > 15) sendResponse(false, 'Enter a valid WhatsApp support number.', null, 400);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) sendResponse(false, 'Enter a valid support email address.', null, 400);
            if ($operatingHours !== '' && strlen($operatingHours) > 250) sendResponse(false, 'Operating hours must not exceed 250 characters.', null, 400);
            $values = [
                'support.phone' => $phone,
                'support.whatsapp' => $whatsapp,
                'support.email' => $email,
                'support.operating_hours' => $operatingHours
            ];
        } elseif ($section === 'notifications') {
            $notifications = is_array($inputData['notifications'] ?? null) ? $inputData['notifications'] : [];
            $values = [
                'notifications.service_reminders' => !empty($notifications['serviceReminders']) ? '1' : '0',
                'notifications.insurance_reminders' => !empty($notifications['insuranceReminders']) ? '1' : '0',
                'notifications.booking_updates' => !empty($notifications['bookingUpdates']) ? '1' : '0',
                'notifications.low_stock_alerts' => !empty($notifications['lowStockAlerts']) ? '1' : '0'
            ];
        } else {
            sendResponse(false, 'Invalid settings section.', null, 400);
        }
        mysqli_begin_transaction($con);
        try {
            saveSystemSettingValues($con, $values);
            mysqli_commit($con);
        } catch (Exception $e) {
            mysqli_rollback($con);
            sendResponse(false, 'Unable to save system settings: ' . $e->getMessage(), null, $e->getCode() ?: 500);
        }
        sendResponse(true, 'System settings saved.', systemSettingsPayload($con));
        break;

    case 'admin-create-service-type':
    case 'admin-update-service-type':
        requireSystemSettingsSchema($con);
        $isUpdate = $mode === 'admin-update-service-type';
        $serviceId = intval($inputData['id'] ?? 0);
        if ($isUpdate && $serviceId <= 0) sendResponse(false, 'Service type ID is required.', null, 400);
        $name = trim(strval($inputData['name'] ?? ''));
        $description = trim(strval($inputData['description'] ?? ''));
        $basePrice = round(floatval($inputData['basePrice'] ?? 0), 2);
        $enabled = !empty($inputData['enabled']) ? 1 : 0;
        $sortOrder = intval($inputData['sortOrder'] ?? 0);
        if ($name === '' || strlen($name) > 150) sendResponse(false, 'Service name is required and must not exceed 150 characters.', null, 400);
        if (strlen($description) > 500) sendResponse(false, 'Service description must not exceed 500 characters.', null, 400);
        if ($basePrice < 0 || $basePrice > 9999999999) sendResponse(false, 'Invalid service base price.', null, 400);
        if ($sortOrder < 0 || $sortOrder > 100000) sendResponse(false, 'Invalid service sort order.', null, 400);
        $escapedName = mysqli_real_escape_string($con, $name);
        $escapedDescription = mysqli_real_escape_string($con, $description);
        $duplicateWhere = $isUpdate ? "name = '$escapedName' AND id <> $serviceId" : "name = '$escapedName'";
        if (countRows($con, 'service_type', $duplicateWhere) > 0) sendResponse(false, 'A service type with this name already exists.', null, 409);
        $sql = $isUpdate
            ? "UPDATE service_type SET name = '$escapedName', description = '$escapedDescription', base_price = $basePrice, is_enabled = $enabled, sort_order = $sortOrder WHERE id = $serviceId"
            : "INSERT INTO service_type (name, description, base_price, is_enabled, sort_order) VALUES ('$escapedName', '$escapedDescription', $basePrice, $enabled, $sortOrder)";
        if (!mysqli_query($con, $sql)) sendResponse(false, 'Unable to save service type: ' . mysqli_error($con), null, 500);
        if ($isUpdate && mysqli_affected_rows($con) < 1 && countRows($con, 'service_type', "id = $serviceId") < 1) sendResponse(false, 'Service type not found.', null, 404);
        sendResponse(true, $isUpdate ? 'Service type updated.' : 'Service type created.', systemSettingsPayload($con));
        break;

    case 'admin-delete-service-type':
        requireSystemSettingsSchema($con);
        $serviceId = intval($inputData['id'] ?? 0);
        if ($serviceId <= 0) sendResponse(false, 'Service type ID is required.', null, 400);
        if (!mysqli_query($con, "DELETE FROM service_type WHERE id = $serviceId")) sendResponse(false, 'Unable to delete service type: ' . mysqli_error($con), null, 500);
        if (mysqli_affected_rows($con) < 1) sendResponse(false, 'Service type not found.', null, 404);
        sendResponse(true, 'Service type deleted.', systemSettingsPayload($con));
        break;



        default:
            sendResponse(false, "Unsupported settings action: $mode", null, 400);
            break;
    }
}

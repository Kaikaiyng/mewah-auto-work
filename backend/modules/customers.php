<?php
/**
 * Customers, Corporate Companies & Customer Portal Domain Module
 *
 * Handles customer accounts, drivers, corporate company profiles, credit limits,
 * customer authentication, session management, CSRF tokens, contacts,
 * delivery addresses, notification preferences, customer portal bootstrap, and customer invoice views.
 */

function legacyCustomers($con) {
    if (!tableExists($con, 'customer')) {
        return null;
    }

    $vehicleCountMap = [];
    if (tableExists($con, 'customer_vehicle') && columnExists($con, 'customer_vehicle', 'company_id')) {
        $vcRes = mysqli_query($con, "SELECT company_id, COUNT(*) AS cnt FROM customer_vehicle WHERE company_id IS NOT NULL AND company_id > 0 GROUP BY company_id");
        while ($vcRes && $vcRow = mysqli_fetch_assoc($vcRes)) {
            $vehicleCountMap[intval($vcRow['company_id'])] = intval($vcRow['cnt']);
        }
    }

    $activityMap = [];
    if (tableExists($con, 'customer_appointment')) {
        $bookingContactColumn = firstColumn($con, 'customer_appointment', ['customer_id', 'user_id']);
        $bookingDateColumn = firstColumn($con, 'customer_appointment', ['appointment_at', 'appointment_date', 'service_date', 'date', 'created_at']);
        if ($bookingContactColumn) {
            $lastVisitSelect = $bookingDateColumn ? "MAX(activity_booking.`$bookingDateColumn`)" : 'NULL';
            $actRes = mysqli_query(
                $con,
                "SELECT activity_user.company_id, COUNT(DISTINCT activity_booking.id) AS booking_count, $lastVisitSelect AS last_visit
                 FROM customer_appointment activity_booking
                 JOIN customer activity_user ON activity_user.id = activity_booking.`$bookingContactColumn`
                 WHERE activity_user.company_id IS NOT NULL AND activity_user.company_id > 0
                 GROUP BY activity_user.company_id"
            );
            while ($actRes && $actRow = mysqli_fetch_assoc($actRes)) {
                $activityMap[intval($actRow['company_id'])] = [
                    'count' => intval($actRow['booking_count'] ?? 0),
                    'last_visit' => !empty($actRow['last_visit']) ? substr($actRow['last_visit'], 0, 10) : '-'
                ];
            }
        }
    }

    $customers = [];
    $result = mysqli_query($con, "SELECT c.*, comp.name AS company_name FROM customer c LEFT JOIN company comp ON c.company_id = comp.id ORDER BY c.id DESC");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $customerId = intval($row['id']);
        $companyId = intval($row['company_id'] ?? 0);
        $vehicleCount = $vehicleCountMap[$companyId] ?? 0;
        $bookingCount = $activityMap[$companyId]['count'] ?? 0;
        $lastVisit = $activityMap[$companyId]['last_visit'] ?? '-';

        $customers[] = [
            'id' => $customerId,
            'name' => rowValue($row, ['name', 'username'], 'Customer #' . $customerId),
            'email' => rowValue($row, ['email'], '-'),
            'phone' => formatMalaysiaPhone(rowValue($row, ['phone'], '-')),
            'vehicles' => $vehicleCount,
            'totalBookings' => $bookingCount,
            'lastVisit' => $lastVisit,
            'companyId' => $companyId,
            'companyName' => rowValue($row, ['company_name'], '-'),
            'deliveryAddresses' => formatMalaysiaDeliveryAddresses(json_decode(strval($row['delivery_addresses'] ?? '[]'), true) ?: []),
            'status' => !isset($row['is_active']) || boolval($row['is_active']) ? 'Active' : 'Inactive'
        ];
    }

    return $customers;
}

function verifyCustomerCsrf($inputData) {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $token = $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $headers['X-CSRF-Token']
        ?? $headers['x-csrf-token']
        ?? $inputData['csrfToken']
        ?? '';
    if ($token === '' || empty($_SESSION['customer_csrf_token']) || !hash_equals($_SESSION['customer_csrf_token'], $token)) {
        sendResponse(false, 'Invalid or missing CSRF token.', null, 403);
    }
}

function customerRecord($con, $auth) {
    $table = $auth['source'];
    $id = intval($auth['userId']);
    $companyId = intval($auth['companyId']);
    $result = mysqli_query($con, "SELECT * FROM `$table` WHERE id = $id LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (
        !$row ||
        (empty($auth['isSuperadmin']) && intval($row['company_id'] ?? 0) !== $companyId)
    ) {
        sendResponse(false, 'Customer account is not accessible.', null, 404);
    }
    return $row;
}

function customerCompanyName($con, $companyId) {
    if (!tableExists($con, 'company')) return 'Company #' . intval($companyId);
    $result = mysqli_query($con, "SELECT name FROM company WHERE id = " . intval($companyId) . " LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    return $row['name'] ?? ('Company #' . intval($companyId));
}

function customerVehicleAccessScope($con, $auth) {
    static $cache = [];
    $cacheKey = ($auth['source'] ?? '') . ':' . intval($auth['userId']) . ':' . intval($auth['companyId']) . ':' . (!empty($auth['isSuperadmin']) ? '1' : '0');
    if (isset($cache[$cacheKey])) return $cache[$cacheKey];

    $table = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
    $scope = [
        'table' => $table,
        'driverColumn' => null,
        'vehicleIds' => [],
        'scoped' => false,
        'canViewAllVehicles' => true
    ];
    if (!tableExists($con, $table) || !empty($auth['isSuperadmin'])) {
        $cache[$cacheKey] = $scope;
        return $scope;
    }

    // Customer App accounts are company users. Drivers are non-login profiles
    // stored in company_driver and never determine application access scope.
    $scope['scoped'] = false;
    $scope['canViewAllVehicles'] = true;
    $cache[$cacheKey] = $scope;
    return $scope;
}

function customerVehicleIsAccessible($scope, $vehicleId) {
    $vehicleId = intval($vehicleId);
    if (!$scope['scoped']) return $vehicleId > 0;
    return $vehicleId > 0 && in_array($vehicleId, $scope['vehicleIds'], true);
}

function customerScopedVehicleSql($scope, $column) {
    if (!$scope['scoped']) return '';
    if (empty($scope['vehicleIds'])) return ' AND 1 = 0';
    return " AND $column IN (" . implode(',', array_map('intval', $scope['vehicleIds'])) . ')';
}

function customerRolePermissionProfile($role, $isSuperadmin = false) {
    $roleKey = strtolower(trim(strval($role)));
    $aliases = [
        'customer' => 'company_contact',
        'user' => 'company_contact',
        'company user' => 'company_user',
        'company contact' => 'company_contact',
        'company owner' => 'company_owner',
        'owner' => 'company_owner',
        'company administrator' => 'company_admin',
        'company admin' => 'company_admin',
        'administrator' => 'company_admin',
        'admin' => 'company_admin',
        'fleet manager' => 'fleet_manager',
        'accounts contact' => 'accounts_contact',
        'account contact' => 'accounts_contact',
        'accounts manager' => 'accounts_contact',
        'finance manager' => 'accounts_contact',
        'company driver' => 'driver',
        'lorry driver' => 'driver',
        'truck driver' => 'driver'
    ];
    $roleKey = $aliases[$roleKey] ?? str_replace(' ', '_', $roleKey ?: 'company_contact');

    $fullAccess = [
        'canCreateBooking' => true,
        'canCancelBooking' => true,
        'canRescheduleBooking' => true,
        'canViewRepairProgress' => true,
        'canViewInvoices' => true,
        'canOrderParts' => true,
        'canViewNotifications' => true
    ];
    $profiles = [
        'company_owner' => $fullAccess,
        'company_admin' => $fullAccess,
        'fleet_manager' => $fullAccess,
        'company_contact' => $fullAccess,
        'accounts_contact' => array_merge($fullAccess, [
            'canCreateBooking' => false,
            'canCancelBooking' => false,
            'canRescheduleBooking' => false,
            'canViewRepairProgress' => false
        ]),
        'company_user' => $fullAccess,
        'driver' => $fullAccess
    ];

    // For now every customer role can view invoices and use Parts within its
    // company/vehicle scope.
    // Keeping role capabilities here makes future company-role assignment a
    // configuration change instead of requiring invoice-query changes.
    return $isSuperadmin ? $fullAccess : ($profiles[$roleKey] ?? $fullAccess);
}

function customerUserPayload($con, $auth, $row = null) {
    $row = $row ?: customerRecord($con, $auth);
    $companyId = intval($auth['companyId']);
    $isSuperadmin = !empty($auth['isSuperadmin']);
    $role = $isSuperadmin
        ? 'Superadmin'
        : rowValue($row, ['company_user_role', 'contact_role'], 'Company User');
    if (in_array(strtolower($role), ['customer', 'user'], true)) $role = 'Company Contact';
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    $permissions = customerRolePermissionProfile($role, $isSuperadmin);
    $permissions = array_merge([
        'canViewAllVehicles' => $isSuperadmin || $vehicleScope['canViewAllVehicles']
    ], $permissions);
    $addresses = customerDeliveryAddresses($con, $auth);
    return [
        'id' => strval($auth['userId']),
        'contactReference' => 'CT-' . str_pad(strval($auth['userId']), 6, '0', STR_PAD_LEFT),
        'name' => rowValue($row, ['name', 'username'], 'Customer'),
        'email' => rowValue($row, ['email'], ''),
        'phone' => formatMalaysiaPhone(rowValue($row, ['phone'], '')),
        'companyId' => $isSuperadmin ? 'all' : 'company-' . $companyId,
        'companyName' => $isSuperadmin ? 'All Companies' : customerCompanyName($con, $companyId),
        'contactRole' => $role,
        'preferredLanguage' => rowValue($row, ['preferred_language', 'language'], 'en'),
        'deliveryAddresses' => $addresses,
        'vehicles' => customerVehicles($con, $auth),
        'permissions' => $permissions
    ];
}

function customerContacts($con, $auth, $user) {
    if (!empty($auth['isSuperadmin'])) {
        return [[
            'id' => 'contact-' . intval($auth['userId']),
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => formatMalaysiaPhone($user['phone']),
            'role' => $user['contactRole'],
            'isDefault' => true
        ]];
    }

    $table = $auth['source'];
    $companyId = intval($auth['companyId']);
    if (!in_array($table, ['customer', 'users'], true) || !tableExists($con, $table)) return [];
    $roleColumn = firstColumn($con, $table, ['company_user_role', 'contact_role', 'type', 'role']);
    $result = mysqli_query($con, "SELECT * FROM `$table` WHERE company_id = $companyId ORDER BY id");
    $contacts = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        if ($table === 'users' && isset($row['role']) && $row['role'] !== 'customer') continue;
        if (isset($row['is_active']) && !boolval($row['is_active'])) continue;
        $id = intval($row['id']);
        $contacts[] = [
            'id' => 'contact-' . $id,
            'name' => rowValue($row, ['name', 'username'], 'Company User'),
            'email' => rowValue($row, ['email'], ''),
            'phone' => formatMalaysiaPhone(rowValue($row, ['phone'], '')),
            'role' => $roleColumn ? rowValue($row, [$roleColumn], 'Company User') : 'Company User',
            'isDefault' => $id === intval($auth['userId'])
        ];
    }
    return $contacts;
}

function customerServiceCentres() {
    return [[
        'id' => 'sc1',
        'name' => getenv('MAW_WORKSHOP_NAME') ?: 'MEWAH TRANS LOGISTIC SDN BHD',
        'address' => getenv('MAW_WORKSHOP_ADDRESS') ?: 'Configure your workshop address',
        'phone' => formatMalaysiaPhone(getenv('MAW_WORKSHOP_PHONE') ?: '+60 00-000 0000')
    ]];
}

function requireCustomerNotificationPreferencesSchema($con) {
    static $prepared = false;
    if ($prepared) return true;
    if (tableExists($con, 'customer_notification_preferences')) {
        $prepared = true;
        return true;
    }
    $sql = "CREATE TABLE IF NOT EXISTS `customer_notification_preferences` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        `customer_user_id` INT NOT NULL,
        `booking_updates` TINYINT(1) NOT NULL DEFAULT 1,
        `repair_updates` TINYINT(1) NOT NULL DEFAULT 1,
        `service_reminders` TINYINT(1) NOT NULL DEFAULT 1,
        `parts_orders` TINYINT(1) NOT NULL DEFAULT 1,
        `invoice_updates` TINYINT(1) NOT NULL DEFAULT 1,
        `email_delivery` TINYINT(1) NOT NULL DEFAULT 1,
        `push_notifications` TINYINT(1) NOT NULL DEFAULT 1,
        `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uniq_cust_pref_user` (`customer_user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    @mysqli_query($con, $sql);
    $prepared = true;
    return true;
}

function customerNotificationPreferences($con = null, $auth = null) {
    $defaults = [
        'bookingUpdates' => true,
        'repairUpdates' => true,
        'serviceReminders' => true,
        'partsOrders' => true,
        'invoiceUpdates' => true,
        'email' => true,
        'push' => true
    ];
    if (!$con || !$auth) return $defaults;
    requireCustomerNotificationPreferencesSchema($con);
    $userId = intval($auth['userId'] ?? 0);
    if ($userId <= 0) return $defaults;

    $res = mysqli_query($con, "SELECT * FROM `customer_notification_preferences` WHERE `customer_user_id` = $userId LIMIT 1");
    if ($res && $row = mysqli_fetch_assoc($res)) {
        return [
            'bookingUpdates' => (bool)$row['booking_updates'],
            'repairUpdates' => (bool)$row['repair_updates'],
            'serviceReminders' => (bool)$row['service_reminders'],
            'partsOrders' => (bool)$row['parts_orders'],
            'invoiceUpdates' => (bool)$row['invoice_updates'],
            'email' => (bool)$row['email_delivery'],
            'push' => (bool)$row['push_notifications']
        ];
    }
    return $defaults;
}

function customerLegacyInvoiceBookings($con, $auth) {
    if (!tableExists($con, 'customer_invoice')) return [];
    $companyId = intval($auth['companyId']);
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    if (!empty($auth['isSuperadmin'])) {
        $query = "SELECT i.* FROM customer_invoice i ORDER BY i.id DESC";
    } elseif (columnExists($con, 'customer_invoice', 'company_id')) {
        $query = "SELECT i.* FROM customer_invoice i WHERE i.company_id = $companyId ORDER BY i.id DESC";
    } elseif (columnExists($con, 'customer_invoice', 'customer_id') && tableExists($con, 'customer')) {
        $query = "SELECT i.* FROM customer_invoice i JOIN customer c ON i.customer_id = c.id WHERE c.company_id = $companyId ORDER BY i.id DESC";
    } else {
        return [];
    }
    $result = mysqli_query($con, $query);
    $bookings = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $invoiceId = intval($row['id']);
        $invoiceNumber = rowValue($row, ['invoice_no', 'invoice_number'], 'INV-' . $invoiceId);
        $total = floatval(rowValue($row, ['total', 'grand_total', 'amount'], 0));
        $subtotal = floatval(rowValue($row, ['subtotal', 'sub_total'], $total));
        $tax = floatval(rowValue($row, ['tax', 'sst'], max(0, $total - $subtotal)));
        $vehicleId = intval(rowValue($row, ['vehicle_id'], 0));
        if ($vehicleId <= 0 && tableExists($con, 'customer_vehicle')) {
            $plate = mysqli_real_escape_string($con, rowValue($row, ['vehicle', 'vehicle_no', 'reg_no'], ''));
            if ($plate !== '') {
                $vehicleWhere = !empty($auth['isSuperadmin'])
                    ? "reg_no = '$plate'"
                    : "company_id = $companyId AND reg_no = '$plate'";
                $vehicleResult = mysqli_query($con, "SELECT id FROM customer_vehicle WHERE $vehicleWhere LIMIT 1");
                $vehicleRow = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
                $vehicleId = intval($vehicleRow['id'] ?? 0);
            }
        }
        if ($vehicleScope['scoped'] && !customerVehicleIsAccessible($vehicleScope, $vehicleId)) continue;
        $serviceName = rowValue($row, ['service_name', 'description'], 'Workshop Service');
        $item = [
            'id' => 'invoice-item-' . $invoiceId,
            'name' => $serviceName,
            'category' => 'service',
            'quantity' => 1,
            'unitPrice' => $subtotal,
            'total' => $subtotal
        ];
        $bookings[] = [
            'id' => 'invoice-' . $invoiceId,
            'bookingNumber' => rowValue($row, ['appointment_no', 'booking_no', 'job_no'], '-'),
            'invoiceNumber' => $invoiceNumber,
            'orderType' => 'service',
            'vehicleId' => $vehicleId > 0 ? 'v' . $vehicleId : null,
            'serviceType' => $serviceName,
            'serviceDate' => rowValue($row, ['invoice_date', 'date', 'created_at'], date('Y-m-d H:i:s')),
            'serviceCentre' => rowValue($row, ['location', 'branch'], 'Mewah AutoWorks'),
            'status' => 'completed',
            'totalPrice' => $total,
            'items' => [$item],
            'invoice' => [
                'items' => [$item],
                'laborCost' => floatval(rowValue($row, ['labor', 'labour', 'labor_cost'], 0)),
                'subtotal' => $subtotal,
                'tax' => $tax,
                'total' => $total
            ]
        ];
    }
    return $bookings;
}

function customerWorkOrderInvoiceBookings($con, $auth) {
    if (!tableExists($con, 'work_order_invoice') || !tableExists($con, 'work_order_invoice_item')) return [];
    $companyId = intval($auth['companyId']);
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    $where = !empty($auth['isSuperadmin']) ? '' : " AND j.company_id = $companyId";
    $where .= customerScopedVehicleSql($vehicleScope, 'j.vehicle_id');
    $result = mysqli_query($con, "SELECT wi.id, wi.work_order_id, wi.invoice_no, wi.status, wi.invoice_date,
        wi.due_date, wi.subtotal, wi.discount, wi.tax_rate, wi.tax_amount, wi.total, wi.paid_amount,
        wi.balance, wi.payment_method, wi.notes, wi.payment_instructions, wi.created_at, wi.updated_at,
        wi.issued_at, wi.paid_at, wi.autocount_job_no, wi.debtor_code, wi.vehicle_type, wi.vehicle_no,
        wi.credit_term_days, wi.e_invoice_status, wi.e_invoice_uuid,
        j.work_order_no, j.vehicle_id, j.service_type, j.service_centre,
        j.source_booking_id, comp.name AS company_name
        FROM work_order_invoice wi
        JOIN job j ON j.id = wi.work_order_id
        LEFT JOIN company comp ON comp.id = j.company_id
        WHERE wi.status IN ('issued', 'partially_paid', 'paid')$where
        ORDER BY wi.invoice_date DESC, wi.id DESC");
    $bookings = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $invoiceId = intval($row['id']);
        $items = [];
        $laborCost = 0.0;
        $itemResult = mysqli_query($con, "SELECT * FROM work_order_invoice_item WHERE invoice_id = $invoiceId ORDER BY sort_order, id");
        while ($itemResult && $item = mysqli_fetch_assoc($itemResult)) {
            $type = $item['item_type'];
            if ($type === 'labour') $laborCost += floatval($item['amount']);
            $items[] = [
                'id' => 'wii' . intval($item['id']),
                'name' => $item['description'],
                'code' => $item['item_code'] ?? '',
                'category' => $type === 'part' ? 'part' : 'service',
                'itemType' => $type,
                'quantity' => floatval($item['quantity']),
                'unitPrice' => floatval($item['unit_price']),
                'taxCode' => $item['tax_code'] ?? '',
                'taxRate' => floatval($item['tax_rate'] ?? 0),
                'taxAmount' => floatval($item['tax_amount'] ?? 0),
                'total' => floatval($item['amount'])
            ];
        }
        $displayStatus = invoiceDisplayStatus($row);
        $bookings[] = [
            'id' => 'wi' . $invoiceId,
            'bookingNumber' => $row['source_booking_id'] ? 'BK-' . intval($row['source_booking_id']) : ($row['work_order_no'] ?? '-'),
            'invoiceNumber' => $row['invoice_no'],
            'orderType' => 'service',
            'vehicleId' => intval($row['vehicle_id']) > 0 ? 'v' . intval($row['vehicle_id']) : null,
            'serviceType' => $row['service_type'] ?? 'Workshop Service',
            'serviceDate' => $row['invoice_date'],
            'serviceCentre' => $row['service_centre'] ?? 'Mewah AutoWorks',
            'status' => 'completed',
            'totalPrice' => floatval($row['total']),
            'workOrderId' => 'wo' . intval($row['work_order_id']),
            'workOrderNumber' => $row['work_order_no'],
            'items' => $items,
            'invoice' => [
                'id' => strval($invoiceId),
                'invoiceNumber' => $row['invoice_no'],
                'source' => 'maw',
                'workOrderId' => $row['autocount_job_no'] ?: $row['work_order_no'],
                'debtorCode' => $row['debtor_code'] ?? '',
                'vehicleType' => $row['vehicle_type'] ?? '',
                'vehicleNoRaw' => $row['vehicle_no'] ?? '',
                'creditTermDays' => intval($row['credit_term_days'] ?? 30),
                'eInvoiceStatus' => $row['e_invoice_status'] ?? '',
                'eInvoiceUuid' => $row['e_invoice_uuid'] ?? '',
                'issuedAt' => $row['issued_at'],
                'dueAt' => $row['due_date'],
                'paidAt' => $row['paid_at'],
                'discount' => floatval($row['discount']),
                'paidAmount' => floatval($row['paid_amount']),
                'balance' => floatval($row['balance']),
                'paymentMethod' => $row['payment_method'] ?? '',
                'paymentInstructions' => $row['payment_instructions'] ?? '',
                'notes' => $row['notes'] ?? '',
                'status' => $displayStatus,
                'billingCompany' => $row['company_name'] ?? '-',
                'items' => $items,
                'laborCost' => round($laborCost, 2),
                'subtotal' => floatval($row['subtotal']),
                'taxRate' => floatval($row['tax_rate']),
                'tax' => floatval($row['tax_amount']),
                'total' => floatval($row['total'])
            ]
        ];
    }
    return $bookings;
}

function customerAccountingInvoiceBookings($con, $auth) {
    if (!tableExists($con, 'accounting_invoice')) return [];
    $companyId = intval($auth['companyId']);
    $where = !empty($auth['isSuperadmin']) ? '' : " AND ai.company_id = $companyId";
    $result = mysqli_query($con, "SELECT ai.*, comp.name AS company_name, j.work_order_no,
        j.service_type, j.service_centre
        FROM accounting_invoice ai
        LEFT JOIN company comp ON comp.id = ai.company_id
        LEFT JOIN job j ON j.id = ai.work_order_id
        WHERE ai.document_status = 'approved'$where
        ORDER BY ai.invoice_date DESC, ai.id DESC");
    $bookings = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $invoiceId = intval($row['id']);
        $items = accountingInvoiceItems($con, $invoiceId);
        $status = accountingInvoicePaymentStatus($row);
        $total = floatval($row['total']);
        $outstanding = floatval($row['outstanding']);
        $bookings[] = [
            'id' => 'ai' . $invoiceId,
            'bookingNumber' => $row['external_job_no'] ?: ($row['work_order_no'] ?: '-'),
            'invoiceNumber' => $row['external_invoice_no'],
            'orderType' => 'service',
            'vehicleId' => $row['vehicle_id'] ? 'v' . intval($row['vehicle_id']) : null,
            'serviceType' => $row['service_type'] ?: 'Workshop Service',
            'serviceDate' => $row['invoice_date'],
            'serviceCentre' => $row['service_centre'] ?: 'Mewah AutoWorks',
            'status' => 'completed',
            'totalPrice' => $total,
            'workOrderId' => $row['work_order_id'] ? 'wo' . intval($row['work_order_id']) : null,
            'workOrderNumber' => $row['work_order_no'],
            'items' => $items,
            'invoice' => [
                'id' => strval($invoiceId),
                'source' => $row['source'],
                'summaryOnly' => boolval($row['summary_only']),
                'invoiceNumber' => $row['external_invoice_no'],
                'workOrderId' => $row['external_job_no'] ?: $row['work_order_no'],
                'vehicleNoRaw' => $row['vehicle_no_raw'] ?? '',
                'issuedAt' => $row['invoice_date'],
                'paidAmount' => max(0, round($total - $outstanding, 2)),
                'balance' => $outstanding,
                'status' => $status,
                'documentStatus' => $row['document_status'],
                'eInvoiceStatus' => $row['e_invoice_status'] ?? '',
                'eInvoiceUuid' => $row['e_invoice_uuid'] ?? '',
                'billingCompany' => $row['company_name'] ?? '-',
                'items' => $items,
                'laborCost' => 0,
                'subtotal' => $total,
                'tax' => 0,
                'total' => $total
            ]
        ];
    }
    return $bookings;
}

function customerReminders($con, $auth, $vehicles) {
    $reminders = [];
    $serviceRemindersEnabled = systemSettingValue($con, 'notifications.service_reminders') === '1';
    foreach ($vehicles as $vehicle) {
        if (!empty($vehicle['nextServiceDate']) || !empty($vehicle['nextServiceMileage'])) {
            $reminders[] = [
                'id' => 'reminder-' . $vehicle['id'],
                'vehicleId' => $vehicle['id'],
                'nextServiceDate' => $vehicle['nextServiceDate'],
                'recommendedMileage' => intval($vehicle['nextServiceMileage']),
                'currentMileage' => intval($vehicle['mileage']),
                'serviceType' => 'Regular Maintenance',
                'notificationEnabled' => $serviceRemindersEnabled
            ];
        }
    }
    return $reminders;
}

/**
 * Handle customer and company routes.
 */
function handleCustomerRoute($con, $mode, $inputData) {
    switch ($mode) {
    case 'customer-support-settings':
    case 'public-support-settings':
        ensureSchema($con);
        sendResponse(true, 'Support settings retrieved.', [
            'phone' => systemSettingValue($con, 'support.phone'),
            'whatsapp' => systemSettingValue($con, 'support.whatsapp'),
            'email' => systemSettingValue($con, 'support.email'),
            'operatingHours' => systemSettingValue($con, 'support.operating_hours'),
            'company' => [
                'legalName' => systemSettingValue($con, 'company.legal_name'),
                'address' => systemSettingValue($con, 'company.address'),
                'phone' => systemSettingValue($con, 'company.phone'),
            ]
        ]);
        break;

    case 'customer-login':
        $identifier = trim($inputData['identifier'] ?? $inputData['username'] ?? '');
        $password = $inputData['password'] ?? '';
        if ($identifier === '' || $password === '') {
            sendResponse(false, 'Email or name and password are required.', null, 422);
        }

        $identifierEscaped = mysqli_real_escape_string($con, $identifier);
        $source = null;
        $row = null;
        $isSuperadmin = false;

        if (tableExists($con, 'admin_users') && columnExists($con, 'admin_users', 'username')) {
            $adminIdentifierConditions = ["username = '$identifierEscaped'"];
            if (columnExists($con, 'admin_users', 'email')) {
                $adminIdentifierConditions[] = "email = '$identifierEscaped'";
            }
            $adminResult = mysqli_query(
                $con,
                "SELECT * FROM admin_users
                 WHERE (" . implode(' OR ', $adminIdentifierConditions) . ")
                   AND role = 'superadmin'
                   AND is_active = 1
                 LIMIT 1"
            );
            $adminRow = $adminResult ? mysqli_fetch_assoc($adminResult) : null;
            $adminPasswordHash = $adminRow ? rowValue($adminRow, ['password', 'password_hash'], '') : '';
            if ($adminRow && $adminPasswordHash !== '' && password_verify($password, $adminPasswordHash)) {
                $source = 'admin_users';
                $row = $adminRow;
                $isSuperadmin = true;
            }
        }

        if (!$row) {
            $source = tableExists($con, 'customer') ? 'customer' : 'users';
            if (!tableExists($con, $source) || !columnExists($con, $source, 'company_id')) {
                sendResponse(false, 'Customer company access is not configured.', null, 503);
            }

            $customerIdentifierConditions = [];
            if (columnExists($con, $source, 'name')) {
                $customerIdentifierConditions[] = "name = '$identifierEscaped'";
            }
            if (columnExists($con, $source, 'username')) {
                $customerIdentifierConditions[] = "username = '$identifierEscaped'";
            }
            if (columnExists($con, $source, 'email')) {
                $customerIdentifierConditions[] = "email = '$identifierEscaped'";
            }
            if (empty($customerIdentifierConditions)) {
                sendResponse(false, 'Customer email and name login are not configured.', null, 503);
            }

            $customerRoleSql =
                $source === 'users' && columnExists($con, $source, 'role')
                    ? " AND role = 'customer'"
                    : '';
            $result = mysqli_query(
                $con,
                "SELECT * FROM `$source`
                 WHERE (" . implode(' OR ', $customerIdentifierConditions) . ") $customerRoleSql
                 LIMIT 50"
            );
            while ($result && $candidate = mysqli_fetch_assoc($result)) {
                $candidatePasswordHash = rowValue($candidate, ['password', 'password_hash'], '');
                if ($candidatePasswordHash !== '' && password_verify($password, $candidatePasswordHash)) {
                    $row = $candidate;
                    break;
                }
            }
        }

        $passwordHash = $row ? rowValue($row, ['password', 'password_hash'], '') : '';
        $companyId = intval($row['company_id'] ?? 0);
        if (
            !$row ||
            $passwordHash === '' ||
            (!$isSuperadmin && !password_verify($password, $passwordHash)) ||
            (!$isSuperadmin && $companyId <= 0)
        ) {
            sendResponse(false, 'Invalid email, name, or password.', null, 401);
        }
        if (isset($row['is_active']) && !boolval($row['is_active'])) {
            sendResponse(false, 'Customer account is inactive.', null, 403);
        }

        session_regenerate_id(true);
        $_SESSION['customer_user_id'] = intval($row['id']);
        $_SESSION['customer_company_id'] = $companyId;
        $_SESSION['customer_source'] = $source;
        $_SESSION['customer_is_superadmin'] = $isSuperadmin;
        $_SESSION['customer_remember_me'] = !empty($inputData['rememberMe']);
        $_SESSION['customer_csrf_token'] = bin2hex(random_bytes(32));
        $auth = [
            'userId' => intval($row['id']),
            'companyId' => $companyId,
            'source' => $source,
            'isSuperadmin' => $isSuperadmin
        ];
        $payload = customerUserPayload($con, $auth, $row);
        $payload['csrfToken'] = $_SESSION['customer_csrf_token'];
        sendResponse(true, 'Login successful.', $payload);
        break;

    case 'customer-logout':
        unset(
            $_SESSION['customer_user_id'],
            $_SESSION['customer_company_id'],
            $_SESSION['customer_source'],
            $_SESSION['customer_is_superadmin'],
            $_SESSION['customer_remember_me'],
            $_SESSION['customer_csrf_token']
        );
        session_regenerate_id(true);
        sendResponse(true, 'Logged out.', null);
        break;

    case 'customer-bootstrap':
        $auth = requireCustomerSession();
        $user = customerUserPayload($con, $auth);
        $vehicles = $user['vehicles'];
        sendResponse(true, 'Customer data retrieved.', [
            'user' => $user,
            'contacts' => customerContacts($con, $auth, $user),
            'bookings' => customerBookings($con, $auth),
            'parts' => customerParts($con),
            'reminders' => customerReminders($con, $auth, $vehicles),
            'notifications' => customerNotifications($con, $auth),
            'workOrders' => customerWorkOrders($con, $auth),
            'systemSettings' => systemSettingsPayload($con),
            'serviceCentres' => customerServiceCentres(),
            'notificationPreferences' => customerNotificationPreferences($con, $auth)
        ]);
        break;

    case 'customer-update-profile':
        $auth = requireCustomerSession();
        $name = trim(strval($inputData['name'] ?? ''));
        $phone = trim(strval($inputData['phone'] ?? ''));
        if ($name === '' || strlen($name) > 100) {
            sendResponse(false, 'Full name is required and must not exceed 100 characters.', null, 400);
        }
        $phoneDigits = preg_replace('/\D+/', '', $phone);
        if (strlen($phoneDigits) < 9 || strlen($phoneDigits) > 15) {
            sendResponse(false, 'Enter a valid Malaysia phone number.', null, 400);
        }

        $currentRecord = customerRecord($con, $auth);
        $oldName = trim(strval(rowValue($currentRecord, ['name', 'username'], '')));
        $oldPhone = trim(strval(rowValue($currentRecord, ['phone'], '')));
        $normalizedNewPhone = formatMalaysiaPhone($phone);
        $normalizedOldPhone = formatMalaysiaPhone($oldPhone);
        $companyId = intval($auth['companyId'] ?? 0);
        $companyName = customerCompanyName($con, $companyId);
        $userId = intval($auth['userId'] ?? 0);
        $source = $auth['source'] ?? 'customer';

        $nameChanged = $name !== '' && $name !== $oldName;
        $phoneChanged = $phone !== '' && $phoneDigits !== preg_replace('/\D+/', '', $oldPhone);

        $nameSql = mysqli_real_escape_string($con, $name);
        $phoneSql = mysqli_real_escape_string($con, $phone);

        if ($source === 'customer' && tableExists($con, 'customer')) {
            mysqli_query($con, "UPDATE customer SET name = '$nameSql', phone = '$phoneSql' WHERE id = $userId");
        } elseif ($source === 'users' && tableExists($con, 'users')) {
            mysqli_query($con, "UPDATE users SET name = '$nameSql', phone = '$phoneSql' WHERE id = $userId");
        } elseif ($source === 'admin_users' && tableExists($con, 'admin_users')) {
            mysqli_query($con, "UPDATE admin_users SET name = '$nameSql', phone = '$phoneSql' WHERE id = $userId");
        }

        if ($nameChanged || $phoneChanged) {
            $changeDetails = [];
            if ($nameChanged) {
                $changeDetails[] = "Name changed from \"$oldName\" to \"$name\"";
            }
            if ($phoneChanged) {
                $changeDetails[] = "Phone changed from \"$normalizedOldPhone\" to \"$normalizedNewPhone\"";
            }
            $changesSummary = implode('; ', $changeDetails);
            $displayName = $oldName ?: $name;

            createCustomerRecordNotification(
                $con,
                $source,
                $companyId,
                $userId,
                "Customer Contact Updated: $displayName",
                "User $displayName ($companyName) updated personal details on Customer App: $changesSummary.",
                'info',
                in_array(strval($document['uploaded_by_source'] ?? ''), ['customer', 'users', 'admin_users'], true) ? strval($document['uploaded_by_source']) : 'customer',
                strval($userId),
                '/customers'
            );
        }

        sendResponse(true, 'Profile updated successfully.', customerUserPayload($con, $auth));
        break;

    case 'customer-save-delivery-address':
        $auth = requireCustomerSession();
        if (!customerDeliveryAddressStorage($con, $auth)) {
            sendResponse(false, 'Delivery address storage is unavailable for this account.', null, 409);
        }
        $addressId = trim(strval($inputData['id'] ?? ''));
        $contactName = trim(strval($inputData['contactName'] ?? ''));
        $addressText = trim(strval($inputData['address'] ?? ''));
        $contactPhone = trim(strval($inputData['contactPhone'] ?? ''));
        $isDefault = !empty($inputData['isDefault']);
        if ($contactName === '' || strlen($contactName) > 100) {
            sendResponse(false, 'Contact name is required and must not exceed 100 characters.', null, 400);
        }
        if ($addressText === '' || strlen($addressText) > 500) {
            sendResponse(false, 'Delivery address is required and must not exceed 500 characters.', null, 400);
        }
        if (!isValidMalaysiaPhone($contactPhone)) {
            sendResponse(false, 'Enter a valid Malaysia mobile or landline number.', null, 400);
        }
        if ($addressId !== '' && !preg_match('/^[A-Za-z0-9_-]{1,80}$/', $addressId)) {
            sendResponse(false, 'Invalid delivery address identifier.', null, 400);
        }

        $addresses = customerDeliveryAddresses($con, $auth);
        $existingIndex = null;
        foreach ($addresses as $index => $address) {
            if (strval($address['id'] ?? '') === $addressId && $addressId !== '') {
                $existingIndex = $index;
                break;
            }
        }
        if ($existingIndex === null && count($addresses) >= 20) {
            sendResponse(false, 'A maximum of 20 delivery addresses is allowed.', null, 409);
        }
        if ($addressId === '') $addressId = 'addr-' . bin2hex(random_bytes(8));
        if (count($addresses) === 0) $isDefault = true;
        if ($isDefault) {
            foreach ($addresses as &$address) $address['isDefault'] = false;
            unset($address);
        }
        $savedAddress = [
            'id' => $addressId,
            'contactName' => $contactName,
            'address' => $addressText,
            'contactPhone' => formatMalaysiaPhone($contactPhone),
            'isDefault' => $isDefault
        ];
        if ($existingIndex === null) $addresses[] = $savedAddress;
        else $addresses[$existingIndex] = $savedAddress;
        $hasDefault = false;
        foreach ($addresses as $address) {
            if (!empty($address['isDefault'])) {
                $hasDefault = true;
                break;
            }
        }
        if (!$hasDefault && count($addresses) > 0) $addresses[0]['isDefault'] = true;
        if (!persistCustomerDeliveryAddresses($con, $auth, $addresses)) {
            sendResponse(false, 'Unable to save the delivery address.', null, 500);
        }
        sendResponse(true, 'Delivery address saved.', customerUserPayload($con, $auth));
        break;

    case 'customer-delete-delivery-address':
        $auth = requireCustomerSession();
        if (!customerDeliveryAddressStorage($con, $auth)) {
            sendResponse(false, 'Delivery address storage is unavailable for this account.', null, 409);
        }
        $addressId = trim(strval($inputData['id'] ?? ''));
        if ($addressId === '' || !preg_match('/^[A-Za-z0-9_-]{1,80}$/', $addressId)) {
            sendResponse(false, 'A valid delivery address is required.', null, 400);
        }
        $addresses = customerDeliveryAddresses($con, $auth);
        $remaining = array_values(array_filter($addresses, function ($address) use ($addressId) {
            return strval($address['id'] ?? '') !== $addressId;
        }));
        if (count($remaining) === count($addresses)) {
            sendResponse(false, 'Delivery address not found.', null, 404);
        }
        $hasDefault = false;
        foreach ($remaining as $address) {
            if (!empty($address['isDefault'])) {
                $hasDefault = true;
                break;
            }
        }
        if (!$hasDefault && count($remaining) > 0) $remaining[0]['isDefault'] = true;
        if (!persistCustomerDeliveryAddresses($con, $auth, $remaining)) {
            sendResponse(false, 'Unable to delete the delivery address.', null, 500);
        }
        sendResponse(true, 'Delivery address deleted.', customerUserPayload($con, $auth));
        break;

    case 'customer-mark-notifications-read':
        $auth = requireCustomerSession();
        $companyId = intval($auth['companyId']);
        $userId = intval($auth['userId']);
        $table = tableExists($con, 'customer_notification') ? 'customer_notification' : 'notifications';
        if (!tableExists($con, $table) || !columnExists($con, $table, 'is_read')) {
            sendResponse(false, 'Notification read status is not supported.', null, 409);
        }
        if (!empty($auth['isSuperadmin'])) {
            $where = '1 = 1';
        } elseif (columnExists($con, $table, 'customer_id') && $auth['source'] === 'customer') {
            $where = "customer_id = $userId";
        } elseif ($table === 'notifications' && columnExists($con, $table, 'user_id') && $auth['source'] === 'users') {
            $where = "user_id = $userId";
        } elseif (columnExists($con, $table, 'company_id')) {
            $where = "company_id = $companyId";
        } else {
            sendResponse(false, 'Notification ownership is not configured.', null, 409);
        }
        $notificationId = intval(preg_replace('/\D+/', '', strval($inputData['id'] ?? '')));
        if ($notificationId > 0) {
            $where .= " AND id = $notificationId";
        }
        if (!mysqli_query($con, "UPDATE `$table` SET is_read = 1 WHERE $where")) {
            sendResponse(false, 'Unable to update notifications.', null, 500);
        }
        sendResponse(true, 'Notifications marked as read.', null);
        break;

    case 'customer-update-notification-preferences':
        $auth = requireCustomerSession();
        requireCustomerNotificationPreferencesSchema($con);
        $userId = intval($auth['userId']);
        if ($userId <= 0) {
            sendResponse(false, 'Unauthorized customer session.', null, 401);
        }
        $pref = is_array($inputData['preferences'] ?? null) ? $inputData['preferences'] : $inputData;
        $bookingUpdates = isset($pref['bookingUpdates']) ? (empty($pref['bookingUpdates']) ? 0 : 1) : 1;
        $repairUpdates = isset($pref['repairUpdates']) ? (empty($pref['repairUpdates']) ? 0 : 1) : 1;
        $serviceReminders = isset($pref['serviceReminders']) ? (empty($pref['serviceReminders']) ? 0 : 1) : 1;
        $partsOrders = isset($pref['partsOrders']) ? (empty($pref['partsOrders']) ? 0 : 1) : 1;
        $invoiceUpdates = isset($pref['invoiceUpdates']) ? (empty($pref['invoiceUpdates']) ? 0 : 1) : 1;
        $email = isset($pref['email']) ? (empty($pref['email']) ? 0 : 1) : 1;
        $push = isset($pref['push']) ? (empty($pref['push']) ? 0 : 1) : 1;

        $upsertSql = "INSERT INTO `customer_notification_preferences` 
            (`customer_user_id`, `booking_updates`, `repair_updates`, `service_reminders`, `parts_orders`, `invoice_updates`, `email_delivery`, `push_notifications`, `updated_at`)
            VALUES ($userId, $bookingUpdates, $repairUpdates, $serviceReminders, $partsOrders, $invoiceUpdates, $email, $push, NOW())
            ON DUPLICATE KEY UPDATE
            `booking_updates` = VALUES(`booking_updates`),
            `repair_updates` = VALUES(`repair_updates`),
            `service_reminders` = VALUES(`service_reminders`),
            `parts_orders` = VALUES(`parts_orders`),
            `invoice_updates` = VALUES(`invoice_updates`),
            `email_delivery` = VALUES(`email_delivery`),
            `push_notifications` = VALUES(`push_notifications`),
            `updated_at` = NOW()";

        if (!@mysqli_query($con, $upsertSql)) {
            sendResponse(false, 'Unable to update notification preferences: ' . mysqli_error($con), null, 500);
        }

        sendResponse(true, 'Notification preferences updated.', customerNotificationPreferences($con, $auth));
        break;

    case 'admin-customers':
        $legacyCustomers = legacyCustomers($con);
        if ($legacyCustomers !== null) {
            sendResponse(true, 'Admin customers retrieved', $legacyCustomers);
        }

        $customers = [];
        $bookingDateColumn = firstColumn($con, 'bookings', ['service_date', 'appointment_at', 'date', 'created_at']);
        $vehicleCountSql = columnExists($con, 'vehicles', 'company_id')
            ? '(SELECT COUNT(*) FROM vehicles company_vehicle WHERE company_vehicle.company_id = u.company_id)'
            : '0';
        $bookingCountSql = "(SELECT COUNT(DISTINCT company_booking.id)
            FROM bookings company_booking
            JOIN users booking_user ON booking_user.id = company_booking.user_id
            WHERE booking_user.company_id = u.company_id)";
        $lastVisitSql = $bookingDateColumn
            ? "(SELECT MAX(company_booking.`$bookingDateColumn`)
                FROM bookings company_booking
                JOIN users booking_user ON booking_user.id = company_booking.user_id
                WHERE booking_user.company_id = u.company_id)"
            : 'NULL';
        $query = "SELECT u.id, u.name, u.email, u.phone, u.created_at, u.company_id, u.delivery_addresses, u.is_active,
                         comp.name AS company_name,
                         $vehicleCountSql AS vehicles,
                         $bookingCountSql AS total_bookings,
                         $lastVisitSql AS last_visit
                  FROM users u
                  LEFT JOIN company comp ON u.company_id = comp.id
                  WHERE u.role = 'customer'
                  ORDER BY u.created_at DESC";
        $result = mysqli_query($con, $query);
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $lastVisit = $row['last_visit'] ? substr($row['last_visit'], 0, 10) : null;
            $customers[] = [
                'id' => intval($row['id']),
                'name' => $row['name'],
                'email' => $row['email'],
                'phone' => formatMalaysiaPhone($row['phone']),
                'vehicles' => intval($row['vehicles']),
                'totalBookings' => intval($row['total_bookings']),
                'lastVisit' => $lastVisit ?: '-',
                'companyId' => intval($row['company_id'] ?? 0),
                'companyName' => $row['company_name'] ?? '-',
                'deliveryAddresses' => formatMalaysiaDeliveryAddresses(json_decode(strval($row['delivery_addresses'] ?? '[]'), true) ?: []),
                'status' => boolval($row['is_active'] ?? 1) ? 'Active' : 'Inactive'
            ];
        }
        sendResponse(true, 'Admin customers retrieved', $customers);
        break;

    case 'admin-create-customer':
        $name = mysqli_real_escape_string($con, trim($inputData['name'] ?? ''));
        $emailInput = trim($inputData['email'] ?? '');
        $phoneInput = trim($inputData['phone'] ?? '');
        $password = $inputData['password'] ?? '';
        $companyId = intval($inputData['companyId'] ?? 0);
        $isActive = strtolower(trim(strval($inputData['status'] ?? 'Active'))) !== 'inactive' ? 1 : 0;
        try {
            $deliveryAddresses = normalizeDeliveryAddressList($inputData['deliveryAddresses'] ?? []);
        } catch (Throwable $error) {
            sendResponse(false, $error->getMessage(), null, intval($error->getCode()) ?: 422);
        }

        if (!$name || !$emailInput || !$phoneInput || $password === '' || !$companyId) {
            sendResponse(false, 'Name, email, phone, password, and company are required', null, 400);
        }
        if (!companyExists($con, $companyId)) {
            sendResponse(false, 'Select an existing company', null, 400);
        }
        if (!isValidEmailAddress($emailInput)) {
            sendResponse(false, 'Enter a valid email address, for example name@example.com', null, 400);
        }
        if (!isValidMalaysiaPhone($phoneInput)) {
            sendResponse(false, 'Enter a valid Malaysia mobile or landline number', null, 400);
        }
        $passwordError = passwordValidationError($password);
        if ($passwordError !== null) {
            sendResponse(false, $passwordError, null, 422);
        }
        $email = mysqli_real_escape_string($con, normalizeEmailAddress($emailInput));
        $phone = mysqli_real_escape_string($con, formatMalaysiaPhone($phoneInput));
        $deliveryAddressesJson = mysqli_real_escape_string($con, json_encode($deliveryAddresses, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        $companyUserTable = companyUserTable($con);
        if ($companyUserTable === 'customer') {
            $query = "INSERT INTO customer (name, username, password, company_id, phone, email, delivery_addresses, is_active)
                      VALUES ('$name', '$name', '$passwordHash', $companyId, '$phone', '$email', '$deliveryAddressesJson', $isActive)";
        } else {
            $usernameColumn = columnExists($con, 'users', 'username') ? ', username' : '';
            $usernameValue = $usernameColumn !== '' ? ", '$name'" : '';
            $query = "INSERT INTO users (name$usernameColumn, email, phone, password, role, delivery_addresses, company_id, is_active)
                      VALUES ('$name'$usernameValue, '$email', '$phone', '$passwordHash', 'customer', '$deliveryAddressesJson', $companyId, $isActive)";
        }

        if (mysqli_query($con, $query)) {
            sendResponse(true, 'Customer created successfully', ['id' => mysqli_insert_id($con)]);
        }

        sendResponse(false, 'Failed to create customer: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-update-customer':
        $customerId = intval($inputData['id'] ?? 0);
        $name = mysqli_real_escape_string($con, trim($inputData['name'] ?? ''));
        $emailInput = trim($inputData['email'] ?? '');
        $phoneInput = trim($inputData['phone'] ?? '');
        $password = $inputData['password'] ?? '';
        $companyId = intval($inputData['companyId'] ?? 0);
        $isActive = strtolower(trim(strval($inputData['status'] ?? 'Active'))) !== 'inactive' ? 1 : 0;
        $deliveryAddressesSql = '';
        if (array_key_exists('deliveryAddresses', $inputData)) {
            try {
                $deliveryAddresses = normalizeDeliveryAddressList($inputData['deliveryAddresses']);
            } catch (Throwable $error) {
                sendResponse(false, $error->getMessage(), null, intval($error->getCode()) ?: 422);
            }
            $deliveryAddressesJson = mysqli_real_escape_string($con, json_encode($deliveryAddresses, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $deliveryAddressesSql = ", delivery_addresses = '$deliveryAddressesJson'";
        }

        if (!$customerId || !$name || !$emailInput || !$phoneInput || !$companyId) {
            sendResponse(false, 'Customer ID, name, email, phone, and company are required', null, 400);
        }
        if (!companyExists($con, $companyId)) {
            sendResponse(false, 'Select an existing company', null, 400);
        }
        if (!isValidEmailAddress($emailInput)) {
            sendResponse(false, 'Enter a valid email address, for example name@example.com', null, 400);
        }
        if (!isValidMalaysiaPhone($phoneInput)) {
            sendResponse(false, 'Enter a valid Malaysia mobile or landline number', null, 400);
        }
        $email = mysqli_real_escape_string($con, normalizeEmailAddress($emailInput));
        $phone = mysqli_real_escape_string($con, formatMalaysiaPhone($phoneInput));

        $passwordSql = '';
        if ($password !== '') {
            $passwordError = passwordValidationError($password, 'New password');
            if ($passwordError !== null) {
                sendResponse(false, $passwordError, null, 422);
            }
            $currentPasswordHash = customerPasswordHash($con, $customerId);
            if ($currentPasswordHash === '') {
                sendResponse(false, 'Unable to verify the current password. Password was not changed.', null, 409);
            }
            if (password_verify($password, $currentPasswordHash)) {
                sendResponse(false, 'New password must be different from the current password', null, 409);
            }
            $passwordHash = mysqli_real_escape_string($con, password_hash($password, PASSWORD_DEFAULT));
            $passwordSql = ", password = '$passwordHash'";
        }

        $companyUserTable = companyUserTable($con);
        $roleWhere = $companyUserTable === 'users' && columnExists($con, 'users', 'role') ? " AND role = 'customer'" : '';
        if ($isActive === 0) {
            $currentUserResult = mysqli_query($con, "SELECT company_id, is_active FROM `$companyUserTable` WHERE id = $customerId$roleWhere LIMIT 1");
            $currentUser = $currentUserResult ? mysqli_fetch_assoc($currentUserResult) : null;
            $currentCompanyId = intval($currentUser['company_id'] ?? 0);
            if ($currentCompanyId > 0 && boolval($currentUser['is_active'] ?? 1)) {
                $activeRoleWhere = $companyUserTable === 'users' && columnExists($con, 'users', 'role') ? " AND role = 'customer'" : '';
                if (countRows($con, $companyUserTable, "company_id = $currentCompanyId AND is_active = 1$activeRoleWhere") <= 1) {
                    sendResponse(false, 'A company must keep at least one active app user.', null, 409);
                }
            }
        }
        if ($companyUserTable === 'customer') {
            $query = "UPDATE customer
                      SET name = '$name', username = '$name', email = '$email', phone = '$phone', company_id = $companyId, is_active = $isActive $passwordSql $deliveryAddressesSql
                      WHERE id = $customerId";
        } else {
            $usernameSql = columnExists($con, 'users', 'username') ? ", username = '$name'" : '';
            $query = "UPDATE users
                      SET name = '$name' $usernameSql, email = '$email', phone = '$phone', company_id = $companyId, is_active = $isActive $passwordSql $deliveryAddressesSql
                      WHERE id = $customerId AND role = 'customer'";
        }

        if (mysqli_query($con, $query)) {
            sendResponse(true, 'Customer updated successfully', ['id' => $customerId]);
        }

        sendResponse(false, 'Failed to update customer: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-delete-customer':
        $customerId = intval($inputData['id'] ?? 0);

        if (!$customerId) {
            sendResponse(false, 'Customer ID is required', null, 400);
        }

        $companyUserTable = companyUserTable($con);
        if (!$companyUserTable) sendResponse(false, 'Company user storage is unavailable.', null, 503);
        $companyUserResult = mysqli_query($con, "SELECT company_id FROM `$companyUserTable` WHERE id = $customerId LIMIT 1");
        $companyUser = $companyUserResult ? mysqli_fetch_assoc($companyUserResult) : null;
        $companyId = intval($companyUser['company_id'] ?? 0);
        if ($companyId > 0) {
            $roleWhere = $companyUserTable === 'users' && columnExists($con, 'users', 'role') ? " AND role = 'customer'" : '';
            if (countRows($con, $companyUserTable, "company_id = $companyId$roleWhere") <= 1) {
                sendResponse(false, 'A company must keep at least one active app user.', null, 409);
            }
        }

        $roleWhere = $companyUserTable === 'users' && columnExists($con, 'users', 'role') ? " AND role = 'customer'" : '';
        $replacementResult = mysqli_query(
            $con,
            "SELECT id FROM `$companyUserTable`
             WHERE company_id = $companyId AND id <> $customerId$roleWhere
             ORDER BY id LIMIT 1"
        );
        $replacement = $replacementResult ? mysqli_fetch_assoc($replacementResult) : null;
        $replacementId = intval($replacement['id'] ?? 0);
        if ($replacementId <= 0) sendResponse(false, 'Select or create another company user before deleting this account.', null, 409);

        mysqli_begin_transaction($con);
        $vehicleTable = unifiedVehicleTable($con);
        if ($vehicleTable) {
            $vehicleContactColumn = $vehicleTable === 'customer_vehicle'
                ? firstColumn($con, $vehicleTable, ['customer_id', 'user_id', 'owner_id'])
                : firstColumn($con, $vehicleTable, ['user_id', 'customer_id', 'owner_id']);
            if ($vehicleContactColumn && !mysqli_query($con, "UPDATE `$vehicleTable` SET `$vehicleContactColumn` = $replacementId WHERE `$vehicleContactColumn` = $customerId")) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to reassign company vehicles before deleting this user.', null, 500);
            }
        }
        $bookingTable = tableExists($con, 'customer_appointment') ? 'customer_appointment' : (tableExists($con, 'bookings') ? 'bookings' : null);
        if ($bookingTable) {
            $bookingContactColumn = firstColumn($con, $bookingTable, $bookingTable === 'customer_appointment' ? ['customer_id', 'user_id'] : ['user_id', 'customer_id']);
            if ($bookingContactColumn && !mysqli_query($con, "UPDATE `$bookingTable` SET `$bookingContactColumn` = $replacementId WHERE `$bookingContactColumn` = $customerId")) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to reassign company bookings before deleting this user.', null, 500);
            }
        }

        if ($companyUserTable === 'customer') {
            $query = "DELETE FROM customer WHERE id = $customerId";
        } else {
            $query = "DELETE FROM users WHERE id = $customerId AND role = 'customer'";
        }

        if (mysqli_query($con, $query)) {
            mysqli_commit($con);
            sendResponse(true, 'Customer deleted successfully', ['id' => $customerId]);
        }

        mysqli_rollback($con);
        sendResponse(false, 'Failed to delete customer: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-drivers':
        $drivers = [];
        $result = mysqli_query(
            $con,
            "SELECT d.*, comp.name AS company_name
             FROM company_driver d
             LEFT JOIN company comp ON comp.id = d.company_id
             ORDER BY d.name, d.id"
        );
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $drivers[] = [
                'id' => intval($row['id']),
                'companyId' => intval($row['company_id']),
                'companyName' => $row['company_name'] ?? '-',
                'name' => $row['name'],
                'phone' => formatMalaysiaPhone($row['phone'] ?? ''),
                'licenceNo' => $row['licence_no'] ?? '',
                'status' => $row['status'] ?? 'Active',
                'notes' => $row['notes'] ?? ''
            ];
        }
        sendResponse(true, 'Company drivers retrieved', $drivers);
        break;

    case 'admin-create-driver':
        sendResponse(false, 'Driver master records are managed in AutoCount and synchronized automatically.', null, 403);
        break;

    case 'admin-update-driver':
        $driverId = intval($inputData['id'] ?? 0);
        $companyId = intval($inputData['companyId'] ?? 0);
        $nameValue = trim(preg_replace('/\s+/', ' ', strval($inputData['name'] ?? '')));
        $phoneInput = trim(strval($inputData['phone'] ?? ''));
        $licenceNoValue = strtoupper(trim(strval($inputData['licenceNo'] ?? '')));
        $statusValue = ucfirst(strtolower(trim(strval($inputData['status'] ?? 'Active'))));
        $notesValue = trim(strval($inputData['notes'] ?? ''));
        if ($driverId <= 0) sendResponse(false, 'Driver ID is required.', null, 422);
        if (!companyExists($con, $companyId)) sendResponse(false, 'Select an existing company.', null, 422);
        if ($nameValue === '') sendResponse(false, 'Driver name is required.', null, 422);
        if ($phoneInput !== '' && !isValidMalaysiaPhone($phoneInput)) {
            sendResponse(false, 'Enter a valid Malaysia mobile or landline number.', null, 422);
        }
        if (!in_array($statusValue, ['Active', 'Inactive'], true)) {
            sendResponse(false, 'Select a valid driver status.', null, 422);
        }
        if (strlen($licenceNoValue) > 100 || strlen($notesValue) > 500) {
            sendResponse(false, 'Driver licence or notes are too long.', null, 422);
        }
        $name = mysqli_real_escape_string($con, $nameValue);
        $phone = mysqli_real_escape_string($con, $phoneInput === '' ? '' : formatMalaysiaPhone($phoneInput));
        $licenceNo = mysqli_real_escape_string($con, $licenceNoValue);
        $status = mysqli_real_escape_string($con, $statusValue);
        $notes = mysqli_real_escape_string($con, $notesValue);
        $duplicateWhere = "company_id = $companyId AND LOWER(TRIM(name)) = LOWER('$name') AND id <> $driverId";
        if (countRows($con, 'company_driver', $duplicateWhere) > 0) {
            sendResponse(false, 'This company already has a driver with the same name.', null, 409);
        }
        $driverQuery = "UPDATE company_driver SET company_id = $companyId, name = '$name', phone = '$phone', licence_no = '$licenceNo', status = '$status', notes = '$notes' WHERE id = $driverId";
        if (!mysqli_query($con, $driverQuery)) {
            sendResponse(false, 'Unable to save driver: ' . mysqli_error($con), null, 500);
        }
        if (mysqli_affected_rows($con) < 1 && countRows($con, 'company_driver', "id = $driverId") < 1) {
            sendResponse(false, 'Driver not found.', null, 404);
        }
        sendResponse(true, 'Driver updated.', ['id' => $driverId]);
        break;

    case 'admin-delete-driver':
        sendResponse(false, 'Driver master records are managed in AutoCount and cannot be deleted from the workshop panel.', null, 403);
        break;

    case 'admin-companies':
        ensureSchema($con);
        $companies = [];
        $hasDebtor = tableExists($con, 'Debtor');
        $hasCompany = tableExists($con, 'company');
        $customerTable = tableExists($con, 'customer') ? 'customer' : 'users';
        $vehicleTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
        $customerCondition = $customerTable === 'users' ? " AND role = 'customer'" : "";

        // Automatically ensure all AutoCount Debtors have a master record in company table
        if ($hasDebtor && $hasCompany && columnExists($con, 'company', 'autocount_debtor_code')) {
            $syncSql = "INSERT INTO company (name, phone, email, address, autocount_debtor_code, created_at)
                        SELECT 
                            TRIM(COALESCE(NULLIF(d.CompanyName, ''), CONCAT('Debtor ', d.AccNo))),
                            TRIM(COALESCE(NULLIF(d.Phone1, ''), NULLIF(d.Mobile, ''), '')),
                            TRIM(COALESCE(NULLIF(d.EmailAddress, ''), '')),
                            TRIM(CONCAT_WS(', ', NULLIF(d.Address1, ''), NULLIF(d.Address2, ''), NULLIF(d.Address3, ''), NULLIF(d.Address4, ''))),
                            d.AccNo,
                            NOW()
                        FROM Debtor d
                        LEFT JOIN company c ON c.autocount_debtor_code = d.AccNo
                        WHERE c.id IS NULL AND d.AccNo IS NOT NULL AND d.AccNo <> ''";
            mysqli_query($con, $syncSql);
        }

        $seenCodes = [];

        if ($hasDebtor) {
            $compJoin = $hasCompany
                ? "LEFT JOIN company c ON c.autocount_debtor_code = d.AccNo"
                : "";
            $compSelect = $hasCompany
                ? "c.id AS company_id, 
                   c.name AS company_override_name,
                   c.phone AS company_override_phone,
                   c.email AS company_override_email,
                   c.address AS company_override_address,
                   (SELECT COUNT(*) FROM $vehicleTable WHERE company_id = c.id) AS vehicles,
                   (SELECT COUNT(*) FROM $customerTable WHERE company_id = c.id $customerCondition) AS customers"
                : "NULL AS company_id, NULL AS company_override_name, NULL AS company_override_phone, NULL AS company_override_email, NULL AS company_override_address, 0 AS vehicles, 0 AS customers";

            $query = "SELECT d.*, $compSelect FROM Debtor d $compJoin ORDER BY d.CompanyName ASC, d.AccNo ASC";
            $result = mysqli_query($con, $query);
            while ($result && $row = mysqli_fetch_assoc($result)) {
                $code = trim(strval($row['AccNo'] ?? ''));
                if ($code) {
                    $seenCodes[$code] = true;
                }
                $activeValue = strtolower(trim(strval($row['IsActive'] ?? '')));
                $debtorActive = in_array($activeValue, ['1', 't', 'true', 'y', 'yes', 'active'], true) || $row['IsActive'] === null;

                $addrParts = array_filter(array_map('trim', [
                    strval($row['Address1'] ?? ''), strval($row['Address2'] ?? ''),
                    strval($row['Address3'] ?? ''), strval($row['Address4'] ?? '')
                ]));
                $autoCountAddress = implode(', ', $addrParts);

                $name = trim(strval($row['company_override_name'] ?? '')) ?: trim(strval($row['CompanyName'] ?? '')) ?: ('Debtor ' . $code);
                $phone = trim(strval($row['company_override_phone'] ?? '')) ?: trim(strval($row['Phone1'] ?? '')) ?: trim(strval($row['Mobile'] ?? ''));
                $email = trim(strval($row['company_override_email'] ?? '')) ?: trim(strval($row['EmailAddress'] ?? ''));
                $address = trim(strval($row['company_override_address'] ?? '')) ?: $autoCountAddress;

                $companies[] = [
                    'id' => intval($row['company_id'] ?? 0) ?: null,
                    'name' => $name,
                    'autocountDebtorCode' => $code,
                    'registrationNo' => trim(strval($row['RegisterNo'] ?? '')),
                    'term' => trim(strval($row['DisplayTerm'] ?? '')),
                    'creditLimit' => floatval($row['CreditLimit'] ?? 0),
                    'currency' => trim(strval($row['CurrencyCode'] ?? 'MYR')) ?: 'MYR',
                    'debtorActive' => $debtorActive,
                    'phone' => formatMalaysiaPhone($phone ?: '-'),
                    'email' => $email ?: '-',
                    'address' => $address ?: '-',
                    'vehicles' => intval($row['vehicles'] ?? 0),
                    'customers' => intval($row['customers'] ?? 0)
                ];
            }
        }

        if ($hasCompany) {
            $compQuery = "SELECT c.*, 
                                 (SELECT COUNT(*) FROM $vehicleTable WHERE company_id = c.id) AS vehicles,
                                 (SELECT COUNT(*) FROM $customerTable WHERE company_id = c.id $customerCondition) AS customers
                          FROM company c
                          ORDER BY c.created_at DESC";
            $compResult = mysqli_query($con, $compQuery);
            while ($compResult && $row = mysqli_fetch_assoc($compResult)) {
                $code = trim(strval($row['autocount_debtor_code'] ?? ''));
                if ($code && isset($seenCodes[$code])) {
                    continue;
                }
                $companies[] = [
                    'id' => intval($row['id']),
                    'name' => rowValue($row, ['name', 'company_name'], 'Company #' . $row['id']),
                    'autocountDebtorCode' => $code,
                    'registrationNo' => '',
                    'term' => '',
                    'creditLimit' => 0,
                    'currency' => 'MYR',
                    'debtorActive' => true,
                    'phone' => formatMalaysiaPhone(rowValue($row, ['phone'], '-')),
                    'email' => rowValue($row, ['email'], '-'),
                    'address' => rowValue($row, ['address'], '-'),
                    'vehicles' => intval($row['vehicles'] ?? 0),
                    'customers' => intval($row['customers'] ?? 0)
                ];
            }
        }

        sendResponse(true, 'Admin companies retrieved', $companies);
        break;

    case 'admin-debtors':
    case 'admin-autocount-debtors':
        if (!tableExists($con, 'Debtor')) {
            sendResponse(false, 'AutoCount Debtor data has not been synced yet.', null, 404);
        }
        $linkedCompanySelect = tableExists($con, 'company') && columnExists($con, 'company', 'autocount_debtor_code')
            ? 'c.id AS linked_company_id, c.name AS linked_company_name'
            : 'NULL AS linked_company_id, NULL AS linked_company_name';
        $linkedCompanyJoin = tableExists($con, 'company') && columnExists($con, 'company', 'autocount_debtor_code')
            ? 'LEFT JOIN company c ON c.autocount_debtor_code = d.AccNo'
            : '';
        $result = mysqli_query($con, "SELECT d.*, $linkedCompanySelect FROM Debtor d $linkedCompanyJoin ORDER BY d.CompanyName, d.AccNo");
        if (!$result) sendResponse(false, 'Unable to load AutoCount Debtors: ' . mysqli_error($con), null, 500);
        $debtors = [];
        while ($row = mysqli_fetch_assoc($result)) {
            $activeValue = strtolower(trim(strval($row['IsActive'] ?? '')));
            $debtors[] = [
                'code' => trim(strval($row['AccNo'] ?? '')),
                'name' => trim(strval($row['CompanyName'] ?? '')),
                'registrationNo' => trim(strval($row['RegisterNo'] ?? '')),
                'phone' => trim(strval($row['Phone1'] ?? '')),
                'mobile' => trim(strval($row['Mobile'] ?? '')),
                'email' => trim(strval($row['EmailAddress'] ?? '')),
                'address' => trim(implode(', ', array_filter(array_map('trim', [
                    strval($row['Address1'] ?? ''), strval($row['Address2'] ?? ''),
                    strval($row['Address3'] ?? ''), strval($row['Address4'] ?? '')
                ])))),
                'term' => trim(strval($row['DisplayTerm'] ?? '')),
                'currency' => trim(strval($row['CurrencyCode'] ?? '')),
                'creditLimit' => floatval($row['CreditLimit'] ?? 0),
                'salesAgent' => trim(strval($row['SalesAgent'] ?? '')),
                'debtorType' => trim(strval($row['DebtorType'] ?? '')),
                'active' => in_array($activeValue, ['1', 't', 'true', 'y', 'yes', 'active'], true),
                'lastModified' => $row['LastModified'] ?? null,
                'linkedCompanyId' => intval($row['linked_company_id'] ?? 0) ?: null,
                'linkedCompanyName' => $row['linked_company_name'] ?? null
            ];
        }
        $lastSync = null;
        if (tableExists($con, 'autocount_sync_from_log')) {
            $syncResult = mysqli_query($con, "SELECT asfl_status, asfl_remark, asfl_date FROM autocount_sync_from_log WHERE LOWER(asfl_type) = 'debtor' ORDER BY asfl_id DESC LIMIT 1");
            $syncRow = $syncResult ? mysqli_fetch_assoc($syncResult) : null;
            if ($syncRow) {
                $lastSync = [
                    'status' => $syncRow['asfl_status'] ?? '',
                    'remark' => $syncRow['asfl_remark'] ?? '',
                    'date' => $syncRow['asfl_date'] ?? null
                ];
            }
        }
        sendResponse(true, 'AutoCount Debtors retrieved.', ['debtors' => $debtors, 'lastSync' => $lastSync]);
        break;

    case 'admin-autocount-projects':
        if (!tableExists($con, 'autocount_project')) {
            sendResponse(true, 'AutoCount Projects have not been synced yet.', []);
        }

        $vehiclesByProject = [];
        $vehicleTable = unifiedVehicleTable($con);
        if ($vehicleTable && columnExists($con, $vehicleTable, 'autocount_project_no')) {
            $vehicleNumberColumn = firstColumn($con, $vehicleTable, [
                'registration_no', 'reg_no', 'vehicle_no', 'vec_no', 'unit_no'
            ]);
            if ($vehicleNumberColumn) {
                $vehicleResult = mysqli_query(
                    $con,
                    "SELECT id, `$vehicleNumberColumn` AS vehicle_number, autocount_project_no
                     FROM `$vehicleTable`
                     WHERE TRIM(COALESCE(autocount_project_no, '')) <> ''
                     ORDER BY `$vehicleNumberColumn`"
                );
                while ($vehicleResult && $vehicle = mysqli_fetch_assoc($vehicleResult)) {
                    $projectKey = strtoupper(trim(strval($vehicle['autocount_project_no'] ?? '')));
                    if ($projectKey === '') continue;
                    $vehiclesByProject[$projectKey][] = [
                        'id' => intval($vehicle['id']),
                        'vehicleNo' => trim(strval($vehicle['vehicle_number'] ?? ''))
                    ];
                }
            }
        }

        $projects = [];
        $projectResult = mysqli_query(
            $con,
            "SELECT project_no, description, debtor_code, is_active, last_sync_at
             FROM autocount_project
             ORDER BY project_no"
        );
        if (!$projectResult) {
            sendResponse(false, 'Unable to load AutoCount Projects: ' . mysqli_error($con), null, 500);
        }
        while ($row = mysqli_fetch_assoc($projectResult)) {
            $projectNo = trim(strval($row['project_no'] ?? ''));
            $activeValue = strtolower(trim(strval($row['is_active'] ?? '')));
            $projects[] = [
                'projectNo' => $projectNo,
                'description' => trim(strval($row['description'] ?? '')),
                'debtorCode' => trim(strval($row['debtor_code'] ?? '')),
                'active' => in_array($activeValue, ['1', 't', 'true', 'y', 'yes', 'active'], true),
                'lastSyncAt' => $row['last_sync_at'] ?? null,
                'vehicles' => $vehiclesByProject[strtoupper($projectNo)] ?? []
            ];
        }
        sendResponse(true, 'AutoCount Projects retrieved.', $projects);
        break;

    case 'admin-suppliers':
        if (!tableExists($con, 'Creditor')) {
            sendResponse(false, 'AutoCount Creditor data has not been synced yet.', null, 404);
        }
        $itemCountSelect = tableExists($con, 'Item')
            ? '(SELECT COUNT(*) FROM Item i WHERE UPPER(TRIM(i.MainSupplier)) = UPPER(TRIM(cr.AccNo))) AS item_count'
            : '0 AS item_count';
        $result = mysqli_query($con, "SELECT cr.*, $itemCountSelect FROM Creditor cr ORDER BY cr.CompanyName, cr.AccNo");
        if (!$result) sendResponse(false, 'Unable to load AutoCount Suppliers: ' . mysqli_error($con), null, 500);
        $suppliers = [];
        $seenSupplierCodes = [];
        while ($row = mysqli_fetch_assoc($result)) {
            $code = trim(strval($row['AccNo'] ?? ''));
            $codeKey = strtoupper($code);
            if ($codeKey === '' || isset($seenSupplierCodes[$codeKey])) continue;
            $seenSupplierCodes[$codeKey] = true;
            $activeValue = strtolower(trim(strval($row['IsActive'] ?? '')));
            $autoCountFields = $row;
            unset($autoCountFields['item_count']);
            $suppliers[] = [
                'code' => $code,
                'name' => trim(strval($row['CompanyName'] ?? '')),
                'description' => trim(strval($row['Desc2'] ?? '')),
                'registrationNo' => trim(strval($row['RegisterNo'] ?? '')),
                'attention' => trim(strval($row['Attention'] ?? '')),
                'phone' => trim(strval($row['Phone1'] ?? '')),
                'phone2' => trim(strval($row['Phone2'] ?? '')),
                'mobile' => trim(strval($row['Mobile'] ?? '')),
                'fax' => trim(strval($row['Fax1'] ?? '')),
                'email' => trim(strval($row['EmailAddress'] ?? '')),
                'webUrl' => trim(strval($row['WebURL'] ?? '')),
                'address' => trim(implode(', ', array_filter(array_map('trim', [
                    strval($row['Address1'] ?? ''), strval($row['Address2'] ?? ''),
                    strval($row['Address3'] ?? ''), strval($row['Address4'] ?? ''),
                    strval($row['PostCode'] ?? '')
                ])))),
                'areaCode' => trim(strval($row['AreaCode'] ?? '')),
                'purchaseAgent' => trim(strval($row['PurchaseAgent'] ?? '')),
                'creditorType' => trim(strval($row['CreditorType'] ?? '')),
                'natureOfBusiness' => trim(strval($row['NatureOfBusiness'] ?? '')),
                'term' => trim(strval($row['DisplayTerm'] ?? '')),
                'currency' => trim(strval($row['CurrencyCode'] ?? '')),
                'creditLimit' => floatval($row['CreditLimit'] ?? 0),
                'agingOn' => trim(strval($row['AgingOn'] ?? '')),
                'allowExceedCreditLimit' => in_array(strtolower(trim(strval($row['AllowExceedCreditLimit'] ?? ''))), ['1', 't', 'true', 'y', 'yes'], true),
                'taxCode' => trim(strval($row['TaxCode'] ?? '')),
                'discountPercent' => floatval($row['DiscountPercent'] ?? 0),
                'accountGroup' => trim(strval($row['AccountGroup'] ?? '')),
                'taxRegistered' => in_array(strtolower(trim(strval($row['IsTaxRegistered'] ?? ''))), ['1', 't', 'true', 'y', 'yes'], true),
                'withholdingTaxCode' => trim(strval($row['WithholdingTaxCode'] ?? '')),
                'selfBilledApprovalNo' => trim(strval($row['SelfBilledApprovalNo'] ?? '')),
                'taxEntityId' => trim(strval($row['TaxEntityID'] ?? '')),
                'note' => trim(strval($row['Note'] ?? '')),
                'active' => in_array($activeValue, ['1', 't', 'true', 'y', 'yes', 'active'], true),
                'lastModified' => $row['LastModified'] ?? null,
                'itemCount' => intval($row['item_count'] ?? 0),
                'fields' => $autoCountFields
            ];
        }
        $lastSync = null;
        if (tableExists($con, 'autocount_sync_from_log')) {
            $syncResult = mysqli_query($con, "SELECT asfl_status, asfl_remark, asfl_date FROM autocount_sync_from_log WHERE LOWER(asfl_type) = 'creditor' ORDER BY asfl_id DESC LIMIT 1");
            $syncRow = $syncResult ? mysqli_fetch_assoc($syncResult) : null;
            if ($syncRow) {
                $lastSync = [
                    'status' => $syncRow['asfl_status'] ?? '',
                    'remark' => $syncRow['asfl_remark'] ?? '',
                    'date' => $syncRow['asfl_date'] ?? null
                ];
            }
        }
        sendResponse(true, 'AutoCount Suppliers retrieved.', ['suppliers' => $suppliers, 'lastSync' => $lastSync]);
        break;

    case 'admin-supplier-transactions':
        $code = trim(strval($inputData['code'] ?? $_GET['code'] ?? ''));
        $name = trim(strval($inputData['name'] ?? $_GET['name'] ?? ''));
        if ($code === '' && $name === '') {
            sendResponse(false, 'Supplier Creditor Code or Name is required.', null, 400);
        }

        $escCode = mysqli_real_escape_string($con, $code);
        $escName = mysqli_real_escape_string($con, $name);

        $wherePo = [];
        if ($code !== '') {
            $wherePo[] = "UPPER(TRIM(po.supplier_code)) = UPPER(TRIM('$escCode'))";
        }
        if ($name !== '') {
            $wherePo[] = "UPPER(TRIM(po.supplier_name)) = UPPER(TRIM('$escName'))";
        }
        $wherePoSql = implode(' OR ', $wherePo);

        $summary = [
            'totalPoCount' => 0,
            'totalSpend' => 0.0,
            'pendingPoCount' => 0,
            'receivedPoCount' => 0,
            'lastOrderDate' => null,
        ];

        $orders = [];
        $suppliedParts = [];
        $catalogItems = [];

        if (tableExists($con, 'purchase_order')) {
            $sumQuery = "SELECT 
                COUNT(*) AS total_po,
                COALESCE(SUM(CASE WHEN po.status != 'cancelled' THEN po.total ELSE 0 END), 0) AS total_spend,
                COUNT(CASE WHEN po.status IN ('draft', 'pending', 'ordered', 'partial_received') THEN 1 END) AS pending_po,
                COUNT(CASE WHEN po.status = 'received' THEN 1 END) AS received_po,
                MAX(po.order_date) AS last_order_date
            FROM purchase_order po
            WHERE ($wherePoSql)";
            $sumRes = mysqli_query($con, $sumQuery);
            if ($sumRes && $sumRow = mysqli_fetch_assoc($sumRes)) {
                $summary['totalPoCount'] = intval($sumRow['total_po'] ?? 0);
                $summary['totalSpend'] = floatval($sumRow['total_spend'] ?? 0);
                $summary['pendingPoCount'] = intval($sumRow['pending_po'] ?? 0);
                $summary['receivedPoCount'] = intval($sumRow['received_po'] ?? 0);
                $summary['lastOrderDate'] = $sumRow['last_order_date'] ?? null;
            }

            $poListQuery = "SELECT po.*, j.work_order_no,
                (SELECT COUNT(*) FROM purchase_order_item poi WHERE poi.purchase_order_id = po.id) AS item_count
            FROM purchase_order po
            LEFT JOIN job j ON j.id = po.work_order_id
            WHERE ($wherePoSql)
            ORDER BY po.order_date DESC, po.id DESC
            LIMIT 100";
            $poRes = mysqli_query($con, $poListQuery);
            while ($poRes && $row = mysqli_fetch_assoc($poRes)) {
                $orders[] = [
                    'id' => intval($row['id']),
                    'internalRef' => $row['internal_ref'] ?? '',
                    'autocountPoNo' => $row['autocount_po_no'] ?? '',
                    'poNo' => !empty($row['autocount_po_no']) ? $row['autocount_po_no'] : (!empty($row['internal_ref']) ? $row['internal_ref'] : ('PO-' . $row['id'])),
                    'workOrderId' => $row['work_order_id'] !== null ? intval($row['work_order_id']) : null,
                    'workOrderNo' => $row['work_order_no'] ?? '',
                    'supplierCode' => $row['supplier_code'] ?? '',
                    'supplierName' => $row['supplier_name'] ?? '',
                    'orderDate' => $row['order_date'],
                    'estimatedArrivalDate' => $row['estimated_arrival_date'],
                    'status' => $row['status'],
                    'currency' => $row['currency'] ?? 'MYR',
                    'subtotal' => floatval($row['subtotal']),
                    'taxAmount' => floatval($row['tax_amount']),
                    'total' => floatval($row['total']),
                    'itemCount' => intval($row['item_count'] ?? 0),
                    'receivedAt' => $row['received_at'] ?? null,
                    'notes' => $row['notes'] ?? ''
                ];
            }

            if (tableExists($con, 'purchase_order_item')) {
                $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
                $partJoin = $partTable ? "LEFT JOIN `$partTable` p ON p.id = poi.part_id" : "";
                $stockColSelect = ($partTable && columnExists($con, $partTable, 'stock')) ? "p.stock AS current_stock" : "0 AS current_stock";

                $partsQuery = "SELECT
                    poi.part_id,
                    poi.item_code,
                    poi.description,
                    poi.uom,
                    COUNT(DISTINCT po.id) AS po_count,
                    SUM(COALESCE(poi.quantity, 0)) AS total_ordered_qty,
                    SUM(COALESCE(poi.received_quantity, 0)) AS total_received_qty,
                    SUBSTRING_INDEX(GROUP_CONCAT(poi.unit_cost ORDER BY po.order_date DESC, po.id DESC), ',', 1) AS last_unit_cost,
                    MIN(poi.unit_cost) AS min_unit_cost,
                    MAX(poi.unit_cost) AS max_unit_cost,
                    MAX(po.order_date) AS last_ordered_at,
                    $stockColSelect
                FROM purchase_order_item poi
                JOIN purchase_order po ON po.id = poi.purchase_order_id
                $partJoin
                WHERE ($wherePoSql)
                  AND po.status != 'cancelled'
                GROUP BY poi.part_id, poi.item_code, poi.description, poi.uom
                ORDER BY last_ordered_at DESC
                LIMIT 150";

                $pRes = mysqli_query($con, $partsQuery);
                while ($pRes && $pRow = mysqli_fetch_assoc($pRes)) {
                    $suppliedParts[] = [
                        'partId' => $pRow['part_id'] !== null ? intval($pRow['part_id']) : null,
                        'itemCode' => $pRow['item_code'] ?? '',
                        'description' => $pRow['description'] ?? '',
                        'uom' => $pRow['uom'] ?? 'UNIT',
                        'poCount' => intval($pRow['po_count'] ?? 0),
                        'totalOrderedQty' => floatval($pRow['total_ordered_qty'] ?? 0),
                        'totalReceivedQty' => floatval($pRow['total_received_qty'] ?? 0),
                        'lastUnitCost' => floatval($pRow['last_unit_cost'] ?? 0),
                        'minUnitCost' => floatval($pRow['min_unit_cost'] ?? 0),
                        'maxUnitCost' => floatval($pRow['max_unit_cost'] ?? 0),
                        'lastOrderedAt' => $pRow['last_ordered_at'] ?? null,
                        'currentStock' => floatval($pRow['current_stock'] ?? 0),
                    ];
                }
            }
        }

        if ($code !== '' && tableExists($con, 'Item')) {
            $catRes = mysqli_query($con, "SELECT ItemCode, Description, BaseUOM, Cost, BalQty, Price FROM Item WHERE UPPER(TRIM(MainSupplier)) = UPPER(TRIM('$escCode')) ORDER BY ItemCode ASC LIMIT 100");
            while ($catRes && $cRow = mysqli_fetch_assoc($catRes)) {
                $catalogItems[] = [
                    'itemCode' => $cRow['ItemCode'] ?? '',
                    'description' => $cRow['Description'] ?? '',
                    'uom' => $cRow['BaseUOM'] ?? '',
                    'cost' => floatval($cRow['Cost'] ?? 0),
                    'stock' => floatval($cRow['BalQty'] ?? 0),
                    'price' => floatval($cRow['Price'] ?? 0)
                ];
            }
        }

        sendResponse(true, 'Supplier transactions retrieved.', [
            'supplierCode' => $code,
            'supplierName' => $name,
            'summary' => $summary,
            'orders' => $orders,
            'suppliedParts' => $suppliedParts,
            'catalogItems' => $catalogItems
        ]);
        break;

    case 'admin-autocount-sync-health':
        if (!isSuperAdminSession()) {
            sendResponse(false, 'Forbidden: AutoCount Sync Health is restricted to Super Admin.', null, 403);
        }
        ensureSchema($con);
        $now = new DateTimeImmutable();
        
        // 1. Master Data Counts & Timestamps
        $debtorsCount = tableExists($con, 'Debtor') ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM Debtor", 'total', 0)) : 0;
        $debtorsActive = tableExists($con, 'Debtor') ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM Debtor WHERE IsActive = '1' OR IsActive = 'Y' OR IsActive = 'true'", 'total', 0)) : 0;
        $debtorsLastSync = tableExists($con, 'Debtor') ? scalarQuery($con, "SELECT MAX(LastModified) AS latest FROM Debtor", 'latest', null) : null;
        
        $creditorsCount = tableExists($con, 'Creditor') ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM Creditor", 'total', 0)) : 0;
        $creditorsActive = tableExists($con, 'Creditor') ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM Creditor WHERE IsActive = '1' OR IsActive = 'Y' OR IsActive = 'true'", 'total', 0)) : 0;
        $creditorsLastSync = tableExists($con, 'Creditor') ? scalarQuery($con, "SELECT MAX(LastModified) AS latest FROM Creditor", 'latest', null) : null;
        
        $stockCount = 0;
        $stockLastSync = null;
        if (tableExists($con, 'Item')) {
            $stockCount = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM Item", 'total', 0));
            $stockLastSync = scalarQuery($con, "SELECT MAX(LastModified) AS latest FROM Item", 'latest', null);
        } elseif (tableExists($con, 'spare_parts')) {
            $stockCount = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM spare_parts", 'total', 0));
            $stockLastSync = scalarQuery($con, "SELECT MAX(updated_at) AS latest FROM spare_parts", 'latest', null);
        }

        // 2. Invoices & PO Sync Queue
        $invoiceQueuePending = 0;
        $invoiceQueueFailed = 0;
        $invoiceQueueSuccess = 0;
        $failedQueueItems = [];

        if (tableExists($con, 'autocount_invoice_sync_queue')) {
            $invoiceQueuePending = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM autocount_invoice_sync_queue WHERE status IN ('pending', 'processing')", 'total', 0));
            $invoiceQueueFailed = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM autocount_invoice_sync_queue WHERE status = 'failed'", 'total', 0));
            $invoiceQueueSuccess = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM autocount_invoice_sync_queue WHERE status = 'success' AND DATE(created_at) = CURDATE()", 'total', 0));

            $failedQuery = "SELECT q.*, inv.invoice_number, inv.total AS invoice_total, inv.debtor_code, c.name AS company_name
                            FROM autocount_invoice_sync_queue q
                            LEFT JOIN work_order_invoice inv ON inv.id = q.invoice_id
                            LEFT JOIN company c ON c.id = inv.company_id
                            WHERE q.status = 'failed'
                            ORDER BY q.created_at DESC LIMIT 20";
            $failedRes = mysqli_query($con, $failedQuery);
            while ($failedRes && $row = mysqli_fetch_assoc($failedRes)) {
                $failedQueueItems[] = [
                    'id' => intval($row['id']),
                    'invoiceId' => intval($row['invoice_id'] ?? 0),
                    'invoiceNumber' => $row['invoice_number'] ?: ('INV-' . ($row['invoice_id'] ?? '')),
                    'companyName' => $row['company_name'] ?: 'Direct Customer',
                    'debtorCode' => $row['debtor_code'] ?: '-',
                    'total' => floatval($row['invoice_total'] ?? 0),
                    'operation' => $row['operation'] ?? 'create',
                    'errorMessage' => $row['error_message'] ?: 'AutoCount sync transaction rejected',
                    'attemptCount' => intval($row['attempt_count'] ?? 1),
                    'lastAttemptAt' => $row['last_attempt_at'] ?? $row['created_at']
                ];
            }
        }

        // 3. Recent Sync Logs
        $recentLogs = [];
        if (tableExists($con, 'autocount_sync_from_log')) {
            $logRes = mysqli_query($con, "SELECT asfl_id AS id, asfl_type AS type, asfl_status AS status, asfl_remark AS remark, asfl_date AS date FROM autocount_sync_from_log ORDER BY asfl_id DESC LIMIT 25");
            while ($logRes && $r = mysqli_fetch_assoc($logRes)) {
                $recentLogs[] = [
                    'id' => intval($r['id']),
                    'direction' => 'inbound',
                    'type' => ucfirst(strtolower(strval($r['type'] ?? 'General'))),
                    'status' => strtolower(strval($r['status'] ?? '')) === 'success' || strval($r['status'] ?? '') === '1' ? 'success' : 'failed',
                    'remark' => strval($r['remark'] ?? ''),
                    'timestamp' => strval($r['date'] ?? '')
                ];
            }
        }

        // 4. Latest Heartbeat & Health Status
        $timestamps = array_filter([$debtorsLastSync, $creditorsLastSync, $stockLastSync]);
        if (!empty($recentLogs)) {
            $timestamps[] = $recentLogs[0]['timestamp'];
        }
        $latestHeartbeat = !empty($timestamps) ? max($timestamps) : null;
        $minutesAgo = 9999;
        if ($latestHeartbeat) {
            $heartbeatDate = new DateTimeImmutable($latestHeartbeat);
            $minutesAgo = max(0, intval(($now->getTimestamp() - $heartbeatDate->getTimestamp()) / 60));
        }

        $healthStatus = 'healthy';
        if ($latestHeartbeat === null || $minutesAgo > 120) {
            $healthStatus = 'offline';
        } elseif ($minutesAgo > 30 || $invoiceQueueFailed > 0) {
            $healthStatus = 'warning';
        }

        sendResponse(true, 'AutoCount sync health status retrieved.', [
            'status' => $healthStatus,
            'lastHeartbeat' => $latestHeartbeat,
            'minutesSinceLastSync' => $minutesAgo,
            'metrics' => [
                'debtors' => [
                    'total' => $debtorsCount,
                    'active' => $debtorsActive,
                    'lastSync' => $debtorsLastSync
                ],
                'creditors' => [
                    'total' => $creditorsCount,
                    'active' => $creditorsActive,
                    'lastSync' => $creditorsLastSync
                ],
                'stockItems' => [
                    'total' => $stockCount,
                    'lastSync' => $stockLastSync
                ],
                'invoicesOutbox' => [
                    'pending' => $invoiceQueuePending,
                    'failed' => $invoiceQueueFailed,
                    'syncedToday' => $invoiceQueueSuccess
                ]
            ],
            'failedQueue' => $failedQueueItems,
            'recentLogs' => $recentLogs
        ]);
        break;

    case 'admin-autocount-retry-queue':
        if (!isSuperAdminSession()) {
            sendResponse(false, 'Forbidden: AutoCount retry action is restricted to Super Admin.', null, 403);
        }
        ensureSchema($con);
        $queueId = intval($inputData['queueId'] ?? 0);
        if ($queueId > 0 && tableExists($con, 'autocount_invoice_sync_queue')) {
            mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'pending', error_message = NULL, attempt_count = 0 WHERE id = $queueId");
            sendResponse(true, 'Queue item marked for retry.');
        } elseif ($queueId === 0 && tableExists($con, 'autocount_invoice_sync_queue')) {
            mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'pending', error_message = NULL, attempt_count = 0 WHERE status = 'failed'");
            sendResponse(true, 'All failed queue items marked for retry.');
        } else {
            sendResponse(false, 'Invalid queue item specified.', null, 400);
        }
        break;

    case 'admin-mewahtrans-queue-invoice':
        ensureSchema($con);
        $invoiceId = intval($inputData['invoiceId'] ?? 0);
        if ($invoiceId <= 0 || !tableExists($con, 'work_order_invoice')) {
            sendResponse(false, 'Valid invoice ID is required.', null, 400);
        }
        $invRow = mysqli_fetch_assoc(mysqli_query($con, "SELECT id, invoice_no, total, company_id FROM work_order_invoice WHERE id = $invoiceId LIMIT 1"));
        if (!$invRow) {
            sendResponse(false, 'Invoice not found.', null, 404);
        }
        
        mysqli_query($con, "UPDATE work_order_invoice SET mewahtrans_sync_status = 'pending', mewahtrans_error = NULL WHERE id = $invoiceId");
        if (tableExists($con, 'mewahtrans_invoice_sync_queue')) {
            mysqli_query($con, "INSERT INTO mewahtrans_invoice_sync_queue (invoice_id, operation, status, attempt_count, created_at, updated_at) 
                                VALUES ($invoiceId, 'create', 'pending', 0, NOW(), NOW()) 
                                ON DUPLICATE KEY UPDATE status = 'pending', error_message = NULL, attempt_count = 0, updated_at = NOW()");
        }
        sendResponse(true, 'Invoice queued for MewahTrans fleet system sync.', ['invoiceId' => $invoiceId, 'status' => 'pending']);
        break;

    case 'admin-mewahtrans-retry-sync':
        ensureSchema($con);
        $queueId = intval($inputData['queueId'] ?? 0);
        if (tableExists($con, 'mewahtrans_invoice_sync_queue')) {
            if ($queueId > 0) {
                mysqli_query($con, "UPDATE mewahtrans_invoice_sync_queue SET status = 'pending', error_message = NULL, attempt_count = 0 WHERE id = $queueId");
            } else {
                mysqli_query($con, "UPDATE mewahtrans_invoice_sync_queue SET status = 'pending', error_message = NULL, attempt_count = 0 WHERE status = 'failed'");
            }
            sendResponse(true, 'MewahTrans sync retry scheduled.');
        } else {
            sendResponse(false, 'MewahTrans sync queue table not initialized.', null, 400);
        }
        break;

    case 'admin-create-company':
        sendResponse(false, 'Company accounts are managed in AutoCount Debtors and synchronized automatically.', null, 403);
        break;

    case 'admin-update-company':
        ensureSchema($con);
        $id = intval($inputData['id'] ?? 0);
        $name = mysqli_real_escape_string($con, trim($inputData['name'] ?? ''));
        $phoneInput = trim($inputData['phone'] ?? '');
        $emailInput = trim($inputData['email'] ?? '');
        $address = mysqli_real_escape_string($con, trim($inputData['address'] ?? ''));
        $autocountDebtorCodeValue = strtoupper(trim(strval($inputData['autocountDebtorCode'] ?? '')));
        
        if (!$name) {
            sendResponse(false, 'Company name is required', null, 400);
        }
        if ($phoneInput !== '' && !isValidMalaysiaPhone($phoneInput)) {
            sendResponse(false, 'Enter a valid Malaysia mobile or landline number', null, 400);
        }
        if ($emailInput !== '' && !isValidEmailAddress($emailInput)) {
            sendResponse(false, 'Enter a valid email address, for example name@example.com', null, 400);
        }
        if (strlen($autocountDebtorCodeValue) > 40 || ($autocountDebtorCodeValue !== '' && !preg_match('/^[A-Z0-9._-]+$/', $autocountDebtorCodeValue))) {
            sendResponse(false, 'AutoCount Debtor Code may contain letters, numbers, dots, hyphens, and underscores only.', null, 400);
        }
        $autocountDebtorCode = mysqli_real_escape_string($con, $autocountDebtorCodeValue);
        if ($autocountDebtorCode !== '' && countRows($con, 'company', "autocount_debtor_code = '$autocountDebtorCode' AND id <> $id") > 0) {
            sendResponse(false, 'This AutoCount Debtor Code is already assigned to another company.', null, 409);
        }
        $phone = mysqli_real_escape_string($con, $phoneInput === '' ? '' : formatMalaysiaPhone($phoneInput));
        $email = mysqli_real_escape_string($con, $emailInput === '' ? '' : normalizeEmailAddress($emailInput));
        
        $debtorCodeSql = $autocountDebtorCode === '' ? 'NULL' : "'$autocountDebtorCode'";

        if ($id > 0) {
            $query = "UPDATE company SET name = '$name', phone = '$phone', email = '$email', address = '$address', autocount_debtor_code = $debtorCodeSql WHERE id = $id";
            if (mysqli_query($con, $query)) {
                sendResponse(true, 'Company updated successfully', ['id' => $id]);
            }
        } else {
            // Find existing by debtor code or insert
            $existing = null;
            if ($autocountDebtorCode !== '') {
                $existingRes = mysqli_query($con, "SELECT id FROM company WHERE autocount_debtor_code = '$autocountDebtorCode' LIMIT 1");
                $existing = $existingRes ? mysqli_fetch_assoc($existingRes) : null;
            }
            if ($existing) {
                $existingId = intval($existing['id']);
                $query = "UPDATE company SET name = '$name', phone = '$phone', email = '$email', address = '$address' WHERE id = $existingId";
                if (mysqli_query($con, $query)) {
                    sendResponse(true, 'Company updated successfully', ['id' => $existingId]);
                }
            } else {
                $query = "INSERT INTO company (name, phone, email, address, autocount_debtor_code, created_at) VALUES ('$name', '$phone', '$email', '$address', $debtorCodeSql, NOW())";
                if (mysqli_query($con, $query)) {
                    sendResponse(true, 'Company created and linked successfully', ['id' => mysqli_insert_id($con)]);
                }
            }
        }
        sendResponse(false, 'Failed to update company: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-delete-company':
        sendResponse(false, 'Company accounts are managed in AutoCount and cannot be deleted from the workshop panel.', null, 403);
        break;

        default:
            sendResponse(false, "Unsupported customer action: $mode", null, 400);
            break;
    }
}

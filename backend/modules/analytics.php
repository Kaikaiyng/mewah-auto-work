<?php
// Analytics & Dashboard Domain Module
// Extracted from api.php to improve maintainability and modularity

function analyticsDate($value) {
    $value = trim(strval($value ?? ''));
    if ($value === '' || strpos($value, '0000-00-00') === 0) return null;
    $timestamp = strtotime($value);
    return $timestamp === false ? null : date('Y-m-d', $timestamp);
}

function analyticsCustomerNameMap($con, $table) {
    if (!tableExists($con, $table)) return [];
    $nameColumn = firstColumn($con, $table, ['name', 'username', 'customer_name']);
    if (!$nameColumn) return [];
    $map = [];
    $result = mysqli_query($con, "SELECT id, `$nameColumn` AS customer_name FROM `$table`");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $map[intval($row['id'])] = trim(strval($row['customer_name'] ?? ''));
    }
    return $map;
}

function analyticsBookings($con, $startDate = null) {
    $bookings = [];
    $safeDate = $startDate ? mysqli_real_escape_string($con, strval($startDate)) : null;

    if (tableExists($con, 'customer_appointment')) {
        $customerNames = analyticsCustomerNameMap($con, 'customer');
        $dateCol = firstColumn($con, 'customer_appointment', ['appointment_at', 'appointment_date', 'service_date', 'date', 'created_at']);
        $whereSql = ($safeDate && $dateCol) ? " WHERE `$dateCol` >= '$safeDate'" : '';
        $result = mysqli_query($con, "SELECT * FROM customer_appointment$whereSql");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $dateValue = rowValue($row, ['appointment_at', 'appointment_date', 'service_date', 'date', 'created_at'], '');
            $date = analyticsDate($dateValue);
            if (!$date) continue;
            $customerId = intval(rowValue($row, ['customer_id'], 0));
            $customer = trim(strval(rowValue($row, ['customer_name', 'name'], '')));
            if ($customer === '' && $customerId > 0) $customer = $customerNames[$customerId] ?? '';
            $bookings[] = [
                'id' => strval(rowValue($row, ['appointment_no', 'booking_number', 'booking_no', 'id'], '')),
                'customerKey' => $customerId > 0 ? 'id:' . $customerId : 'name:' . strtolower($customer),
                'customer' => $customer !== '' ? $customer : '-',
                'vehicle' => strval(rowValue($row, ['vehicle', 'vehicle_no', 'reg_no', 'plate_no'], '-')),
                'service' => strval(rowValue($row, ['service', 'service_type', 'services', 'title'], 'Unspecified')),
                'date' => $date,
                'time' => ($timestamp = strtotime(strval($dateValue))) !== false ? date('H:i', $timestamp) : '',
                'status' => toAdminBookingStatus(strtolower(str_replace(' ', '_', strval(rowValue($row, ['status'], 'pending')))))
            ];
        }
        return $bookings;
    }

    if (!tableExists($con, 'bookings')) return [];
    $customerNames = analyticsCustomerNameMap($con, 'users');
    $serviceDateColumn = firstColumn($con, 'bookings', ['service_date', 'appointment_at', 'date', 'created_at']);
    if (!$serviceDateColumn) return [];

    $conditions = [];
    if (columnExists($con, 'bookings', 'order_type')) {
        $conditions[] = "order_type = 'service'";
    }
    if ($safeDate) {
        $conditions[] = "`$serviceDateColumn` >= '$safeDate'";
    }
    $whereClause = !empty($conditions) ? ' WHERE ' . implode(' AND ', $conditions) : '';

    $result = mysqli_query($con, "SELECT * FROM bookings$whereClause");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $dateValue = $row[$serviceDateColumn] ?? '';
        $date = analyticsDate($dateValue);
        if (!$date) continue;
        $customerId = intval(rowValue($row, ['user_id', 'customer_id'], 0));
        $customer = $customerNames[$customerId] ?? trim(strval(rowValue($row, ['customer_name', 'name'], '')));
        $bookings[] = [
            'id' => strval(rowValue($row, ['booking_number', 'booking_no', 'id'], '')),
            'customerKey' => $customerId > 0 ? 'id:' . $customerId : 'name:' . strtolower($customer),
            'customer' => $customer !== '' ? $customer : '-',
            'vehicle' => strval(rowValue($row, ['vehicle', 'vehicle_no', 'reg_no'], '-')),
            'service' => strval(rowValue($row, ['service_type', 'service', 'title'], 'Unspecified')),
            'date' => $date,
            'time' => ($timestamp = strtotime(strval($dateValue))) !== false ? date('H:i', $timestamp) : '',
            'status' => toAdminBookingStatus(strtolower(str_replace(' ', '_', strval(rowValue($row, ['status'], 'pending')))))
        ];
    }
    return $bookings;
}

function analyticsInvoices($con, $startDate = null) {
    $invoices = [];
    $safeDate = $startDate ? mysqli_real_escape_string($con, strval($startDate)) : null;

    if (tableExists($con, 'accounting_invoice')) {
        $dateCondition = $safeDate ? " AND ai.invoice_date >= '$safeDate'" : "";
        $result = mysqli_query($con, "SELECT ai.invoice_date, ai.total, ai.outstanding, ai.document_status,
            ai.company_id, comp.name AS company_name
            FROM accounting_invoice ai
            LEFT JOIN company comp ON comp.id = ai.company_id
            WHERE ai.document_status = 'approved'$dateCondition");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $date = analyticsDate($row['invoice_date'] ?? '');
            if (!$date) continue;
            $companyId = intval($row['company_id'] ?? 0);
            $company = trim(strval($row['company_name'] ?? ''));
            $invoices[] = [
                'date' => $date,
                'customerKey' => $companyId > 0 ? 'company:' . $companyId : 'name:' . strtolower($company),
                'customer' => $company !== '' ? $company : '-',
                'total' => floatval($row['total']),
                'paid' => floatval($row['outstanding']) <= 0
            ];
        }
    }
    if (tableExists($con, 'work_order_invoice') && tableExists($con, 'job')) {
        $dateCondition = $safeDate ? " AND wi.invoice_date >= '$safeDate'" : "";
        $result = mysqli_query($con, "SELECT wi.invoice_date, wi.total, wi.status, j.company_id, comp.name AS company_name
            FROM work_order_invoice wi
            JOIN job j ON j.id = wi.work_order_id
            LEFT JOIN company comp ON comp.id = j.company_id
            WHERE wi.status <> 'void'$dateCondition");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $date = analyticsDate($row['invoice_date'] ?? '');
            if (!$date) continue;
            $companyId = intval($row['company_id'] ?? 0);
            $company = trim(strval($row['company_name'] ?? ''));
            $invoices[] = [
                'date' => $date,
                'customerKey' => $companyId > 0 ? 'company:' . $companyId : 'name:' . strtolower($company),
                'customer' => $company !== '' ? $company : '-',
                'total' => floatval($row['total']),
                'paid' => strtolower(strval($row['status'])) === 'paid'
            ];
        }
        if ($invoices) return $invoices;
    }
    if ($invoices) return $invoices;
    if (tableExists($con, 'customer_invoice')) {
        $customerNames = analyticsCustomerNameMap($con, 'customer');
        $dateCol = firstColumn($con, 'customer_invoice', ['invoice_date', 'date', 'created_at']);
        $whereSql = ($safeDate && $dateCol) ? " WHERE `$dateCol` >= '$safeDate'" : '';
        $result = mysqli_query($con, "SELECT * FROM customer_invoice$whereSql");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $date = analyticsDate(rowValue($row, ['invoice_date', 'date', 'created_at'], ''));
            if (!$date) continue;
            $customerId = intval(rowValue($row, ['customer_id'], 0));
            $customer = trim(strval(rowValue($row, ['customer_name', 'name'], '')));
            if ($customer === '' && $customerId > 0) $customer = $customerNames[$customerId] ?? '';
            $status = strtolower(trim(strval(rowValue($row, ['payment_status', 'status'], ''))));
            $invoices[] = [
                'date' => $date,
                'customerKey' => $customerId > 0 ? 'id:' . $customerId : 'name:' . strtolower($customer),
                'customer' => $customer !== '' ? $customer : '-',
                'total' => floatval(rowValue($row, ['total', 'grand_total', 'amount'], 0)),
                'paid' => in_array($status, ['paid', 'settled', 'completed'], true)
            ];
        }
        return $invoices;
    }

    if (!tableExists($con, 'bookings') || !columnExists($con, 'bookings', 'invoice_number')) return [];
    $customerNames = analyticsCustomerNameMap($con, 'users');
    $dateCol = firstColumn($con, 'bookings', ['service_date', 'invoice_date', 'created_at']);
    $dateCondition = ($safeDate && $dateCol) ? " AND `$dateCol` >= '$safeDate'" : '';
    $result = mysqli_query($con, "SELECT * FROM bookings WHERE invoice_number IS NOT NULL$dateCondition");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $date = analyticsDate(rowValue($row, ['service_date', 'invoice_date', 'created_at'], ''));
        if (!$date) continue;
        $customerId = intval(rowValue($row, ['user_id', 'customer_id'], 0));
        $customer = $customerNames[$customerId] ?? '';
        $status = strtolower(trim(strval(rowValue($row, ['payment_status', 'status'], ''))));
        $invoices[] = [
            'date' => $date,
            'customerKey' => $customerId > 0 ? 'id:' . $customerId : 'name:' . strtolower($customer),
            'customer' => $customer !== '' ? $customer : '-',
            'total' => floatval(rowValue($row, ['total_price', 'total', 'amount'], 0)),
            'paid' => in_array($status, ['paid', 'settled', 'completed'], true)
        ];
    }
    return $invoices;
}

function analyticsPartOrders($con, $startDate = null) {
    $table = tableExists($con, 'parts_orders') && (
        countRows($con, 'parts_orders') > 0 || !tableExists($con, 'bookings')
    )
        ? 'parts_orders'
        : (tableExists($con, 'job_parts')
        ? 'job_parts'
        : (tableExists($con, 'customer_statement') ? 'customer_statement' : (tableExists($con, 'bookings') ? 'bookings' : null)));
    if (!$table) return [];
    $dateColumn = firstColumn($con, $table, ['order_date', 'service_date', 'date', 'created_at']);
    if (!$dateColumn) return [];

    $safeDate = $startDate ? mysqli_real_escape_string($con, strval($startDate)) : null;
    $conditions = [];
    if ($table === 'bookings' && columnExists($con, 'bookings', 'order_type')) {
        $conditions[] = "order_type = 'parts'";
    }
    if ($safeDate) {
        $conditions[] = "`$dateColumn` >= '$safeDate'";
    }
    $where = !empty($conditions) ? ' WHERE ' . implode(' AND ', $conditions) : '';

    $orders = [];
    $result = mysqli_query($con, "SELECT * FROM `$table`$where");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $date = analyticsDate($row[$dateColumn] ?? '');
        if (!$date) continue;
        $quantity = max(0, intval(rowValue($row, ['quantity', 'qty'], 1)));
        $lineTotal = max(0, floatval(rowValue($row, ['total', 'amount', 'total_price', 'price'], 0)));
        $unitPrice = max(0, floatval(rowValue($row, ['unit_price', 'price'], $quantity > 0 ? $lineTotal / $quantity : 0)));
        $orders[] = [
            'id' => rowValue($row, ['order_number', 'order_no', 'statement_no', 'booking_number', 'id'], ''),
            'customer' => rowValue($row, ['customer_name', 'name'], '-'),
            'items' => [[
                'name' => rowValue($row, ['part_name', 'item_name', 'description', 'name'], 'Parts'),
                'quantity' => $quantity,
                'price' => $unitPrice
            ]],
            'total' => $lineTotal,
            'status' => toAdminOrderStatus(strtolower(str_replace(' ', '_', strval(rowValue($row, ['status'], 'pending'))))),
            'orderDate' => $date,
            'deliveryAddress' => rowValue($row, ['delivery_address', 'address'], '-')
        ];
    }
    return $orders;
}

function analyticsPeriodBounds($period) {
    $now = new DateTimeImmutable('now');
    $today = new DateTimeImmutable($now->format('Y-m-d'));
    if ($period === 'week') {
        $start = $today->modify('monday this week');
        $end = $start->modify('+7 days');
        $previousStart = $start->modify('-7 days');
    } elseif ($period === 'quarter') {
        $quarterMonth = (intval(floor((intval($today->format('n')) - 1) / 3)) * 3) + 1;
        $start = new DateTimeImmutable($today->format('Y') . '-' . str_pad(strval($quarterMonth), 2, '0', STR_PAD_LEFT) . '-01');
        $end = $start->modify('+3 months');
        $previousStart = $start->modify('-3 months');
    } elseif ($period === 'year') {
        $start = new DateTimeImmutable($today->format('Y') . '-01-01');
        $end = $start->modify('+1 year');
        $previousStart = $start->modify('-1 year');
    } else {
        $period = 'month';
        $start = new DateTimeImmutable($today->format('Y-m-01'));
        $end = $start->modify('+1 month');
        $previousStart = $start->modify('-1 month');
    }
    return [
        'period' => $period,
        'start' => $start,
        'end' => $end,
        'previousStart' => $previousStart
    ];
}

function analyticsDateInRange($date, $start, $end) {
    $timestamp = strtotime(strval($date));
    return $timestamp !== false && $timestamp >= $start->getTimestamp() && $timestamp < $end->getTimestamp();
}

function analyticsChange($current, $previous) {
    if (floatval($previous) <= 0 && floatval($current) > 0) {
        return ['change' => 'New', 'trend' => 'up'];
    }
    return calculateChange($current, $previous);
}

function adminAnalyticsReport($con, $period) {
    $bounds = analyticsPeriodBounds($period);
    $minDate = $bounds['previousStart']->format('Y-m-d');
    $bookings = analyticsBookings($con, $minDate);
    $invoices = analyticsInvoices($con, $minDate);
    $orders = analyticsPartOrders($con, $minDate);
    $currentBookings = [];
    $previousBookings = [];
    foreach ($bookings as $booking) {
        if (analyticsDateInRange($booking['date'], $bounds['start'], $bounds['end'])) {
            $currentBookings[] = $booking;
        } elseif (analyticsDateInRange($booking['date'], $bounds['previousStart'], $bounds['start'])) {
            $previousBookings[] = $booking;
        }
    }

    $currentRevenue = 0.0;
    $previousRevenue = 0.0;
    $currentPaidInvoices = [];
    foreach ($invoices as $invoice) {
        if (empty($invoice['paid'])) continue;
        if (analyticsDateInRange($invoice['date'], $bounds['start'], $bounds['end'])) {
            $currentRevenue += floatval($invoice['total']);
            $currentPaidInvoices[] = $invoice;
        } elseif (analyticsDateInRange($invoice['date'], $bounds['previousStart'], $bounds['start'])) {
            $previousRevenue += floatval($invoice['total']);
        }
    }

    $activeContacts = [];
    $serviceMap = [];
    $contactMap = [];
    foreach ($currentBookings as $booking) {
        $customerKey = strval($booking['customerKey'] ?? '');
        $hasKnownContact = $customerKey !== '' && $customerKey !== 'name:' && ($booking['customer'] ?? '-') !== '-';
        if ($hasKnownContact) {
            $activeContacts[$customerKey] = true;
        }
        $service = trim(strval($booking['service'] ?? 'Unspecified')) ?: 'Unspecified';
        if (!isset($serviceMap[$service])) $serviceMap[$service] = 0;
        $serviceMap[$service]++;
        if ($hasKnownContact && !isset($contactMap[$customerKey])) {
            $contactMap[$customerKey] = [
                'id' => $customerKey,
                'name' => $booking['customer'] ?? '-',
                'bookings' => 0,
                'revenue' => 0.0
            ];
        }
        if ($hasKnownContact) $contactMap[$customerKey]['bookings']++;
    }
    foreach ($currentPaidInvoices as $invoice) {
        $customerKey = strval($invoice['customerKey'] ?? '');
        if ($customerKey === '' || $customerKey === 'name:' || ($invoice['customer'] ?? '-') === '-') continue;
        if (!isset($contactMap[$customerKey])) {
            $contactMap[$customerKey] = [
                'id' => $customerKey,
                'name' => $invoice['customer'] ?? '-',
                'bookings' => 0,
                'revenue' => 0.0
            ];
        }
        $contactMap[$customerKey]['revenue'] += floatval($invoice['total']);
    }

    $trend = [];
    $cursor = $bounds['start'];
    $monthlyBuckets = in_array($bounds['period'], ['quarter', 'year'], true);
    while ($cursor < $bounds['end']) {
        $key = $monthlyBuckets ? $cursor->format('Y-m') : $cursor->format('Y-m-d');
        $trend[$key] = [
            'id' => $key,
            'label' => $monthlyBuckets ? $cursor->format('M') : $cursor->format('d M'),
            'revenue' => 0.0,
            'bookings' => 0
        ];
        $cursor = $monthlyBuckets ? $cursor->modify('+1 month') : $cursor->modify('+1 day');
    }
    foreach ($currentBookings as $booking) {
        $key = $monthlyBuckets ? substr($booking['date'], 0, 7) : $booking['date'];
        if (isset($trend[$key])) $trend[$key]['bookings']++;
    }
    foreach ($currentPaidInvoices as $invoice) {
        $key = $monthlyBuckets ? substr($invoice['date'], 0, 7) : $invoice['date'];
        if (isset($trend[$key])) $trend[$key]['revenue'] += floatval($invoice['total']);
    }

    arsort($serviceMap);
    $serviceBreakdown = [];
    foreach ($serviceMap as $name => $value) {
        $serviceBreakdown[] = ['id' => strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name)), 'name' => $name, 'value' => $value];
    }
    $topContacts = array_values($contactMap);
    usort($topContacts, function ($a, $b) {
        $revenueComparison = floatval($b['revenue']) <=> floatval($a['revenue']);
        return $revenueComparison !== 0 ? $revenueComparison : intval($b['bookings']) <=> intval($a['bookings']);
    });
    $topContacts = array_slice($topContacts, 0, 5);

    $partsMap = [];
    foreach ($orders as $order) {
        $orderDate = analyticsDate($order['orderDate'] ?? '');
        if (!$orderDate || !analyticsDateInRange($orderDate, $bounds['start'], $bounds['end'])) continue;
        foreach ((array)($order['items'] ?? []) as $item) {
            $name = trim(strval($item['name'] ?? 'Parts')) ?: 'Parts';
            if (!isset($partsMap[$name])) {
                $partsMap[$name] = ['id' => strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name)), 'category' => $name, 'sales' => 0, 'revenue' => 0.0];
            }
            $quantity = max(0, intval($item['quantity'] ?? 0));
            $partsMap[$name]['sales'] += $quantity;
            $partsMap[$name]['revenue'] += $quantity * max(0, floatval($item['price'] ?? 0));
        }
    }
    $partsPerformance = array_values($partsMap);
    usort($partsPerformance, function ($a, $b) {
        return floatval($b['revenue']) <=> floatval($a['revenue']);
    });
    $partsPerformance = array_slice($partsPerformance, 0, 5);

    $revenueChange = analyticsChange($currentRevenue, $previousRevenue);
    $bookingChange = analyticsChange(count($currentBookings), count($previousBookings));
    return [
        'period' => [
            'key' => $bounds['period'],
            'start' => $bounds['start']->format('Y-m-d'),
            'endExclusive' => $bounds['end']->format('Y-m-d'),
            'previousStart' => $bounds['previousStart']->format('Y-m-d')
        ],
        'asOf' => date(DATE_ATOM),
        'metrics' => [
            'totalRevenue' => round($currentRevenue, 2),
            'revenueChange' => $revenueChange,
            'totalBookings' => count($currentBookings),
            'bookingsChange' => $bookingChange,
            'averageBookingValue' => count($currentBookings) > 0 ? round($currentRevenue / count($currentBookings), 2) : 0,
            'activeContacts' => count($activeContacts)
        ],
        'trend' => array_values($trend),
        'serviceBreakdown' => $serviceBreakdown,
        'topContacts' => $topContacts,
        'partsPerformance' => $partsPerformance,
        'definitions' => [
            'revenue' => 'Paid, settled, or completed invoices dated within the selected period.',
            'bookings' => 'Service bookings with an appointment date within the selected period.',
            'activeContacts' => 'Unique contacts with at least one service booking in the selected period.'
        ]
    ];
}

function dashboardLowStockCount($con) {
    $table = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if (!$table) return 0;
    $stockColumn = firstColumn($con, $table, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']);
    $thresholdColumn = firstColumn($con, $table, ['low_stock_threshold', 'minimum_stock', 'min_stock', 'reorder_level', 'reorder_point']);
    if (!$stockColumn || !$thresholdColumn) return 0;
    return countRows($con, $table, "COALESCE(`$stockColumn`, 0) <= COALESCE(`$thresholdColumn`, 0)");
}

function dashboardRecentActivity($con) {
    $events = [];
    if (tableExists($con, 'job')) {
        $result = mysqli_query($con, 'SELECT * FROM job ORDER BY id DESC LIMIT 40');
        $stages = [
            'collected_at' => ['Work order collected', 'collected'],
            'completed_at' => ['Ready for collection', 'ready_for_collection'],
            'under_repair_at' => ['Repair started', 'under_repair'],
            'parts_ready_at' => ['Parts marked ready', 'parts_ready'],
            'approved_at' => ['Repair approved', 'approved'],
            'quotation_issued_at' => ['Quotation issued', 'quotation_issued'],
            'inspected_at' => ['Inspection completed', 'inspected'],
            'checkin_at' => ['Vehicle checked in', 'checked_in']
        ];
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $workOrderNo = rowValue($row, ['work_order_no'], 'WO-' . intval($row['id']));
            foreach ($stages as $column => [$title, $type]) {
                $time = $row[$column] ?? null;
                if (!$time || strpos(strval($time), '0000-00-00') === 0) continue;
                $events[] = [
                    'id' => 'job-' . intval($row['id']) . '-' . $type,
                    'title' => $title,
                    'detail' => $workOrderNo,
                    'time' => $time,
                    'route' => '/work-orders',
                    'type' => 'work_order'
                ];
            }
        }
    }

    if (tableExists($con, 'accounting_invoice')) {
        $result = mysqli_query($con, 'SELECT * FROM accounting_invoice ORDER BY invoice_date DESC, id DESC LIMIT 30');
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $events[] = [
                'id' => 'accounting-invoice-' . intval($row['id']),
                'title' => floatval($row['outstanding']) <= 0 ? 'AutoCount invoice paid' : 'AutoCount invoice linked',
                'detail' => strval($row['external_invoice_no']),
                'time' => $row['source_updated_at'] ?: ($row['updated_at'] ?? $row['invoice_date']),
                'route' => '/invoices',
                'type' => 'invoice'
            ];
        }
    }
    if (tableExists($con, 'work_order_invoice')) {
        $result = mysqli_query($con, 'SELECT * FROM work_order_invoice ORDER BY id DESC LIMIT 30');
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $invoiceNo = rowValue($row, ['invoice_no'], 'Invoice #' . intval($row['id']));
            foreach ([
                'paid_at' => 'Invoice paid',
                'issued_at' => 'Invoice issued'
            ] as $column => $title) {
                $time = $row[$column] ?? null;
                if (!$time || strpos(strval($time), '0000-00-00') === 0) continue;
                $events[] = [
                    'id' => 'invoice-' . intval($row['id']) . '-' . $column,
                    'title' => $title,
                    'detail' => $invoiceNo,
                    'time' => $time,
                    'route' => '/invoices',
                    'type' => 'invoice'
                ];
            }
        }
    }
    if (tableExists($con, 'parts_orders')) {
        $result = mysqli_query($con, 'SELECT * FROM parts_orders ORDER BY id DESC LIMIT 20');
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $time = rowValue($row, ['created_at', 'order_date'], null);
            if (!$time) continue;
            $events[] = [
                'id' => 'parts-order-' . intval($row['id']),
                'title' => 'Parts order created',
                'detail' => rowValue($row, ['order_number', 'order_no'], 'Order #' . intval($row['id'])),
                'time' => $time,
                'route' => '/orders',
                'type' => 'parts'
            ];
        }
    }
    usort($events, function ($left, $right) {
        return (strtotime(strval($right['time'])) ?: 0) <=> (strtotime(strval($left['time'])) ?: 0);
    });
    return array_slice($events, 0, 8);
}

function adminDashboardAnalytics($con) {
    $minInvoiceDate = (new DateTimeImmutable(date('Y-m-01')))->modify('-5 months')->format('Y-m-d');
    $minBookingDate = (new DateTimeImmutable(date('Y-m-d')))->modify('-30 days')->format('Y-m-d');
    $bookings = analyticsBookings($con, $minBookingDate);
    $invoices = analyticsInvoices($con, $minInvoiceDate);
    $orders = analyticsPartOrders($con, $minInvoiceDate);
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $todayBookings = 0;
    $yesterdayBookings = 0;
    foreach ($bookings as $booking) {
        if ($booking['date'] === $today) $todayBookings++;
        if ($booking['date'] === $yesterday) $yesterdayBookings++;
    }

    $customerTable = tableExists($con, 'customer') ? 'customer' : (tableExists($con, 'users') ? 'users' : null);
    $customerWhere = $customerTable === 'users' && columnExists($con, 'users', 'role') ? "role = 'customer'" : '';
    $totalCustomers = $customerTable ? countRows($con, $customerTable, $customerWhere) : 0;
    $previousCustomers = $totalCustomers;
    if ($customerTable && columnExists($con, $customerTable, 'created_at')) {
        $previousCustomers = countRows(
            $con,
            $customerTable,
            ($customerWhere !== '' ? $customerWhere . ' AND ' : '') . "created_at < DATE_FORMAT(NOW(), '%Y-%m-01')"
        );
    }

    $currentMonthStart = new DateTimeImmutable(date('Y-m-01'));
    $nextMonthStart = $currentMonthStart->modify('+1 month');
    $previousMonthStart = $currentMonthStart->modify('-1 month');
    $monthRevenue = 0.0;
    $previousMonthRevenue = 0.0;
    foreach ($invoices as $invoice) {
        if (empty($invoice['paid'])) continue;
        if (analyticsDateInRange($invoice['date'], $currentMonthStart, $nextMonthStart)) {
            $monthRevenue += floatval($invoice['total']);
        } elseif (analyticsDateInRange($invoice['date'], $previousMonthStart, $currentMonthStart)) {
            $previousMonthRevenue += floatval($invoice['total']);
        }
    }
    $pendingOrders = 0;
    foreach ($orders as $order) {
        if (in_array(strtolower(strval($order['status'] ?? '')), ['pending', 'processing'], true)) $pendingOrders++;
    }

    $statusCounts = [
        'scheduled' => 0, 'checked_in' => 0, 'inspected' => 0, 'quotation_issued' => 0, 'approved' => 0,
        'parts_ready' => 0, 'under_repair' => 0, 'ready_for_collection' => 0, 'collected' => 0
    ];
    if (tableExists($con, 'job')) {
        $statusSql = getCanonicalStatusSql($con);
        $result = mysqli_query($con, "SELECT ($statusSql) AS canonical_status, COUNT(*) AS total FROM job GROUP BY canonical_status");
        if (!$result) {
            sendResponse(false, 'Unable to calculate work order lifecycle totals: ' . mysqli_error($con), null, 500);
        }
        while ($row = mysqli_fetch_assoc($result)) {
            $key = strval($row['canonical_status'] ?? '');
            if (array_key_exists($key, $statusCounts)) $statusCounts[$key] = intval($row['total']);
        }
    }

    $activeRepairs = array_sum(array_map(function ($status) use ($statusCounts) {
        return intval($statusCounts[$status] ?? 0);
    }, ['checked_in', 'inspected', 'quotation_issued', 'approved', 'parts_ready', 'under_repair']));
    $readyForCollection = intval($statusCounts['ready_for_collection'] ?? 0);
    $outstandingAmount = 0.0;
    $overdueInvoices = 0;
    if (tableExists($con, 'work_order_invoice')) {
        $outstandingAmount = floatval(scalarQuery(
            $con,
            "SELECT COALESCE(SUM(balance), 0) AS total FROM work_order_invoice WHERE status IN ('issued', 'partially_paid', 'overdue')",
            'total',
            0
        ));
        $overdueInvoices = intval(scalarQuery(
            $con,
            "SELECT COUNT(*) AS total FROM work_order_invoice WHERE status IN ('issued', 'partially_paid', 'overdue') AND balance > 0 AND due_date IS NOT NULL AND due_date < CURDATE()",
            'total',
            0
        ));
    }
    if (tableExists($con, 'accounting_invoice')) {
        $outstandingAmount += floatval(scalarQuery(
            $con,
            "SELECT COALESCE(SUM(outstanding), 0) AS total FROM accounting_invoice WHERE document_status = 'approved' AND outstanding > 0",
            'total',
            0
        ));
    }
    $lowStockParts = dashboardLowStockCount($con);
    
    // Comprehensive operational metrics
    $backOrderJobs = tableExists($con, 'job') && columnExists($con, 'job', 'is_back_order') 
        ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM job WHERE is_back_order = 1 AND (canonical_status IS NULL OR canonical_status NOT IN ('collected', 'completed')) AND status NOT IN ('collected', 'completed')", 'total', 0)) 
        : 0;

    $pendingSyncInvoices = tableExists($con, 'work_order_invoice') 
        ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM work_order_invoice WHERE status != 'void' AND (sync_status IS NULL OR sync_status = '' OR sync_status IN ('pending', 'queued', 'processing'))", 'total', 0)) 
        : 0;

    $failedSyncInvoices = tableExists($con, 'work_order_invoice') 
        ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM work_order_invoice WHERE sync_status = 'failed'", 'total', 0)) 
        : 0;

    $pendingPOs = tableExists($con, 'purchase_orders') 
        ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM purchase_orders WHERE status IN ('Draft', 'Submitted', 'Approved', 'Partially Received')", 'total', 0)) 
        : 0;

    $rescueJobs = tableExists($con, 'job') && columnExists($con, 'job', 'is_rescue') 
        ? intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM job WHERE is_rescue = 1 AND (canonical_status IS NULL OR canonical_status NOT IN ('collected', 'completed')) AND status NOT IN ('collected', 'completed')", 'total', 0)) 
        : 0;

    $todayWorkshop = [];
    foreach ($bookings as $booking) {
        if (($booking['date'] ?? '') !== $today) continue;
        if (in_array(strtolower(strval($booking['status'] ?? '')), ['cancelled', 'completed'], true)) continue;
        $todayWorkshop[] = [
            'id' => strval($booking['id'] ?? ''),
            'time' => strval($booking['time'] ?? ''),
            'customer' => strval($booking['customer'] ?? '-'),
            'vehicle' => strval($booking['vehicle'] ?? '-'),
            'service' => strval($booking['service'] ?? 'Unspecified'),
            'status' => strval($booking['status'] ?? 'Pending')
        ];
    }
    usort($todayWorkshop, function ($left, $right) {
        return strcmp(strval($left['time'] ?? ''), strval($right['time'] ?? ''));
    });
    $todayWorkshop = array_slice($todayWorkshop, 0, 8);

    $needsAttention = [
        ['key' => 'today_bookings', 'label' => 'Today’s bookings', 'description' => 'Appointments scheduled for today', 'count' => $todayBookings, 'route' => '/bookings', 'tone' => 'blue'],
        ['key' => 'emergency_rescue', 'label' => 'Roadside Rescue', 'description' => 'Active breakdown rescue jobs', 'count' => $rescueJobs, 'route' => '/work-orders', 'tone' => 'red'],
        ['key' => 'quotation_required', 'label' => 'Quotation required', 'description' => 'Inspections waiting for quotation', 'count' => intval($statusCounts['inspected'] ?? 0), 'route' => '/work-orders?status=inspected', 'tone' => 'amber'],
        ['key' => 'awaiting_approval', 'label' => 'Awaiting approval', 'description' => 'Issued quotations awaiting response', 'count' => intval($statusCounts['quotation_issued'] ?? 0), 'route' => '/work-orders?status=quotation_issued', 'tone' => 'violet'],
        ['key' => 'repair_not_started', 'label' => 'Repair not started', 'description' => 'Approved jobs waiting to begin', 'count' => intval($statusCounts['approved'] ?? 0) + intval($statusCounts['parts_ready'] ?? 0), 'route' => '/work-orders', 'tone' => 'orange'],
        ['key' => 'back_orders', 'label' => 'Back Order VIP jobs', 'description' => 'Jobs bypassing inventory shortage', 'count' => $backOrderJobs, 'route' => '/work-orders', 'tone' => 'violet'],
        ['key' => 'ready_for_collection', 'label' => 'Ready for collection', 'description' => 'Vehicles waiting for customer pickup', 'count' => $readyForCollection, 'route' => '/work-orders?status=ready_for_collection', 'tone' => 'green'],
        ['key' => 'pending_sync', 'label' => 'Pending AutoCount sync', 'description' => 'Invoices queued to push to ERP', 'count' => $pendingSyncInvoices, 'route' => '/pending-sync-invoices', 'tone' => 'orange'],
        ['key' => 'sync_failed', 'label' => 'AutoCount sync failed', 'description' => 'Invoices requiring sync retry', 'count' => $failedSyncInvoices, 'route' => '/pending-sync-invoices', 'tone' => 'red'],
        ['key' => 'pending_po', 'label' => 'Pending Purchase Orders', 'description' => 'Spare parts POs awaiting delivery', 'count' => $pendingPOs, 'route' => '/purchase-orders', 'tone' => 'amber'],
        ['key' => 'overdue_invoices', 'label' => 'Overdue invoices', 'description' => 'Issued invoices past due date', 'count' => $overdueInvoices, 'route' => '/invoices', 'tone' => 'red'],
        ['key' => 'low_stock', 'label' => 'Low stock parts', 'description' => 'Parts at or below reorder level', 'count' => $lowStockParts, 'route' => '/parts', 'tone' => 'red']
    ];

    usort($bookings, function ($a, $b) {
        return strcmp($b['date'], $a['date']);
    });
    $recentBookings = array_slice($bookings, 0, 5);

    $monthlyRevenue = [];
    $monthCursor = (new DateTimeImmutable(date('Y-m-01')))->modify('-5 months');
    for ($index = 0; $index < 6; $index++) {
        $key = $monthCursor->format('Y-m');
        $monthlyRevenue[$key] = ['month' => $monthCursor->format('M'), 'revenue' => 0.0];
        $monthCursor = $monthCursor->modify('+1 month');
    }
    foreach ($invoices as $invoice) {
        if (empty($invoice['paid'])) continue;
        $key = substr($invoice['date'], 0, 7);
        if (isset($monthlyRevenue[$key])) $monthlyRevenue[$key]['revenue'] += floatval($invoice['total']);
    }

    $weeklyBookings = [];
    for ($offset = 6; $offset >= 0; $offset--) {
        $date = date('Y-m-d', strtotime("-$offset days"));
        $weeklyBookings[$date] = ['day' => date('D', strtotime($date)), 'date' => $date, 'bookings' => 0];
    }
    foreach ($bookings as $booking) {
        if (isset($weeklyBookings[$booking['date']])) $weeklyBookings[$booking['date']]['bookings']++;
    }

    $serviceMap = [];
    foreach ($bookings as $booking) {
        if (!analyticsDateInRange($booking['date'], $currentMonthStart, $nextMonthStart)) continue;
        $service = trim(strval($booking['service'] ?? 'Unspecified')) ?: 'Unspecified';
        if (!isset($serviceMap[$service])) $serviceMap[$service] = 0;
        $serviceMap[$service]++;
    }
    arsort($serviceMap);
    $serviceTypes = [];
    foreach ($serviceMap as $name => $value) {
        $serviceTypes[] = ['name' => $name, 'value' => $value];
    }

    return [
        'asOf' => date(DATE_ATOM),
        'stats' => [
            'totalCustomers' => $totalCustomers,
            'totalCustomersChange' => analyticsChange($totalCustomers, $previousCustomers)['change'],
            'totalCustomersTrend' => analyticsChange($totalCustomers, $previousCustomers)['trend'],
            'todayBookings' => $todayBookings,
            'todayBookingsChange' => analyticsChange($todayBookings, $yesterdayBookings)['change'],
            'todayBookingsTrend' => analyticsChange($todayBookings, $yesterdayBookings)['trend'],
            'pendingOrders' => $pendingOrders,
            'activeRepairs' => $activeRepairs,
            'readyForCollection' => $readyForCollection,
            'outstandingAmount' => round($outstandingAmount, 2),
            'overdueInvoices' => $overdueInvoices,
            'backOrderJobs' => $backOrderJobs,
            'pendingSyncInvoices' => $pendingSyncInvoices,
            'failedSyncInvoices' => $failedSyncInvoices,
            'pendingPurchaseOrders' => $pendingPOs,
            'rescueJobs' => $rescueJobs,
            'lowStockParts' => $lowStockParts,
            'monthRevenue' => round($monthRevenue, 2),
            'monthRevenueChange' => analyticsChange($monthRevenue, $previousMonthRevenue)['change'],
            'monthRevenueTrend' => analyticsChange($monthRevenue, $previousMonthRevenue)['trend'],
            'workOrderStatusCounts' => $statusCounts
        ],
        'monthlyRevenue' => array_values($monthlyRevenue),
        'weeklyBookings' => array_values($weeklyBookings),
        'serviceTypes' => $serviceTypes,
        'recentBookings' => $recentBookings,
        'needsAttention' => $needsAttention,
        'todayWorkshop' => $todayWorkshop,
        'recentActivity' => dashboardRecentActivity($con),
        'definitions' => [
            'monthRevenue' => 'Paid, settled, or completed invoices dated in the current calendar month.',
            'todayBookings' => 'Service bookings scheduled for today.'
        ]
    ];
}



function handleAnalyticsRoute($con, $mode, $inputData) {
    switch ($mode) {
        case 'admin-dashboard':
            sendResponse(true, 'Admin dashboard retrieved', adminDashboardAnalytics($con));
            break;

        case 'admin-reports':
            $period = strtolower(trim(strval($inputData['period'] ?? $_GET['period'] ?? 'month')));
            if (!in_array($period, ['week', 'month', 'quarter', 'year'], true)) {
                sendResponse(false, 'Select a valid report period.', null, 400);
            }
            sendResponse(true, 'Admin report retrieved', adminAnalyticsReport($con, $period));
            break;

        default:
            sendResponse(false, "Unsupported analytics action: $mode", null, 400);
            break;
    }
}

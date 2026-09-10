<?php
/**
 * Purchase Order Domain Module
 *
 * Handles procurement orders, supplier master queries, AutoCount PO sync,
 * goods receiving (GRN) inventory updates, and arrival alerts.
 */

function requirePurchaseOrderSchema($con) {
    if (!tableExists($con, 'purchase_order') || !tableExists($con, 'purchase_order_item')) {
        sendResponse(false, 'Purchase Order storage is unavailable. Apply migration 025_purchase_orders.sql.', null, 409);
    }
}

function purchaseOrderRecord($con, $purchaseOrderId) {
    requirePurchaseOrderSchema($con);
    $purchaseOrderId = intval($purchaseOrderId);
    $result = mysqli_query($con, "SELECT po.*, j.work_order_no FROM purchase_order po LEFT JOIN job j ON j.id = po.work_order_id WHERE po.id = $purchaseOrderId LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row) return null;
    $items = [];
    $itemResult = mysqli_query($con, "SELECT * FROM purchase_order_item WHERE purchase_order_id = $purchaseOrderId ORDER BY sort_order, id");
    while ($itemResult && $item = mysqli_fetch_assoc($itemResult)) {
        $items[] = [
            'id' => intval($item['id']),
            'partId' => $item['part_id'] !== null ? intval($item['part_id']) : null,
            'itemCode' => $item['item_code'] ?? '',
            'description' => $item['description'],
            'uom' => $item['uom'] ?? '',
            'quantity' => floatval($item['quantity']),
            'receivedQuantity' => floatval($item['received_quantity']),
            'unitCost' => floatval($item['unit_cost']),
            'taxCode' => $item['tax_code'] ?? '',
            'taxRate' => floatval($item['tax_rate']),
            'taxAmount' => floatval($item['tax_amount']),
            'amount' => floatval($item['amount'])
        ];
    }
    return [
        'id' => $purchaseOrderId,
        'internalRef' => $row['internal_ref'] ?? '',
        'autocountPoNo' => $row['autocount_po_no'] ?? '',
        'workOrderId' => $row['work_order_id'] !== null ? intval($row['work_order_id']) : null,
        'workOrderNo' => $row['work_order_no'] ?? '',
        'supplierCode' => $row['supplier_code'] ?? '',
        'supplierName' => $row['supplier_name'],
        'orderDate' => $row['order_date'],
        'estimatedArrivalDate' => $row['estimated_arrival_date'],
        'reminderDays' => intval($row['reminder_days']),
        'status' => $row['status'],
        'currency' => $row['currency'] ?? 'MYR',
        'subtotal' => floatval($row['subtotal']),
        'taxAmount' => floatval($row['tax_amount']),
        'total' => floatval($row['total']),
        'notes' => $row['notes'] ?? '',
        'syncStatus' => $row['sync_status'] ?? 'not_queued',
        'syncRequestedAt' => $row['sync_requested_at'] ?? null,
        'syncedAt' => $row['synced_at'] ?? null,
        'syncError' => $row['sync_error'] ?? '',
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'orderedAt' => $row['ordered_at'] ?? null,
        'receivedAt' => $row['received_at'] ?? null,
        'items' => $items
    ];
}

function normalizePurchaseOrderPayload($inputData) {
    $supplierName = substr(trim(strval($inputData['supplierName'] ?? '')), 0, 150);
    if ($supplierName === '') sendResponse(false, 'Supplier name is required.', null, 400);
    $orderDate = trim(strval($inputData['orderDate'] ?? ''));
    $eta = trim(strval($inputData['estimatedArrivalDate'] ?? ''));
    foreach ([['Order date', $orderDate], ['Estimated arrival date', $eta]] as $dateField) {
        $parsed = DateTime::createFromFormat('!Y-m-d', $dateField[1]);
        if (!$parsed || $parsed->format('Y-m-d') !== $dateField[1]) sendResponse(false, $dateField[0] . ' is invalid.', null, 400);
    }
    if ($eta < $orderDate) sendResponse(false, 'Estimated arrival date cannot be before the order date.', null, 400);
    $reminderDays = intval($inputData['reminderDays'] ?? 1);
    if ($reminderDays < 0 || $reminderDays > 30) sendResponse(false, 'Reminder days must be between 0 and 30.', null, 400);
    $rawItems = is_array($inputData['items'] ?? null) ? $inputData['items'] : [];
    if (count($rawItems) === 0) sendResponse(false, 'Add at least one Purchase Order item.', null, 400);
    if (count($rawItems) > 200) sendResponse(false, 'A Purchase Order cannot exceed 200 lines.', null, 400);
    $items = [];
    $subtotal = 0.0;
    $taxAmount = 0.0;
    foreach ($rawItems as $index => $rawItem) {
        $description = substr(trim(strval($rawItem['description'] ?? '')), 0, 500);
        $quantity = round(floatval($rawItem['quantity'] ?? 0), 2);
        $unitCost = round(floatval($rawItem['unitCost'] ?? 0), 2);
        $taxRate = round(floatval($rawItem['taxRate'] ?? 0), 2);
        if ($description === '' || $quantity <= 0 || $unitCost < 0 || $taxRate < 0 || $taxRate > 100) sendResponse(false, 'Check description, quantity, cost and tax on line ' . ($index + 1) . '.', null, 400);
        $amount = round($quantity * $unitCost, 2);
        $lineTax = round($amount * $taxRate / 100, 2);
        $subtotal += $amount;
        $taxAmount += $lineTax;
        $items[] = [
            'partId' => !empty($rawItem['partId']) ? intval($rawItem['partId']) : null,
            'itemCode' => substr(strtoupper(trim(strval($rawItem['itemCode'] ?? ''))), 0, 80),
            'description' => $description,
            'uom' => substr(strtoupper(trim(strval($rawItem['uom'] ?? 'UNIT'))), 0, 30),
            'quantity' => $quantity,
            'unitCost' => $unitCost,
            'taxCode' => substr(trim(strval($rawItem['taxCode'] ?? '')), 0, 30),
            'taxRate' => $taxRate,
            'taxAmount' => $lineTax,
            'amount' => $amount
        ];
    }
    return [
        'workOrderId' => !empty($inputData['workOrderId']) ? intval($inputData['workOrderId']) : null,
        'supplierCode' => substr(strtoupper(trim(strval($inputData['supplierCode'] ?? ''))), 0, 40),
        'supplierName' => $supplierName,
        'orderDate' => $orderDate,
        'estimatedArrivalDate' => $eta,
        'reminderDays' => $reminderDays,
        'notes' => substr(trim(strval($inputData['notes'] ?? '')), 0, 5000),
        'subtotal' => round($subtotal, 2),
        'taxAmount' => round($taxAmount, 2),
        'total' => round($subtotal + $taxAmount, 2),
        'items' => $items
    ];
}

function autoCountPurchaseOrderSyncPayload($con, $purchaseOrderId) {
    $order = purchaseOrderRecord($con, $purchaseOrderId);
    if (!$order) return null;
    return [
        'mawPurchaseOrderId' => $order['id'],
        'internalRef' => $order['internalRef'],
        'supplierCode' => $order['supplierCode'],
        'supplierName' => $order['supplierName'],
        'orderDate' => $order['orderDate'],
        'estimatedArrivalDate' => $order['estimatedArrivalDate'],
        'currency' => $order['currency'],
        'workOrderNo' => $order['workOrderNo'],
        'subtotal' => $order['subtotal'],
        'taxAmount' => $order['taxAmount'],
        'total' => $order['total'],
        'notes' => $order['notes'],
        'items' => array_map(function ($item, $index) {
            return [
                'lineNo' => $index + 1,
                'itemCode' => $item['itemCode'],
                'description' => $item['description'],
                'uom' => $item['uom'],
                'quantity' => $item['quantity'],
                'unitCost' => $item['unitCost'],
                'taxCode' => $item['taxCode'],
                'taxRate' => $item['taxRate'],
                'taxAmount' => $item['taxAmount'],
                'amount' => $item['amount']
            ];
        }, $order['items'], array_keys($order['items']))
    ];
}

function purchaseOrderArrivalNotifications($con) {
    if (!tableExists($con, 'purchase_order')) return [];
    $notifications = [];
    $result = mysqli_query($con, "SELECT po.*, j.work_order_no, poi.part_names FROM purchase_order po LEFT JOIN job j ON j.id = po.work_order_id LEFT JOIN (SELECT purchase_order_id, GROUP_CONCAT(description ORDER BY sort_order SEPARATOR ', ') AS part_names FROM purchase_order_item GROUP BY purchase_order_id) poi ON poi.purchase_order_id = po.id WHERE po.status IN ('pending_sync', 'ordered', 'partially_received') AND po.estimated_arrival_date <= DATE_ADD(CURDATE(), INTERVAL po.reminder_days DAY) ORDER BY po.estimated_arrival_date, po.id");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $days = intval(floor((strtotime($row['estimated_arrival_date']) - strtotime(date('Y-m-d'))) / 86400));
        $reference = $row['autocount_po_no'] ?: ($row['internal_ref'] ?: 'PO-' . intval($row['id']));
        $timing = $days < 0 ? abs($days) . ' day(s) overdue' : ($days === 0 ? 'due today' : 'due in ' . $days . ' day(s)');
        $notifications[] = [
            'id' => 'po-arrival-' . intval($row['id']),
            'title' => $days < 0 ? 'Purchase Order overdue' : 'Parts arriving soon',
            'message' => $reference . ': ' . substr(strval($row['part_names'] ?? 'Parts'), 0, 180) . ' from ' . $row['supplier_name'] . ' is ' . $timing . ($row['work_order_no'] ? ' for ' . $row['work_order_no'] : '') . '.',
            'recipient' => 'Workshop Admin',
            'type' => $days < 0 ? 'Warning' : 'Reminder',
            'status' => 'Active',
            'date' => $row['estimated_arrival_date'] . ' 00:00',
            'channel' => 'System Reminder',
            'actionRoute' => '/purchase-orders'
        ];
    }
    return $notifications;
}

/**
 * Purchase Order route dispatcher
 */
function handlePurchaseOrderRoute($con, $mode, $inputData) {
    switch ($mode) {
        case 'admin-purchase-order-options':
            requirePurchaseOrderSchema($con);
            $suppliers = [];
            if (tableExists($con, 'Creditor')) {
                $result = mysqli_query(
                    $con,
                    "SELECT `AccNo`, `CompanyName`, `RegisterNo`, `Attention`, `Phone1`, `Mobile`,
                            `EmailAddress`, `Address1`, `Address2`, `Address3`, `Address4`, `PostCode`,
                            `DisplayTerm`, `CreditLimit`, `CurrencyCode`, `TaxCode`, `IsActive`
                     FROM `Creditor`
                     WHERE COALESCE(UPPER(TRIM(`IsActive`)), 'T') NOT IN ('F', '0', 'N', 'FALSE')
                       AND TRIM(COALESCE(`AccNo`, '')) <> ''
                     ORDER BY `CompanyName`, `AccNo`"
                );
                $seenCodes = [];
                while ($result && $row = mysqli_fetch_assoc($result)) {
                    $accNo = trim(strval($row['AccNo'] ?? ''));
                    $codeKey = strtoupper($accNo);
                    if ($codeKey === '' || isset($seenCodes[$codeKey])) continue;
                    $seenCodes[$codeKey] = true;
                    $address = array_values(array_filter(array_map('trim', [
                        strval($row['Address1'] ?? ''),
                        strval($row['Address2'] ?? ''),
                        strval($row['Address3'] ?? ''),
                        strval($row['Address4'] ?? ''),
                        strval($row['PostCode'] ?? '')
                    ])));
                    $suppliers[] = [
                        'code' => $accNo,
                        'name' => strval($row['CompanyName'] ?? ''),
                        'registrationNo' => strval($row['RegisterNo'] ?? ''),
                        'contact' => strval($row['Attention'] ?? ''),
                        'phone' => strval(($row['Phone1'] ?? '') ?: ($row['Mobile'] ?? '')),
                        'email' => strval($row['EmailAddress'] ?? ''),
                        'address' => implode(', ', $address),
                        'paymentTerm' => strval($row['DisplayTerm'] ?? ''),
                        'creditLimit' => floatval($row['CreditLimit'] ?? 0),
                        'currency' => strval($row['CurrencyCode'] ?? ''),
                        'taxCode' => strval($row['TaxCode'] ?? '')
                    ];
                }
            }
            $supplierNamesByCode = [];
            $supplierCodesByName = [];
            foreach ($suppliers as $supplierOption) {
                $code = strtoupper(trim(strval($supplierOption['code'] ?? '')));
                $name = trim(strval($supplierOption['name'] ?? ''));
                if ($code !== '' && $name !== '' && !isset($supplierNamesByCode[$code])) {
                    $supplierNamesByCode[$code] = $name;
                }
                if ($name !== '' && $code !== '' && !isset($supplierCodesByName[$name])) {
                    $supplierCodesByName[$name] = $code;
                }
            }
            $parts = [];
            $partsTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
            if ($partsTable) {
                $columns = [
                    'id' => firstColumn($con, $partsTable, ['id', 'part_id']),
                    'code' => firstColumn($con, $partsTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']),
                    'name' => firstColumn($con, $partsTable, ['name', 'part_name', 'title', 'item_name', 'description']),
                    'cost' => firstColumn($con, $partsTable, ['cost', 'cost_price', 'unit_cost', 'purchase_price', 'buy_price']),
                    'price' => firstColumn($con, $partsTable, ['price', 'selling_price', 'unit_price']),
                    'uom' => firstColumn($con, $partsTable, ['uom', 'unit', 'unit_of_measure']),
                    'stock' => firstColumn($con, $partsTable, ['stock', 'quantity', 'qty', 'stock_quantity']),
                    'supplierCode' => firstColumn($con, $partsTable, ['supplier_code', 'creditor_code', 'vendor_code']),
                    'supplierName' => firstColumn($con, $partsTable, ['supplier_name', 'supplier', 'vendor_name', 'vendor'])
                ];
                $idCol = $columns['id'] ?: 'id';
                $codeCol = $columns['code'] ? "`{$columns['code']}`" : "''";
                $nameCol = $columns['name'] ? "`{$columns['name']}`" : "''";
                $costCol = $columns['cost'] ? "`{$columns['cost']}`" : "0";
                $priceCol = $columns['price'] ? "`{$columns['price']}`" : "0";
                $uomCol = $columns['uom'] ? "`{$columns['uom']}`" : "'UNIT'";
                $stockCol = $columns['stock'] ? "`{$columns['stock']}`" : "0";
                $supplierCodeCol = $columns['supplierCode'] ? "`{$columns['supplierCode']}`" : "''";
                $supplierNameCol = $columns['supplierName'] ? "`{$columns['supplierName']}`" : "''";
                $query = "SELECT `$idCol` AS id, $codeCol AS item_code, $nameCol AS description,
                                 $costCol AS unit_cost, $priceCol AS unit_price, $uomCol AS uom,
                                 $stockCol AS stock, $supplierCodeCol AS supplier_code,
                                 $supplierNameCol AS supplier_name
                          FROM `$partsTable`
                          ORDER BY $nameCol, `$idCol`";
                $res = mysqli_query($con, $query);
                while ($res && $row = mysqli_fetch_assoc($res)) {
                    $supplierCode = trim(strval($row['supplier_code'] ?? ''));
                    $supplierName = trim(strval($row['supplier_name'] ?? ''));
                    if ($supplierCode !== '' && $supplierName === '' && isset($supplierNamesByCode[strtoupper($supplierCode)])) {
                        $supplierName = $supplierNamesByCode[strtoupper($supplierCode)];
                    } elseif ($supplierName !== '' && $supplierCode === '' && isset($supplierCodesByName[$supplierName])) {
                        $supplierCode = $supplierCodesByName[$supplierName];
                    }
                    $parts[] = [
                        'id' => intval($row['id']),
                        'itemCode' => strval($row['item_code'] ?? ''),
                        'description' => strval($row['description'] ?? ''),
                        'unitCost' => floatval($row['unit_cost'] ?? 0),
                        'unitPrice' => floatval($row['unit_price'] ?? 0),
                        'uom' => strval($row['uom'] ?? 'UNIT') ?: 'UNIT',
                        'stock' => floatval($row['stock'] ?? 0),
                        'supplierCode' => $supplierCode,
                        'supplierName' => $supplierName
                    ];
                }
            }
            if (empty($parts) && tableExists($con, 'Item')) {
                $itemRes = mysqli_query(
                    $con,
                    "SELECT `ItemCode`, `Description`, `BaseUOM`, `TaxCode`
                     FROM `Item`
                     WHERE COALESCE(UPPER(TRIM(`IsActive`)), 'T') NOT IN ('F', '0', 'N', 'FALSE')
                     ORDER BY `Description`, `ItemCode`
                     LIMIT 500"
                );
                while ($itemRes && $itemRow = mysqli_fetch_assoc($itemRes)) {
                    $parts[] = [
                        'id' => null,
                        'itemCode' => strval($itemRow['ItemCode'] ?? ''),
                        'description' => strval($itemRow['Description'] ?? ''),
                        'unitCost' => 0,
                        'unitPrice' => 0,
                        'uom' => strval($itemRow['BaseUOM'] ?? 'UNIT') ?: 'UNIT',
                        'stock' => 0,
                        'supplierCode' => '',
                        'supplierName' => ''
                    ];
                }
            }
            $workOrders = [];
            if (tableExists($con, 'job')) {
                $statusSql = getCanonicalStatusSql($con, 'j');
                $workOrderQuery = "SELECT j.id, j.work_order_no,
                        COALESCE(c.reg_no, v.reg_no, '-') AS vehicle_no,
                        COALESCE(comp.name, u.name, '-') AS customer_name,
                        ($statusSql) AS canonical_status
                    FROM job j
                    LEFT JOIN customer_vehicle c ON c.id = j.vehicle_id
                    LEFT JOIN vehicles v ON v.id = j.vehicle_id
                    LEFT JOIN company comp ON comp.id = j.company_id
                    LEFT JOIN users u ON u.id = j.user_id
                    WHERE ($statusSql) IN ('approved', 'parts_ready', 'under_repair')
                    ORDER BY j.id DESC
                    LIMIT 200";
                $woRes = mysqli_query($con, $workOrderQuery);
                while ($woRes && $woRow = mysqli_fetch_assoc($woRes)) {
                    $workOrders[] = [
                        'id' => intval($woRow['id']),
                        'workOrderNo' => strval($woRow['work_order_no'] ?? ('WO-' . $woRow['id'])),
                        'vehicleNo' => strval($woRow['vehicle_no'] ?? '-'),
                        'customerName' => strval($woRow['customer_name'] ?? '-'),
                        'canonicalStatus' => strval($woRow['canonical_status'] ?? '')
                    ];
                }
            }
            sendResponse(true, 'Purchase Order options retrieved.', [
                'suppliers' => $suppliers,
                'parts' => $parts,
                'workOrders' => $workOrders
            ]);
            break;

        case 'admin-purchase-orders':
            requirePurchaseOrderSchema($con);
            $result = mysqli_query($con, 'SELECT po.*, j.work_order_no FROM purchase_order po LEFT JOIN job j ON j.id = po.work_order_id ORDER BY po.order_date DESC, po.id DESC LIMIT 300');
            $orders = [];
            $orderIds = [];
            while ($result && $row = mysqli_fetch_assoc($result)) {
                $id = intval($row['id']);
                $orderIds[] = $id;
                $orders[$id] = [
                    'id' => $id,
                    'internalRef' => $row['internal_ref'] ?? '',
                    'autocountPoNo' => $row['autocount_po_no'] ?? '',
                    'workOrderId' => $row['work_order_id'] !== null ? intval($row['work_order_id']) : null,
                    'workOrderNo' => $row['work_order_no'] ?? '',
                    'supplierCode' => $row['supplier_code'] ?? '',
                    'supplierName' => $row['supplier_name'],
                    'orderDate' => $row['order_date'],
                    'estimatedArrivalDate' => $row['estimated_arrival_date'],
                    'reminderDays' => intval($row['reminder_days']),
                    'status' => $row['status'],
                    'currency' => $row['currency'] ?? 'MYR',
                    'subtotal' => floatval($row['subtotal']),
                    'taxAmount' => floatval($row['tax_amount']),
                    'total' => floatval($row['total']),
                    'notes' => $row['notes'] ?? '',
                    'syncStatus' => $row['sync_status'] ?? 'not_queued',
                    'syncRequestedAt' => $row['sync_requested_at'] ?? null,
                    'syncedAt' => $row['synced_at'] ?? null,
                    'syncError' => $row['sync_error'] ?? '',
                    'createdAt' => $row['created_at'],
                    'updatedAt' => $row['updated_at'],
                    'orderedAt' => $row['ordered_at'] ?? null,
                    'receivedAt' => $row['received_at'] ?? null,
                    'items' => []
                ];
            }
            if (!empty($orderIds)) {
                $idsList = implode(',', $orderIds);
                $itemRes = mysqli_query($con, "SELECT * FROM purchase_order_item WHERE purchase_order_id IN ($idsList) ORDER BY sort_order, id");
                while ($itemRes && $item = mysqli_fetch_assoc($itemRes)) {
                    $poId = intval($item['purchase_order_id']);
                    if (isset($orders[$poId])) {
                        $orders[$poId]['items'][] = [
                            'id' => intval($item['id']),
                            'partId' => $item['part_id'] !== null ? intval($item['part_id']) : null,
                            'itemCode' => $item['item_code'] ?? '',
                            'description' => $item['description'],
                            'uom' => $item['uom'] ?? '',
                            'quantity' => floatval($item['quantity']),
                            'receivedQuantity' => floatval($item['received_quantity']),
                            'unitCost' => floatval($item['unit_cost']),
                            'taxCode' => $item['tax_code'] ?? '',
                            'taxRate' => floatval($item['tax_rate']),
                            'taxAmount' => floatval($item['tax_amount']),
                            'amount' => floatval($item['amount'])
                        ];
                    }
                }
            }
            sendResponse(true, 'Purchase Orders retrieved.', array_values($orders));
            break;

        case 'admin-save-purchase-order':
            requirePurchaseOrderSchema($con);
            $purchaseOrderId = intval($inputData['id'] ?? 0);
            $existing = $purchaseOrderId > 0 ? purchaseOrderRecord($con, $purchaseOrderId) : null;
            if ($purchaseOrderId > 0 && !$existing) sendResponse(false, 'Purchase Order not found.', null, 404);
            if ($existing && $existing['status'] !== 'draft') sendResponse(false, 'Only a draft Purchase Order can be edited.', null, 409);
            $order = normalizePurchaseOrderPayload($inputData);
            $supplierCode = mysqli_real_escape_string($con, $order['supplierCode']);
            $supplierName = mysqli_real_escape_string($con, $order['supplierName']);
            $orderDate = mysqli_real_escape_string($con, $order['orderDate']);
            $eta = mysqli_real_escape_string($con, $order['estimatedArrivalDate']);
            $notes = mysqli_real_escape_string($con, $order['notes']);
            $workOrderIdSql = $order['workOrderId'] ? intval($order['workOrderId']) : 'NULL';
            $adminId = intval($_SESSION['admin_id'] ?? 0);
            mysqli_begin_transaction($con);
            try {
                if ($existing) {
                    if (!mysqli_query($con, "UPDATE purchase_order SET work_order_id = $workOrderIdSql, supplier_code = '$supplierCode', supplier_name = '$supplierName', order_date = '$orderDate', estimated_arrival_date = '$eta', reminder_days = {$order['reminderDays']}, subtotal = {$order['subtotal']}, tax_amount = {$order['taxAmount']}, total = {$order['total']}, notes = '$notes', updated_at = NOW() WHERE id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                    if (!mysqli_query($con, "DELETE FROM purchase_order_item WHERE purchase_order_id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                } else {
                    if (!mysqli_query($con, "INSERT INTO purchase_order (work_order_id, supplier_code, supplier_name, order_date, estimated_arrival_date, reminder_days, subtotal, tax_amount, total, notes, created_by) VALUES ($workOrderIdSql, '$supplierCode', '$supplierName', '$orderDate', '$eta', {$order['reminderDays']}, {$order['subtotal']}, {$order['taxAmount']}, {$order['total']}, '$notes', $adminId)")) throw new Exception(mysqli_error($con), 500);
                    $purchaseOrderId = intval(mysqli_insert_id($con));
                    $internalRef = sprintf('MPO-%s-%06d', date('Y'), $purchaseOrderId);
                    if (!mysqli_query($con, "UPDATE purchase_order SET internal_ref = '$internalRef' WHERE id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                }
                foreach ($order['items'] as $sortOrder => $item) {
                    $partIdSql = $item['partId'] ? intval($item['partId']) : 'NULL';
                    $itemCode = mysqli_real_escape_string($con, $item['itemCode']);
                    $description = mysqli_real_escape_string($con, $item['description']);
                    $uom = mysqli_real_escape_string($con, $item['uom']);
                    $taxCode = mysqli_real_escape_string($con, $item['taxCode']);
                    if (!mysqli_query($con, "INSERT INTO purchase_order_item (purchase_order_id, part_id, item_code, description, uom, quantity, unit_cost, tax_code, tax_rate, tax_amount, amount, sort_order) VALUES ($purchaseOrderId, $partIdSql, '$itemCode', '$description', '$uom', {$item['quantity']}, {$item['unitCost']}, '$taxCode', {$item['taxRate']}, {$item['taxAmount']}, {$item['amount']}, " . intval($sortOrder) . ')')) throw new Exception(mysqli_error($con), 500);
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to save Purchase Order: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'Purchase Order draft saved.', purchaseOrderRecord($con, $purchaseOrderId));
            break;

        case 'admin-submit-purchase-order':
            requirePurchaseOrderSchema($con);
            $purchaseOrderId = intval($inputData['id'] ?? 0);
            $syncToAutoCount = filter_var($inputData['syncToAutoCount'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $order = purchaseOrderRecord($con, $purchaseOrderId);
            if (!$order || $order['status'] !== 'draft') sendResponse(false, 'Only a draft Purchase Order can be submitted.', null, 409);
            if ($syncToAutoCount && trim($order['supplierCode']) === '') sendResponse(false, 'Supplier Code is required for AutoCount sync.', null, 409);
            $status = $syncToAutoCount ? 'pending_sync' : 'ordered';
            $syncStatus = $syncToAutoCount ? 'queued' : 'not_queued';
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE purchase_order SET status = '$status', sync_status = '$syncStatus', sync_requested_at = " . ($syncToAutoCount ? 'NOW()' : 'NULL') . ", ordered_at = NOW(), sync_error = NULL WHERE id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                if ($syncToAutoCount && !mysqli_query($con, "INSERT INTO autocount_purchase_order_sync_queue (purchase_order_id, operation, status) VALUES ($purchaseOrderId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()")) throw new Exception(mysqli_error($con), 500);
                if ($order['workOrderId'] && tableExists($con, 'job') && columnExists($con, 'job', 'parts_status')) {
                    $workOrderId = intval($order['workOrderId']);
                    $eta = mysqli_real_escape_string($con, $order['estimatedArrivalDate']);
                    $reference = mysqli_real_escape_string($con, $order['internalRef']);
                    $statusAdvance = (columnExists($con, 'job', 'status')) ? ", status = IF(status = 'approved', 'pending_parts', status)" : "";
                    mysqli_query($con, "UPDATE job SET parts_status = 'pending_parts', parts_expected_date = '$eta', parts_reference = '$reference', parts_status_updated_at = NOW(), parts_status_updated_by = " . intval($_SESSION['admin_id'] ?? 0) . " $statusAdvance WHERE id = $workOrderId");
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to submit Purchase Order: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, $syncToAutoCount ? 'Purchase Order queued for AutoCount.' : 'Purchase Order confirmed.', purchaseOrderRecord($con, $purchaseOrderId));
            break;

        case 'admin-retry-purchase-order-sync':
            requirePurchaseOrderSchema($con);
            $purchaseOrderId = intval($inputData['id'] ?? 0);
            $order = purchaseOrderRecord($con, $purchaseOrderId);
            if (!$order) sendResponse(false, 'Purchase Order not found.', null, 404);
            if (in_array($order['status'], ['draft', 'cancelled'], true)) {
                sendResponse(false, 'Draft or cancelled purchase orders cannot be queued for sync.', null, 409);
            }
            if ($order['syncStatus'] === 'synced') {
                sendResponse(false, 'This Purchase Order is already synced to AutoCount.', null, 409);
            }
            if ($order['syncStatus'] !== 'failed' && $order['syncStatus'] !== 'queued' && $order['syncStatus'] !== 'processing') {
                sendResponse(false, 'Only failed or queued Purchase Orders can be retried for sync.', null, 409);
            }
            if (trim($order['supplierCode']) === '') {
                sendResponse(false, 'Supplier Code is required for AutoCount sync.', null, 409);
            }
            mysqli_query($con, "UPDATE purchase_order SET status = CASE WHEN status IN ('partially_received', 'received') THEN status ELSE 'pending_sync' END, sync_status = 'queued', sync_requested_at = NOW(), sync_error = NULL WHERE id = $purchaseOrderId");
            mysqli_query($con, "INSERT INTO autocount_purchase_order_sync_queue (purchase_order_id, operation, status) VALUES ($purchaseOrderId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL");
            sendResponse(true, 'Purchase Order re-queued.', purchaseOrderRecord($con, $purchaseOrderId));
            break;

        case 'admin-receive-purchase-order':
            requirePurchaseOrderSchema($con);
            $purchaseOrderId = intval($inputData['id'] ?? 0);
            $order = purchaseOrderRecord($con, $purchaseOrderId);
            if (!$order) sendResponse(false, 'Purchase Order not found.', null, 404);
            if (!in_array($order['status'], ['ordered', 'partially_received'], true)) {
                sendResponse(false, 'Only confirmed orders in Ordered or Partially Received status can receive parts.', null, 409);
            }
            if ($order['syncStatus'] === 'failed') {
                sendResponse(false, 'Cannot receive parts for a Purchase Order with a failed AutoCount sync. Resolve the sync error first.', null, 409);
            }
            if ($order['syncStatus'] === 'queued' || $order['syncStatus'] === 'processing') {
                sendResponse(false, 'Cannot receive parts while Purchase Order is awaiting AutoCount sync confirmation.', null, 409);
            }
            $receivedInput = is_array($inputData['items'] ?? null) ? $inputData['items'] : [];
            $receivedById = [];
            foreach ($receivedInput as $item) $receivedById[intval($item['id'] ?? 0)] = round(floatval($item['receivedQuantity'] ?? 0), 2);
            $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
            $stockColumn = $partTable ? firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']) : null;
            $inStockColumn = $partTable ? firstColumn($con, $partTable, ['in_stock', 'is_available', 'available']) : null;
            $allReceived = true;
            $anyReceived = false;
            mysqli_begin_transaction($con);
            try {
                $lockedItems = [];
                $lockedResult = mysqli_query($con, "SELECT id, received_quantity FROM purchase_order_item WHERE purchase_order_id = $purchaseOrderId FOR UPDATE");
                if (!$lockedResult) throw new Exception(mysqli_error($con), 500);
                while ($lockedRow = mysqli_fetch_assoc($lockedResult)) $lockedItems[intval($lockedRow['id'])] = floatval($lockedRow['received_quantity']);
                foreach ($order['items'] as $item) {
                    $itemId = intval($item['id']);
                    $oldReceived = $lockedItems[$itemId] ?? floatval($item['receivedQuantity']);
                    $newReceived = array_key_exists($itemId, $receivedById) ? $receivedById[$itemId] : $oldReceived;
                    if ($newReceived < $oldReceived || $newReceived > floatval($item['quantity'])) throw new Exception('Received quantity cannot decrease or exceed ordered quantity.', 400);
                    $delta = round($newReceived - $oldReceived, 2);
                    $partId = intval($item['partId'] ?? 0);
                    if ($partId <= 0 && !empty($item['itemCode']) && $partTable) {
                        $skuCol = firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
                        if ($skuCol) {
                            $escCode = mysqli_real_escape_string($con, trim($item['itemCode']));
                            $partId = intval(scalarQuery($con, "SELECT id FROM `$partTable` WHERE UPPER(TRIM(`$skuCol`)) = UPPER(TRIM('$escCode')) LIMIT 1", 'id', 0));
                        }
                    }
                    if ($delta > 0 && $partId > 0 && $partTable && $stockColumn) {
                        $set = "`$stockColumn` = `$stockColumn` + $delta";
                        if ($inStockColumn) $set .= ", `$inStockColumn` = 1";
                        if (!mysqli_query($con, "UPDATE `$partTable` SET $set WHERE id = $partId")) throw new Exception(mysqli_error($con), 500);

                        $newBalance = floatval(scalarQuery($con, "SELECT `$stockColumn` FROM `$partTable` WHERE id = $partId", $stockColumn, 0));
                        if (function_exists('recordPartStockTransaction')) {
                            $poRef = !empty($order['autocountPoNo']) ? $order['autocountPoNo'] : (!empty($order['internalRef']) ? $order['internalRef'] : "PO-$purchaseOrderId");
                            $supCode = !empty($order['supplierCode']) ? $order['supplierCode'] : null;
                            $supName = !empty($order['supplierName']) ? $order['supplierName'] : 'Supplier';
                            $woNote = !empty($order['workOrderId']) ? " · Linked to WO-{$order['workOrderId']}" : "";
                            recordPartStockTransaction($con, [
                                'part_id' => $partId,
                                'transaction_type' => 'po_receive',
                                'doc_type' => 'PO',
                                'doc_id' => $purchaseOrderId,
                                'doc_no' => $poRef,
                                'party_code' => $supCode,
                                'party_name' => $supName,
                                'quantity_change' => $delta,
                                'balance_after' => $newBalance,
                                'unit_cost' => floatval($item['unitCost'] ?? 0),
                                'notes' => "Received from PO $poRef · Supplier: $supName" . ($supCode ? " ($supCode)" : "") . $woNote,
                                'created_by' => $_SESSION['admin_id'] ?? null
                            ]);
                        }
                    }
                    if (!mysqli_query($con, "UPDATE purchase_order_item SET received_quantity = $newReceived WHERE id = $itemId AND purchase_order_id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                    if ($newReceived > 0) $anyReceived = true;
                    if ($newReceived < floatval($item['quantity'])) $allReceived = false;
                }
                $status = $allReceived ? 'received' : ($anyReceived ? 'partially_received' : 'ordered');
                $receivedAt = $allReceived ? 'NOW()' : 'NULL';
                if (!mysqli_query($con, "UPDATE purchase_order SET status = '$status', received_at = $receivedAt WHERE id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                if ($order['workOrderId'] && tableExists($con, 'job') && columnExists($con, 'job', 'parts_status')) {
                    $workOrderId = intval($order['workOrderId']);
                    $otherPending = intval(scalarQuery($con, "SELECT COUNT(*) AS total FROM purchase_order WHERE work_order_id = $workOrderId AND status NOT IN ('received', 'cancelled')", 'total', 0));
                    if ($allReceived && $otherPending === 0) {
                        $statusAdvance = (columnExists($con, 'job', 'status')) ? ", status = IF(status = 'pending_parts', 'parts_ready', status)" : "";
                        mysqli_query($con, "UPDATE job SET parts_status = 'parts_ready', parts_expected_date = NULL, parts_ready_at = COALESCE(parts_ready_at, NOW()), parts_status_updated_at = NOW(), parts_status_updated_by = " . intval($_SESSION['admin_id'] ?? 0) . " $statusAdvance WHERE id = $workOrderId");
                    } elseif ($anyReceived) {
                        mysqli_query($con, "UPDATE job SET parts_status = 'partially_arrived', parts_status_updated_at = NOW(), parts_status_updated_by = " . intval($_SESSION['admin_id'] ?? 0) . " WHERE id = $workOrderId");
                    }
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to receive Purchase Order: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'Received quantities and inventory updated.', purchaseOrderRecord($con, $purchaseOrderId));
            break;

        case 'admin-cancel-purchase-order':
            requirePurchaseOrderSchema($con);
            $purchaseOrderId = intval($inputData['id'] ?? 0);
            $order = purchaseOrderRecord($con, $purchaseOrderId);
            if (!$order || in_array($order['status'], ['received', 'cancelled'], true) || $order['status'] === 'partially_received') sendResponse(false, 'This Purchase Order cannot be cancelled.', null, 409);
            if ($order['syncStatus'] === 'synced') sendResponse(false, 'Cancel this Purchase Order in AutoCount and return the result through the sync program.', null, 409);
            if ($order['syncStatus'] === 'processing') sendResponse(false, 'Wait for the current AutoCount sync attempt to finish.', null, 409);
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE purchase_order SET status = 'cancelled', sync_status = 'not_queued', cancelled_at = NOW() WHERE id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                if (tableExists($con, 'autocount_purchase_order_sync_queue')) mysqli_query($con, "UPDATE autocount_purchase_order_sync_queue SET status = 'cancelled', completed_at = NOW(), locked_at = NULL WHERE purchase_order_id = $purchaseOrderId AND status IN ('pending', 'failed')");
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to cancel Purchase Order: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'Purchase Order cancelled.', purchaseOrderRecord($con, $purchaseOrderId));
            break;

        case 'sync-pull-autocount-purchase-order':
            requireAutoCountSyncToken();
            if (!tableExists($con, 'autocount_purchase_order_sync_queue')) sendResponse(false, 'Apply migration 025_purchase_orders.sql.', null, 409);
            mysqli_query($con, "UPDATE autocount_purchase_order_sync_queue SET status = 'pending', locked_at = NULL WHERE status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
            mysqli_begin_transaction($con);
            $queueResult = mysqli_query($con, "SELECT * FROM autocount_purchase_order_sync_queue WHERE status = 'pending' ORDER BY created_at, id LIMIT 1 FOR UPDATE");
            $queue = $queueResult ? mysqli_fetch_assoc($queueResult) : null;
            if (!$queue) {
                mysqli_commit($con);
                sendResponse(true, 'No queued AutoCount Purchase Orders.', null);
            }
            $queueId = intval($queue['id']);
            $purchaseOrderId = intval($queue['purchase_order_id']);
            if (!mysqli_query($con, "UPDATE autocount_purchase_order_sync_queue SET status = 'processing', attempt_count = attempt_count + 1, locked_at = NOW() WHERE id = $queueId")) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to lock Purchase Order sync item.', null, 500);
            }
            mysqli_query($con, "UPDATE purchase_order SET sync_status = 'processing', sync_error = NULL WHERE id = $purchaseOrderId");
            mysqli_commit($con);
            $payload = autoCountPurchaseOrderSyncPayload($con, $purchaseOrderId);
            if (!$payload) sendResponse(false, 'Queued Purchase Order is unavailable.', null, 409);
            sendResponse(true, 'AutoCount Purchase Order ready.', ['queueId' => $queueId, 'operation' => $queue['operation'], 'purchaseOrder' => $payload]);
            break;

        case 'sync-ack-autocount-purchase-order':
            requireAutoCountSyncToken();
            $queueId = intval($inputData['queueId'] ?? 0);
            $success = filter_var($inputData['success'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $queueResult = mysqli_query($con, "SELECT * FROM autocount_purchase_order_sync_queue WHERE id = $queueId LIMIT 1");
            $queue = $queueResult ? mysqli_fetch_assoc($queueResult) : null;
            if (!$queue) sendResponse(false, 'Purchase Order sync queue item not found.', null, 404);
            $purchaseOrderId = intval($queue['purchase_order_id']);
            $responseJson = mysqli_real_escape_string($con, json_encode($inputData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            if (!$success) {
                $message = substr(trim(strval($inputData['error'] ?? 'AutoCount rejected the Purchase Order.')), 0, 5000);
                $errorSql = mysqli_real_escape_string($con, $message);
                mysqli_query($con, "UPDATE autocount_purchase_order_sync_queue SET status = 'failed', error_message = '$errorSql', response_payload = '$responseJson', locked_at = NULL WHERE id = $queueId");
                mysqli_query($con, "UPDATE purchase_order SET sync_status = 'failed', sync_error = '$errorSql' WHERE id = $purchaseOrderId");
                sendResponse(true, 'Purchase Order sync failure recorded.', ['purchaseOrderId' => $purchaseOrderId]);
            }
            $poNoValue = strtoupper(trim(strval($inputData['autocountPoNo'] ?? '')));
            if ($poNoValue === '' || strlen($poNoValue) > 60) sendResponse(false, 'AutoCount Purchase Order No. is required.', null, 400);
            $poNo = mysqli_real_escape_string($con, $poNoValue);
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE purchase_order SET autocount_po_no = '$poNo', status = CASE WHEN status IN ('partially_received', 'received') THEN status ELSE 'ordered' END, sync_status = 'synced', synced_at = NOW(), ordered_at = COALESCE(ordered_at, NOW()), sync_error = NULL WHERE id = $purchaseOrderId")) throw new Exception(mysqli_error($con), 500);
                if (!mysqli_query($con, "UPDATE autocount_purchase_order_sync_queue SET status = 'succeeded', completed_at = NOW(), locked_at = NULL, error_message = NULL, response_payload = '$responseJson' WHERE id = $queueId")) throw new Exception(mysqli_error($con), 500);
                mysqli_query($con, "UPDATE job j JOIN purchase_order po ON po.work_order_id = j.id SET j.parts_reference = '$poNo' WHERE po.id = $purchaseOrderId");
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to record AutoCount Purchase Order result: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'AutoCount Purchase Order sync completed.', purchaseOrderRecord($con, $purchaseOrderId));
            break;

        default:
            sendResponse(false, "Unsupported purchase order action: $mode", null, 400);
            break;
    }
}

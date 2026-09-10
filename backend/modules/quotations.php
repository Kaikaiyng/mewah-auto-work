<?php
/**
 * Quotation Domain Module
 *
 * Handles work order quotations: calculations, revisions, schema requirements,
 * customer approval/rejection, and admin quotation routes.
 */

function requireQuotationSchema($con) {
    if (!tableExists($con, 'work_order_quotation') || !tableExists($con, 'work_order_quotation_item')) {
        sendResponse(false, 'Quotation storage is unavailable. Apply migration 015_work_order_quotations.sql.', null, 409);
    }
}

function workOrderQuotation($con, $workOrderId) {
    if (!tableExists($con, 'work_order_quotation') || !tableExists($con, 'work_order_quotation_item')) return null;
    $workOrderId = intval($workOrderId);
    $result = mysqli_query($con, "SELECT * FROM work_order_quotation WHERE work_order_id = $workOrderId LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;

    // Resolve debtor code from work order / company
    $debtorCode = '';
    $jobRes = mysqli_query($con, "SELECT j.company_id, j.customer_id, comp.name AS company_name, comp.autocount_debtor_code FROM job j LEFT JOIN company comp ON comp.id = j.company_id WHERE j.id = $workOrderId LIMIT 1");
    if ($jobRes && ($jobRow = mysqli_fetch_assoc($jobRes))) {
        $debtorCode = trim(strval($jobRow['autocount_debtor_code'] ?? ''));
        if ($debtorCode === '') {
            $debtorCode = resolveCompanyDebtorCode($con, $jobRow['company_id'] ?? 0, $jobRow['company_name'] ?? '', $jobRow['customer_id'] ?? 0);
        }
    }

    if (!$row) {
        return [
            'id' => 0,
            'workOrderId' => $workOrderId,
            'debtorCode' => $debtorCode,
            'items' => []
        ];
    }
    $quotationId = intval($row['id']);
    $quoteStatus = $row['status'];

    // Check if the work order lifecycle has already passed quotation approval
    $jobLifecycleRes = mysqli_query($con, "SELECT status, approved_at, under_repair_at, completed_at, collected_at FROM job WHERE id = $workOrderId LIMIT 1");
    if ($jobLifecycleRes && ($jobLifecycle = mysqli_fetch_assoc($jobLifecycleRes))) {
        $canonical = deriveCanonicalStatus($jobLifecycle);
        if (in_array($canonical, ['approved', 'parts_ready', 'under_repair', 'ready_for_collection', 'collected'], true) || !empty($jobLifecycle['approved_at'])) {
            if ($quoteStatus !== 'approved') {
                $quoteStatus = 'approved';
                mysqli_query($con, "UPDATE work_order_quotation SET status = 'approved', approved_at = COALESCE(approved_at, NOW()), updated_at = NOW() WHERE id = $quotationId");
            }
        }
    }

    $items = [];
    $itemResult = mysqli_query($con, "SELECT * FROM work_order_quotation_item WHERE quotation_id = $quotationId ORDER BY sort_order, id");
    while ($itemResult && $item = mysqli_fetch_assoc($itemResult)) {
        $items[] = [
            'id' => intval($item['id']),
            'type' => $item['item_type'],
            'serviceTypeId' => array_key_exists('service_type_id', $item) && $item['service_type_id'] !== null
                ? intval($item['service_type_id'])
                : null,
            'code' => $item['item_code'] ?? '',
            'description' => $item['description'],
            'quantity' => floatval($item['quantity']),
            'unitPrice' => floatval($item['unit_price']),
            'taxCode' => $item['tax_code'] ?? '',
            'taxRate' => floatval($item['tax_rate'] ?? 0),
            'taxAmount' => floatval($item['tax_amount'] ?? 0),
            'amount' => floatval($item['amount'])
        ];
    }
    return [
        'id' => $quotationId,
        'workOrderId' => $workOrderId,
        'quotationNo' => $row['quotation_no'] ?? '',
        'debtorCode' => $debtorCode,
        'revision' => intval($row['revision']),
        'status' => $quoteStatus,
        'validUntil' => $row['valid_until'],
        'subtotal' => floatval($row['subtotal']),
        'discount' => floatval($row['discount']),
        'taxRate' => floatval($row['tax_rate']),
        'taxAmount' => floatval($row['tax_amount']),
        'total' => floatval($row['total']),
        'notes' => $row['notes'] ?? '',
        'terms' => $row['terms'] ?? '',
        'customerResponseNote' => $row['customer_response_note'] ?? '',
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'issuedAt' => $row['issued_at'],
        'approvedAt' => $row['approved_at'],
        'rejectedAt' => $row['rejected_at'],
        'items' => $items
    ];
}

function syncQuotationFromWorkOrderParts($con, $workOrderId) {
    $workOrderId = intval($workOrderId);
    if ($workOrderId <= 0 || !tableExists($con, 'work_order_quotation') || !tableExists($con, 'work_order_quotation_item')) return;
    $quotation = workOrderQuotation($con, $workOrderId);
    if (!$quotation) {
        $settings = systemSettingsPayload($con);
        $taxRate = floatval($settings['pricing']['taxRate'] ?? 0);
        $adminId = intval($_SESSION['admin_id'] ?? 0);
        $terms = mysqli_real_escape_string($con, $settings['documents']['defaultTerms'] ?? '');
        $validUntil = date('Y-m-d', strtotime('+14 days'));
        
        $insertQuoteSql = "INSERT INTO work_order_quotation
            (work_order_id, status, valid_until, subtotal, discount, tax_rate, tax_amount, total, notes, terms, created_by)
            VALUES ($workOrderId, 'draft', '$validUntil', 0, 0, $taxRate, 0, 0, '', '$terms', $adminId)";
        if (mysqli_query($con, $insertQuoteSql)) {
            $quotationId = intval(mysqli_insert_id($con));
            $quotationNo = sprintf('QT-%s-%06d', date('Y'), $quotationId);
            mysqli_query($con, "UPDATE work_order_quotation SET quotation_no = '$quotationNo' WHERE id = $quotationId");
            $quotation = workOrderQuotation($con, $workOrderId);
        }
    }
    if (!$quotation) return;
    $quotationId = intval($quotation['id']);
    
    // Preserve any existing non-part items (e.g. labour, diagnostics) and negotiated prices
    $nonPartItems = [];
    $existingPartPrices = [];
    foreach ($quotation['items'] as $item) {
        if ($item['type'] !== 'part') {
            $nonPartItems[] = $item;
        } else {
            $c = strtoupper(trim(strval($item['code'] ?? '')));
            if ($c !== '' && floatval($item['unitPrice'] ?? 0) > 0) {
                $existingPartPrices[$c] = floatval($item['unitPrice']);
            }
        }
    }
    
    // Load fresh parts requirement
    $parts = workOrderPartRequirements($con, $workOrderId);
    $allNewItems = [];
    foreach ($parts as $p) {
        $cleanCode = strtoupper(trim(strval($p['code'] ?? '')));
        $unitPrice = floatval($p['unitPrice'] ?? 0);
        if ($unitPrice <= 0 && $cleanCode !== '' && isset($existingPartPrices[$cleanCode])) {
            $unitPrice = $existingPartPrices[$cleanCode];
        }
        $allNewItems[] = [
            'type' => 'part',
            'code' => $p['code'] ?? '',
            'description' => $p['description'] ?? '',
            'quantity' => floatval($p['quantity'] ?? 1),
            'unitPrice' => $unitPrice,
            'serviceTypeId' => null,
        ];
    }
    foreach ($nonPartItems as $np) {
        $allNewItems[] = $np;
    }
    
    // Recalculate totals
    $subtotal = 0;
    $taxAmount = 0;
    $hasTaxColumns = columnExists($con, 'work_order_quotation_item', 'tax_code');
    foreach ($allNewItems as &$it) {
        $amount = round($it['quantity'] * $it['unitPrice'], 2);
        $it['amount'] = $amount;
        $subtotal += $amount;
        $isLabour = ($it['type'] ?? '') === 'labour';
        $itTaxRate = isset($it['taxRate']) ? floatval($it['taxRate']) : ($isLabour ? 8.0 : 0.0);
        $itTaxAmount = round($amount * $itTaxRate / 100, 2);
        $it['taxCode'] = $it['taxCode'] ?? ($isLabour ? 'SV-8' : '');
        $it['taxRate'] = $itTaxRate;
        $it['taxAmount'] = $itTaxAmount;
        $taxAmount += $itTaxAmount;
    }
    unset($it);
    $discount = min(max(floatval($quotation['discount'] ?? 0), 0), $subtotal);
    $taxRates = array_values(array_unique(array_map(function ($item) { return floatval($item['taxRate']); }, $allNewItems)));
    $taxRate = count($taxRates) === 1 ? floatval($taxRates[0]) : 0;
    $taxable = $subtotal - $discount;
    $total = $taxable + $taxAmount;
    
    mysqli_query($con, "UPDATE work_order_quotation SET subtotal = $subtotal, discount = $discount, tax_rate = $taxRate, tax_amount = $taxAmount, total = $total, updated_at = NOW() WHERE id = $quotationId");
    mysqli_query($con, "DELETE FROM work_order_quotation_item WHERE quotation_id = $quotationId");
    
    $hasServiceTypeColumn = columnExists($con, 'work_order_quotation_item', 'service_type_id');
    foreach ($allNewItems as $sortOrder => $item) {
        $type = mysqli_real_escape_string($con, $item['type']);
        $serviceTypeIdSql = !empty($item['serviceTypeId']) ? intval($item['serviceTypeId']) : 'NULL';
        $code = mysqli_real_escape_string($con, $item['code']);
        $description = mysqli_real_escape_string($con, $item['description']);
        $serviceTypeColumn = $hasServiceTypeColumn ? ', service_type_id' : '';
        $serviceTypeValue = $hasServiceTypeColumn ? ", $serviceTypeIdSql" : '';
        $taxColumns = $hasTaxColumns ? ', tax_code, tax_rate, tax_amount' : '';
        $taxCodeEsc = $hasTaxColumns ? mysqli_real_escape_string($con, $item['taxCode'] ?? '') : '';
        $taxRateVal = $hasTaxColumns ? floatval($item['taxRate'] ?? 0) : 0;
        $taxAmountVal = $hasTaxColumns ? floatval($item['taxAmount'] ?? 0) : 0;
        $taxValues = $hasTaxColumns ? ", '$taxCodeEsc', $taxRateVal, $taxAmountVal" : '';
        $itemSql = "INSERT INTO work_order_quotation_item
            (quotation_id, item_type$serviceTypeColumn, item_code, description, quantity, unit_price, amount$taxColumns, sort_order)
            VALUES ($quotationId, '$type'$serviceTypeValue, '$code', '$description', {$item['quantity']}, {$item['unitPrice']}, {$item['amount']}$taxValues, " . intval($sortOrder) . ")";
        mysqli_query($con, $itemSql);
    }
}

function syncQuotationPartsToWorkOrderRequirement($con, $workOrderId, $partItems, $adminId = 0) {
    $workOrderId = intval($workOrderId);
    if ($workOrderId <= 0 || !tableExists($con, 'work_order_part_requirement')) return;

    $existing = [];
    $res = mysqli_query($con, "SELECT * FROM work_order_part_requirement WHERE work_order_id = $workOrderId");
    while ($res && $row = mysqli_fetch_assoc($res)) {
        $c = strtoupper(trim(strval($row['item_code'] ?? '')));
        $d = strtoupper(trim(strval($row['description'] ?? '')));
        if ($c !== '') $existing['C:' . $c] = $row;
        if ($d !== '') $existing['D:' . $d] = $row;
    }

    $partTable = tableExists($con, 'part') ? 'part' : (tableExists($con, 'parts') ? 'parts' : null);

    $normalized = [];
    foreach ($partItems as $index => $item) {
        $code = trim(strval($item['code'] ?? ''));
        $desc = trim(strval($item['description'] ?? ''));
        $qty = floatval($item['quantity'] ?? 1);
        $unitPrice = floatval($item['unitPrice'] ?? 0);
        $upperCode = strtoupper($code);
        $upperDesc = strtoupper($desc);

        $partId = null;
        $uom = 'UNIT';

        if ($upperCode !== '' && isset($existing['C:' . $upperCode])) {
            $partId = $existing['C:' . $upperCode]['part_id'] ? intval($existing['C:' . $upperCode]['part_id']) : null;
            $uom = $existing['C:' . $upperCode]['uom'] ?? 'UNIT';
        } elseif ($upperDesc !== '' && isset($existing['D:' . $upperDesc])) {
            $partId = $existing['D:' . $upperDesc]['part_id'] ? intval($existing['D:' . $upperDesc]['part_id']) : null;
            $uom = $existing['D:' . $upperDesc]['uom'] ?? 'UNIT';
        } elseif ($partTable && $code !== '') {
            $cEsc = mysqli_real_escape_string($con, $code);
            $pRes = mysqli_query($con, "SELECT id, uom, Unit FROM $partTable WHERE (item_code = '$cEsc' OR sku = '$cEsc' OR part_number = '$cEsc') LIMIT 1");
            if ($pRes && ($pRow = mysqli_fetch_assoc($pRes))) {
                $partId = intval($pRow['id']);
                $uom = $pRow['uom'] ?? ($pRow['Unit'] ?? 'UNIT');
            }
        }

        $normalized[] = [
            'partId' => $partId,
            'code' => $code,
            'description' => $desc !== '' ? $desc : ($code !== '' ? $code : 'Part Item'),
            'uom' => $uom,
            'quantity' => $qty,
            'unitPrice' => $unitPrice,
            'sortOrder' => $index,
        ];
    }

    mysqli_query($con, "DELETE FROM work_order_part_requirement WHERE work_order_id = $workOrderId");
    foreach ($normalized as $r) {
        $pIdSql = $r['partId'] ? intval($r['partId']) : 'NULL';
        $cEsc = mysqli_real_escape_string($con, $r['code']);
        $dEsc = mysqli_real_escape_string($con, $r['description']);
        $uEsc = mysqli_real_escape_string($con, $r['uom']);
        $admSql = $adminId > 0 ? intval($adminId) : 'NULL';
        mysqli_query($con, "INSERT INTO work_order_part_requirement 
            (work_order_id, part_id, item_code, description, uom, required_quantity, unit_price, sort_order, created_by)
            VALUES ($workOrderId, $pIdSql, '$cEsc', '$dEsc', '$uEsc', {$r['quantity']}, {$r['unitPrice']}, {$r['sortOrder']}, $admSql)");
    }
}

function normalizeQuotationPayload($con, $inputData) {
    $rawItems = $inputData['items'] ?? [];
    if (!is_array($rawItems) || count($rawItems) < 1 || count($rawItems) > 100) {
        sendResponse(false, 'Quotation must contain between 1 and 100 items.', null, 400);
    }
    $items = [];
    $subtotal = 0.0;
    foreach ($rawItems as $index => $rawItem) {
        $type = strtolower(trim(strval($rawItem['type'] ?? 'part')));
        if (!in_array($type, ['part', 'labour', 'other'], true)) {
            sendResponse(false, 'Invalid item type on line ' . ($index + 1) . '.', null, 400);
        }
        $serviceTypeId = $type === 'labour' ? intval($rawItem['serviceTypeId'] ?? 0) : 0;
        $itemCode = substr(trim(strval($rawItem['code'] ?? '')), 0, 80);
        if ($type === 'labour' && $serviceTypeId <= 0 && $itemCode === '') {
            $itemCode = 'LABOUR';
        }
        if ($serviceTypeId > 0) {
            if (!tableExists($con, 'service_type')) {
                sendResponse(false, 'Service Types are unavailable. Apply migration 016_system_settings.sql.', null, 409);
            }
            if (!columnExists($con, 'work_order_quotation_item', 'service_type_id')) {
                sendResponse(false, 'Quotation Service Type linkage is unavailable. Apply migration 017_quotation_service_types.sql.', null, 409);
            }
            $serviceResult = mysqli_query($con, "SELECT id FROM service_type WHERE id = $serviceTypeId AND is_enabled = 1 LIMIT 1");
            if (!$serviceResult || !mysqli_fetch_assoc($serviceResult)) {
                sendResponse(false, 'Please select an enabled Service Type on line ' . ($index + 1) . '.', null, 400);
            }
        }
        $description = trim(strval($rawItem['description'] ?? ''));
        if ($description === '') {
            $description = $itemCode !== '' ? $itemCode : 'Item';
        }
        $quantity = round(floatval($rawItem['quantity'] ?? 0), 2);
        $unitPrice = round(floatval($rawItem['unitPrice'] ?? 0), 2);
        if ($quantity <= 0 || $quantity > 99999999 || $unitPrice < 0 || $unitPrice > 9999999999) {
            sendResponse(false, 'Invalid quantity or unit price on line ' . ($index + 1) . '.', null, 400);
        }
        $amount = round($quantity * $unitPrice, 2);
        $subtotal = round($subtotal + $amount, 2);
        $taxRate = isset($rawItem['taxRate']) ? round(floatval($rawItem['taxRate']), 2) : ($type === 'labour' ? 8.0 : 0.0);
        if ($taxRate < 0 || $taxRate > 100) {
            sendResponse(false, 'Tax rate must be between 0% and 100% on line ' . ($index + 1) . '.', null, 400);
        }
        $taxAmount = round($amount * $taxRate / 100, 2);
        $taxCode = substr(trim(strval($rawItem['taxCode'] ?? ($taxRate > 0 ? 'SV-8' : ''))), 0, 30);
        $items[] = [
            'type' => $type,
            'serviceTypeId' => $serviceTypeId > 0 ? $serviceTypeId : null,
            'code' => $itemCode,
            'description' => substr($description, 0, 5000),
            'quantity' => $quantity,
            'unitPrice' => $unitPrice,
            'taxCode' => $taxCode,
            'taxRate' => $taxRate,
            'taxAmount' => $taxAmount,
            'amount' => $amount
        ];
    }
    $discount = round(floatval($inputData['discount'] ?? 0), 2);
    if ($discount < 0 || $discount > $subtotal) {
        sendResponse(false, 'Discount must be between RM 0.00 and the quotation subtotal.', null, 400);
    }
    $validUntil = trim(strval($inputData['validUntil'] ?? ''));
    if ($validUntil !== '') {
        $validDate = DateTime::createFromFormat('Y-m-d', $validUntil);
        if (!$validDate || $validDate->format('Y-m-d') !== $validUntil) {
            sendResponse(false, 'Valid until must be a valid date.', null, 400);
        }
    }
    $taxAmount = round(array_sum(array_column($items, 'taxAmount')), 2);
    $taxRates = array_values(array_unique(array_map(function ($item) { return floatval($item['taxRate']); }, $items)));
    $taxRate = count($taxRates) === 1 ? floatval($taxRates[0]) : (isset($inputData['taxRate']) && count($items) === 0 ? floatval($inputData['taxRate']) : 0);
    $taxableAmount = round($subtotal - $discount, 2);
    return [
        'items' => $items,
        'validUntil' => $validUntil,
        'subtotal' => $subtotal,
        'discount' => $discount,
        'taxRate' => $taxRate,
        'taxAmount' => $taxAmount,
        'total' => round($taxableAmount + $taxAmount, 2),
        'notes' => substr(trim(strval($inputData['notes'] ?? '')), 0, 5000),
        'terms' => substr(trim(strval($inputData['terms'] ?? '')), 0, 5000)
    ];
}

function quotationCustomerAccess($con, $auth, $workOrderId) {
    $workOrderId = intval($workOrderId);
    $companyId = intval($auth['companyId']);
    $where = !empty($auth['isSuperadmin']) ? '' : " AND company_id = $companyId";
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    $where .= customerScopedVehicleSql($vehicleScope, 'vehicle_id');
    $result = mysqli_query($con, "SELECT * FROM job WHERE id = $workOrderId$where LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row) sendResponse(false, 'Work order not found or unavailable to this account.', null, 404);
    return $row;
}

/**
 * Quotation route dispatcher
 */
function handleQuotationRoute($con, $mode, $inputData) {
    switch ($mode) {
        case 'admin-get-work-order-quotation':
            requireQuotationSchema($con);
            $jobId = intval($_GET['id'] ?? $inputData['id'] ?? 0);
            if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
            if (countRows($con, 'job', "id = $jobId") < 1) sendResponse(false, 'Work order not found.', null, 404);
            sendResponse(true, 'Quotation retrieved.', workOrderQuotation($con, $jobId));
            break;

        case 'admin-save-work-order-quotation':
            requireQuotationSchema($con);
            $jobId = intval($inputData['workOrderId'] ?? 0);
            if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
            $jobResult = mysqli_query($con, "SELECT * FROM job WHERE id = $jobId LIMIT 1");
            $jobRow = $jobResult ? mysqli_fetch_assoc($jobResult) : null;
            if (!$jobRow) sendResponse(false, 'Work order not found.', null, 404);
            $existing = workOrderQuotation($con, $jobId);
            if ($existing && !empty($existing['status']) && $existing['status'] === 'approved') {
                sendResponse(false, 'This quotation is already approved and locked. Modifications are not permitted.', null, 409);
            }
            $currentStage = deriveCanonicalStatus($jobRow);
            $editableStages = ['scheduled', 'checked_in', 'inspected', 'quotation_issued'];
            if (!in_array($currentStage, $editableStages, true)) {
                sendResponse(false, 'Quotation can only be prepared or modified prior to repair approval.', null, 409);
            }
            $quote = normalizeQuotationPayload($con, $inputData);
            $debtorCode = strtoupper(trim(strval($inputData['debtorCode'] ?? '')));
            if ($debtorCode !== '' && intval($jobRow['company_id'] ?? 0) > 0 && tableExists($con, 'company') && columnExists($con, 'company', 'autocount_debtor_code')) {
                $companyId = intval($jobRow['company_id']);
                $debtorCodeEsc = mysqli_real_escape_string($con, $debtorCode);
                mysqli_query($con, "UPDATE company SET autocount_debtor_code = '$debtorCodeEsc' WHERE id = $companyId");
            }
            $validUntilSql = $quote['validUntil'] === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $quote['validUntil']) . "'";
            $notes = mysqli_real_escape_string($con, $quote['notes']);
            $terms = mysqli_real_escape_string($con, $quote['terms']);
            $adminId = intval($_SESSION['admin_id'] ?? 0);
            mysqli_begin_transaction($con);
            try {
                if (!empty($existing['id'])) {
                    $quotationId = intval($existing['id']);
                    $nextStatus = $existing['status'] === 'rejected' ? 'draft' : $existing['status'];
                    $revisionSql = $existing['status'] === 'rejected' ? 'revision = revision + 1,' : '';
                    $updateQuoteSql = "UPDATE work_order_quotation SET
                        $revisionSql status = '$nextStatus', valid_until = $validUntilSql,
                        subtotal = {$quote['subtotal']}, discount = {$quote['discount']},
                        tax_rate = {$quote['taxRate']}, tax_amount = {$quote['taxAmount']}, total = {$quote['total']},
                        notes = '$notes', terms = '$terms', updated_at = NOW()
                        WHERE id = $quotationId";
                    if (!mysqli_query($con, $updateQuoteSql)) throw new Exception(mysqli_error($con), 500);
                    if (!mysqli_query($con, "DELETE FROM work_order_quotation_item WHERE quotation_id = $quotationId")) {
                        throw new Exception(mysqli_error($con), 500);
                    }
                } else {
                    $insertQuoteSql = "INSERT INTO work_order_quotation
                        (work_order_id, status, valid_until, subtotal, discount, tax_rate, tax_amount, total, notes, terms, created_by)
                        VALUES ($jobId, 'draft', $validUntilSql, {$quote['subtotal']}, {$quote['discount']}, {$quote['taxRate']}, {$quote['taxAmount']}, {$quote['total']}, '$notes', '$terms', $adminId)";
                    if (!mysqli_query($con, $insertQuoteSql)) throw new Exception(mysqli_error($con), 500);
                    $quotationId = intval(mysqli_insert_id($con));
                    $quotationNo = sprintf('QT-%s-%06d', date('Y'), $quotationId);
                    if (!mysqli_query($con, "UPDATE work_order_quotation SET quotation_no = '$quotationNo' WHERE id = $quotationId")) {
                        throw new Exception(mysqli_error($con), 500);
                    }
                }
                $hasTaxColumns = columnExists($con, 'work_order_quotation_item', 'tax_code');
                foreach ($quote['items'] as $sortOrder => $item) {
                    $type = mysqli_real_escape_string($con, $item['type']);
                    $serviceTypeIdSql = !empty($item['serviceTypeId']) ? intval($item['serviceTypeId']) : 'NULL';
                    $code = mysqli_real_escape_string($con, $item['code']);
                    $description = mysqli_real_escape_string($con, $item['description']);
                    $hasServiceTypeColumn = columnExists($con, 'work_order_quotation_item', 'service_type_id');
                    $serviceTypeColumn = $hasServiceTypeColumn ? ', service_type_id' : '';
                    $serviceTypeValue = $hasServiceTypeColumn ? ", $serviceTypeIdSql" : '';
                    $taxColumns = $hasTaxColumns ? ', tax_code, tax_rate, tax_amount' : '';
                    $taxCodeEsc = $hasTaxColumns ? mysqli_real_escape_string($con, $item['taxCode'] ?? '') : '';
                    $taxRateVal = $hasTaxColumns ? floatval($item['taxRate'] ?? 0) : 0;
                    $taxAmountVal = $hasTaxColumns ? floatval($item['taxAmount'] ?? 0) : 0;
                    $taxValues = $hasTaxColumns ? ", '$taxCodeEsc', $taxRateVal, $taxAmountVal" : '';
                    $itemSql = "INSERT INTO work_order_quotation_item
                        (quotation_id, item_type$serviceTypeColumn, item_code, description, quantity, unit_price, amount$taxColumns, sort_order)
                        VALUES ($quotationId, '$type'$serviceTypeValue, '$code', '$description', {$item['quantity']}, {$item['unitPrice']}, {$item['amount']}$taxValues, " . intval($sortOrder) . ")";
                    if (!mysqli_query($con, $itemSql)) throw new Exception(mysqli_error($con), 500);
                }
                if (tableExists($con, 'work_order_part_requirement')) {
                    $partItems = array_values(array_filter($quote['items'], function($it) {
                        return ($it['type'] ?? '') === 'part';
                    }));
                    syncQuotationPartsToWorkOrderRequirement($con, $jobId, $partItems, $adminId);
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to save quotation: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'Quotation saved.', workOrderQuotation($con, $jobId));
            break;

        case 'admin-issue-work-order-quotation':
            requireQuotationSchema($con);
            if (!columnExists($con, 'job', 'quotation_issued_at')) {
                sendResponse(false, 'Apply migration 014_work_order_quotation_stage.sql before issuing quotations.', null, 409);
            }
            $jobId = intval($inputData['workOrderId'] ?? 0);
            $jobResult = mysqli_query($con, "SELECT * FROM job WHERE id = $jobId LIMIT 1");
            $jobRow = $jobResult ? mysqli_fetch_assoc($jobResult) : null;
            if (!$jobRow) sendResponse(false, 'Work order not found.', null, 404);
            $currentStage = deriveCanonicalStatus($jobRow);
            if (!in_array($currentStage, ['inspected', 'quotation_issued', 'approved', 'parts_ready', 'under_repair'], true)) {
                sendResponse(false, 'Quotation can only be issued after inspection.', null, 409);
            }
            $quotation = workOrderQuotation($con, $jobId);
            if (empty($quotation['id']) || empty($quotation['items'])) sendResponse(false, 'Save at least one quotation item before issuing.', null, 409);
            $quotationId = intval($quotation['id']);
            $revisionSql = in_array($quotation['status'], ['approved', 'rejected'], true) ? 'revision = revision + 1,' : '';
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE work_order_quotation SET $revisionSql status = 'issued', issued_at = NOW(), approved_at = NULL, rejected_at = NULL, customer_response_note = NULL, updated_at = NOW() WHERE id = $quotationId")) {
                    throw new Exception(mysqli_error($con), 500);
                }
                if (in_array($currentStage, ['inspected', 'quotation_issued'], true)) {
                    if (!mysqli_query($con, "UPDATE job SET status = 3, quotation_issued_at = COALESCE(quotation_issued_at, NOW()), approved_at = NULL WHERE id = $jobId")) {
                        throw new Exception(mysqli_error($con), 500);
                    }
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to issue quotation: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            $workOrderNo = rowValue($jobRow, ['work_order_no'], 'WO-' . $jobId);
            $sourceBookingId = intval($jobRow['source_booking_id'] ?? 0);
            $issuedQuote = workOrderQuotation($con, $jobId);
            $quotationNo = $issuedQuote['quotationNo'] ?: 'quotation';
            if ($sourceBookingId > 0) {
                notifyBookingCustomer($con, $sourceBookingId, 'Quotation ready for review', "$quotationNo for $workOrderNo is ready. Please review and respond.");
            } else {
                $contactId = intval($jobRow['customer_id'] ?? 0);
                if ($contactId > 0) notifyVehicleCustomer(
                    $con, intval($jobRow['vehicle_id'] ?? 0), tableExists($con, 'customer') ? 'customer' : 'users', intval($jobRow['company_id'] ?? 0), $contactId,
                    'Quotation ready for review', "$quotationNo for $workOrderNo is ready. Please review and respond.",
                    'work_order', 'work_order', 'wo' . $jobId, '/repair-progress/wo' . $jobId
                );
            }
            sendResponse(true, 'Quotation issued to customer.', $issuedQuote);
            break;

        case 'admin-approve-work-order-quotation':
            requireQuotationSchema($con);
            $jobId = intval($inputData['workOrderId'] ?? 0);
            if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
            $jobResult = mysqli_query($con, "SELECT * FROM job WHERE id = $jobId LIMIT 1");
            $jobRow = $jobResult ? mysqli_fetch_assoc($jobResult) : null;
            if (!$jobRow) sendResponse(false, 'Work order not found.', null, 404);
            $currentStage = deriveCanonicalStatus($jobRow);
            if (!in_array($currentStage, ['inspected', 'quotation_issued', 'approved', 'parts_ready', 'under_repair'], true)) {
                sendResponse(false, 'Quotation can only be approved after inspection or during repair.', null, 409);
            }
            $quotation = workOrderQuotation($con, $jobId);
            if (empty($quotation['id']) || empty($quotation['items'])) {
                sendResponse(false, 'Quotation must have items before it can be approved.', null, 409);
            }
            if (!empty($quotation['status']) && $quotation['status'] === 'approved') {
                sendResponse(false, 'This quotation has already been approved.', null, 409);
            }
            $quotationId = intval($quotation['id']);
            $adminId = intval($_SESSION['admin_id'] ?? 0);
            $adminRole = currentAdminRoleName($con);
            $note = mysqli_real_escape_string($con, "Internally approved by $adminRole on " . date('Y-m-d H:i'));
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE work_order_quotation SET status = 'approved', approved_at = NOW(), customer_response_note = '$note', updated_at = NOW() WHERE id = $quotationId")) {
                    throw new Exception(mysqli_error($con), 500);
                }
                saveWorkOrderAcknowledgedPartsSnapshot($con, $jobId);
                $adminCol = ($adminId > 0 ? $adminId : 'NULL');

                // Evaluate live parts status for auto-routing
                $overview = workOrderPartsOverview($con, $jobId);
                $isBackOrder = !empty($jobRow['is_back_order']);
                $autoPartsStatus = $isBackOrder ? 'parts_ready' : automaticPartsStatusFromOverview($overview);
                $hasShortage = (!$isBackOrder && in_array($autoPartsStatus, ['pending_parts', 'partially_arrived'], true));

                $bay = !empty($inputData['bay']) ? trim(strval($inputData['bay'])) : (!empty($jobRow['bay']) ? $jobRow['bay'] : null);
                $estimatedOut = !empty($inputData['estimatedOut']) ? trim(strval($inputData['estimatedOut'])) : (!empty($jobRow['estimated_out']) ? $jobRow['estimated_out'] : null);

                if (!$hasShortage) {
                    // All parts in stock or pure labour -> Direct to Under Repair!
                    if (empty($bay)) {
                        sendResponse(false, 'Workshop Bay allocation is required before starting repair.', null, 400);
                    }
                    if (empty($estimatedOut)) {
                        sendResponse(false, 'Expected Handover (ETA) is required before starting repair.', null, 400);
                    }
                    $baySql = "'" . mysqli_real_escape_string($con, $bay) . "'";
                    $estimatedOutSql = "'" . mysqli_real_escape_string($con, $estimatedOut) . "'";
                    $hasBayCol = columnExists($con, 'job', 'bay');
                    $hasEtaCol = columnExists($con, 'job', 'estimated_out');
                    $bayUpdateSql = $hasBayCol ? ", bay = $baySql" : "";
                    $etaUpdateSql = $hasEtaCol ? ", estimated_out = $estimatedOutSql" : "";

                    $jobStatusSql = "UPDATE job SET
                        status = 6,
                        checkin_at = COALESCE(checkin_at, NOW()),
                        inspected_at = COALESCE(inspected_at, NOW()),
                        quotation_issued_at = COALESCE(quotation_issued_at, NOW()),
                        approved_at = COALESCE(approved_at, NOW()),
                        parts_ready_at = COALESCE(parts_ready_at, NOW()),
                        under_repair_at = COALESCE(under_repair_at, NOW()),
                        parts_status = '$autoPartsStatus',
                        parts_status_updated_at = NOW(),
                        parts_status_updated_by = $adminCol,
                        parts_acknowledged_at = NOW(),
                        parts_acknowledged_by = $adminCol
                        $bayUpdateSql
                        $etaUpdateSql
                        WHERE id = $jobId";
                } else {
                    // Shortage detected -> Advance to Pending Parts (waiting for procurement)
                    $baySql = $bay ? "'" . mysqli_real_escape_string($con, $bay) . "'" : 'NULL';
                    $estimatedOutSql = $estimatedOut ? "'" . mysqli_real_escape_string($con, $estimatedOut) . "'" : 'NULL';
                    $hasBayCol = columnExists($con, 'job', 'bay');
                    $hasEtaCol = columnExists($con, 'job', 'estimated_out');
                    $bayUpdateSql = $hasBayCol && $bay ? ", bay = COALESCE(bay, $baySql)" : "";
                    $etaUpdateSql = $hasEtaCol && $estimatedOut ? ", estimated_out = COALESCE(estimated_out, $estimatedOutSql)" : "";

                    $jobStatusSql = "UPDATE job SET
                        status = 5,
                        checkin_at = COALESCE(checkin_at, NOW()),
                        inspected_at = COALESCE(inspected_at, NOW()),
                        quotation_issued_at = COALESCE(quotation_issued_at, NOW()),
                        approved_at = COALESCE(approved_at, NOW()),
                        parts_ready_at = NULL,
                        under_repair_at = NULL,
                        parts_status = 'pending_parts',
                        parts_status_updated_at = NOW(),
                        parts_status_updated_by = $adminCol,
                        parts_acknowledged_at = NOW(),
                        parts_acknowledged_by = $adminCol
                        $bayUpdateSql
                        $etaUpdateSql
                        WHERE id = $jobId";
                }
                if (!mysqli_query($con, $jobStatusSql)) {
                    throw new Exception(mysqli_error($con), 500);
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to approve quotation: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'Quotation internally approved and repair authorized.', workOrderQuotation($con, $jobId));
            break;

        case 'customer-respond-quotation':
            requireQuotationSchema($con);
            if (!columnExists($con, 'job', 'quotation_issued_at')) {
                sendResponse(false, 'Quotation lifecycle storage is unavailable.', null, 409);
            }
            $auth = requireCustomerSession();
            $jobIdValue = strval($inputData['workOrderId'] ?? '');
            $jobId = intval(preg_replace('/\D+/', '', $jobIdValue));
            if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
            $jobRow = quotationCustomerAccess($con, $auth, $jobId);
            $quotation = workOrderQuotation($con, $jobId);
            if (!$quotation) sendResponse(false, 'Quotation not found.', null, 404);
            if ($quotation['status'] !== 'issued') sendResponse(false, 'This quotation is no longer awaiting a response.', null, 409);
            if (!empty($quotation['validUntil']) && $quotation['validUntil'] < date('Y-m-d')) {
                sendResponse(false, 'This quotation has expired. Please contact the workshop for a revised quotation.', null, 409);
            }
            $action = strtolower(trim(strval($inputData['action'] ?? '')));
            if (!in_array($action, ['accept', 'reject'], true)) sendResponse(false, 'Response must be accept or reject.', null, 400);
            $responseNote = substr(trim(strval($inputData['note'] ?? '')), 0, 1000);
            if ($action === 'reject' && $responseNote === '') {
                sendResponse(false, 'Please provide a reason for rejecting the quotation.', null, 400);
            }
            $quotationId = intval($quotation['id']);
            $responseNoteSql = mysqli_real_escape_string($con, $responseNote);
            mysqli_begin_transaction($con);
            try {
                if ($action === 'accept') {
                    if (!mysqli_query($con, "UPDATE work_order_quotation SET status = 'approved', customer_response_note = '$responseNoteSql', approved_at = NOW(), rejected_at = NULL, updated_at = NOW() WHERE id = $quotationId AND status = 'issued'")) {
                        throw new Exception(mysqli_error($con), 500);
                    }
                    $overview = workOrderPartsOverview($con, $jobId);
                    $isBackOrder = columnExists($con, 'job', 'is_back_order') && intval($jobRow['is_back_order'] ?? 0) === 1;
                    $autoPartsStatus = $isBackOrder ? 'parts_ready' : automaticPartsStatusFromOverview($overview);
                    $hasShortage = (!$isBackOrder && in_array($autoPartsStatus, ['pending_parts', 'partially_arrived'], true));

                    saveWorkOrderAcknowledgedPartsSnapshot($con, $jobId);
                    if (!$hasShortage) {
                        $nextJobStatus = 6;
                        $partsApprovalSql = columnExists($con, 'job', 'parts_status')
                            ? ", parts_status = '$autoPartsStatus', parts_expected_date = NULL, parts_reference = NULL, parts_notes = NULL, parts_status_updated_at = NOW(), parts_status_updated_by = NULL, parts_acknowledged_at = NOW(), parts_ready_at = COALESCE(parts_ready_at, NOW()), under_repair_at = COALESCE(under_repair_at, NOW())"
                            : ', parts_acknowledged_at = NOW()';
                    } else {
                        $nextJobStatus = 5;
                        $partsApprovalSql = columnExists($con, 'job', 'parts_status')
                            ? ", parts_status = 'pending_parts', parts_expected_date = NULL, parts_reference = NULL, parts_notes = NULL, parts_status_updated_at = NOW(), parts_status_updated_by = NULL, parts_acknowledged_at = NOW()"
                            : ', parts_acknowledged_at = NOW()';
                    }
                    if (!mysqli_query($con, "UPDATE job SET status = $nextJobStatus, checkin_at = COALESCE(checkin_at, NOW()), inspected_at = COALESCE(inspected_at, NOW()), quotation_issued_at = COALESCE(quotation_issued_at, NOW()), approved_at = COALESCE(approved_at, NOW())$partsApprovalSql WHERE id = $jobId")) {
                        throw new Exception(mysqli_error($con), 500);
                    }
                } else {
                    if (!mysqli_query($con, "UPDATE work_order_quotation SET status = 'rejected', customer_response_note = '$responseNoteSql', rejected_at = NOW(), approved_at = NULL, updated_at = NOW() WHERE id = $quotationId AND status = 'issued'")) {
                        throw new Exception(mysqli_error($con), 500);
                    }
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to record quotation response: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            $workOrderNo = rowValue($jobRow, ['work_order_no'], 'WO-' . $jobId);
            $message = $action === 'accept'
                ? 'Quotation accepted. Repair approval has been recorded.'
                : 'Quotation rejected. The workshop will prepare a revision.';
            createCustomerRecordNotification(
                $con, $auth['source'], intval($jobRow['company_id'] ?? 0), intval($auth['userId']),
                $action === 'accept' ? 'Quotation accepted' : 'Quotation rejected', "$workOrderNo: $message",
                'work_order', 'work_order', 'wo' . $jobId, '/repair-progress/wo' . $jobId
            );
            sendResponse(true, $message, [
                'quotation' => workOrderQuotation($con, $jobId),
                'workOrderStatus' => $action === 'accept' ? 'approved' : 'quotation_issued'
            ]);
            break;

        default:
            sendResponse(false, "Unsupported quotation action: $mode", null, 400);
            break;
    }
}

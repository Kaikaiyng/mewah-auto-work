<?php
/**
 * Parts & Inventory Domain Module
 *
 * Handles parts catalog, stock tracking, AutoCount Item / Stock Groups,
 * inventory deduction/restoration for work orders, parts orders, and AutoCount DO sync.
 */

function normalizeAdminItemType($value, $groupCode = '') {
    $type = strtolower(trim(strval($value)));
    if (in_array($type, ['part', 'labour', 'service', 'fee', 'vehicle', 'other'], true)) return $type;

    $group = strtoupper(trim(strval($groupCode)));
    if ($group === 'STOCK PM' || $group === 'SOC') return 'vehicle';
    if (strpos($group, 'LABOU') !== false) return 'labour';
    if (in_array($group, ['SP', 'STOCK', 'EQUIP', 'SM', 'TLS&EQP', 'T&E (EXP'], true)) return 'part';
    if (in_array($group, ['COURIER', 'HDLG', 'O/CHARGE', 'T/L USE', 'T/W USE', 'TRANS', 'UK/EQP'], true)) return 'service';
    if ($group !== '') return 'fee';
    return 'part';
}

function adminCanViewItemCost($con) {
    return in_array(currentAdminRoleName($con), ['Admin', 'Head Manager'], true);
}

function resolveSupplierInfo($con, $rawSupplier, $rawCode = '') {
    $rawSupplier = trim(strval($rawSupplier));
    $rawCode = trim(strval($rawCode));
    if ($rawSupplier === '' && $rawCode === '') {
        return ['supplier' => '', 'supplierCode' => '', 'supplierName' => ''];
    }

    $parsedName = $rawSupplier;
    $parsedCode = $rawCode !== '' ? $rawCode : $rawSupplier;
    if (preg_match('/^(.*?)\s*\(([^)]+)\)$/', $rawSupplier, $m)) {
        $parsedName = trim($m[1]);
        if ($rawCode === '' || $rawCode === $rawSupplier) {
            $parsedCode = trim($m[2]);
        }
    } elseif ($rawCode !== '' && preg_match('/^(.*?)\s*\(([^)]+)\)$/', $rawCode, $mc)) {
        if ($parsedName === '' || $parsedName === $rawCode) {
            $parsedName = trim($mc[1]);
        }
        $parsedCode = trim($mc[2]);
    }

    $supplierName = '';
    $supplierCode = $parsedCode;

    if (tableExists($con, 'Creditor')) {
        $escCode = mysqli_real_escape_string($con, $parsedCode);
        $escRawSup = mysqli_real_escape_string($con, $rawSupplier);
        $escRawCode = mysqli_real_escape_string($con, $rawCode);
        $escName = mysqli_real_escape_string($con, $parsedName);
        $cRes = mysqli_query($con, "SELECT AccNo, CompanyName FROM Creditor 
            WHERE UPPER(TRIM(AccNo)) = UPPER(TRIM('$escCode')) 
               OR UPPER(TRIM(AccNo)) = UPPER(TRIM('$escRawCode'))
               OR UPPER(TRIM(AccNo)) = UPPER(TRIM('$escRawSup'))
               OR UPPER(TRIM(CompanyName)) = UPPER(TRIM('$escName'))
               OR UPPER(TRIM(CompanyName)) = UPPER(TRIM('$escRawSup'))
            LIMIT 1");
        if ($cRes && $cRow = mysqli_fetch_assoc($cRes)) {
            $supplierCode = trim(strval($cRow['AccNo'] ?? ''));
            $supplierName = trim(strval($cRow['CompanyName'] ?? ''));
        }
    }

    if (!$supplierName) {
        $supplierName = ($parsedName !== '' && $parsedName !== $parsedCode) ? $parsedName : ($rawSupplier ?: $parsedCode);
    }

    // Clean up if supplierName already contains the code like "Company (Code)"
    if ($supplierCode !== '' && preg_match('/^(.*?)\s*\(' . preg_quote($supplierCode, '/') . '\)$/i', $supplierName, $sm)) {
        $supplierName = trim($sm[1]);
    }

    $unifiedSupplier = $supplierName;
    if ($supplierCode !== '' && $supplierCode !== $supplierName && stripos($supplierName, "($supplierCode)") === false) {
        $unifiedSupplier = "$supplierName ($supplierCode)";
    }

    return [
        'supplier' => $unifiedSupplier,
        'supplierCode' => $supplierCode,
        'supplierName' => $supplierName,
    ];
}

function ensurePartStockTransactionsTable($con) {
    if (tableExists($con, 'part_stock_transactions')) return;
    $sql = "CREATE TABLE IF NOT EXISTS `part_stock_transactions` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      `part_id` BIGINT UNSIGNED NOT NULL,
      `transaction_type` VARCHAR(32) NOT NULL,
      `doc_type` VARCHAR(24) NOT NULL,
      `doc_id` BIGINT NULL,
      `doc_no` VARCHAR(60) NOT NULL DEFAULT '',
      `party_code` VARCHAR(50) NULL,
      `party_name` VARCHAR(150) NULL,
      `quantity_change` DECIMAL(12,2) NOT NULL,
      `balance_after` DECIMAL(12,2) NOT NULL,
      `unit_cost` DECIMAL(14,2) NULL,
      `notes` VARCHAR(500) NULL,
      `created_by` INT NULL,
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `idx_part_stock_trans_part` (`part_id`, `created_at`),
      KEY `idx_part_stock_trans_doc` (`doc_type`, `doc_id`),
      KEY `idx_part_stock_trans_doc_no` (`doc_no`),
      KEY `idx_part_stock_trans_party` (`party_code`),
      KEY `idx_part_stock_trans_type` (`transaction_type`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    mysqli_query($con, $sql);
}

function recordPartStockTransaction($con, $data) {
    ensurePartStockTransactionsTable($con);
    $partId = intval($data['part_id'] ?? 0);
    if ($partId <= 0) return false;

    $transType = trim(strval($data['transaction_type'] ?? 'stock_adjustment'));
    $docType = trim(strval($data['doc_type'] ?? 'MANUAL'));

    $rawPartyName = trim(strval($data['party_name'] ?? ''));
    $rawPartyCode = trim(strval($data['party_code'] ?? ''));

    if (in_array(strtoupper($docType), ['PO', 'OPENING', 'SUPPLIER', 'CREDITOR'], true) || in_array($transType, ['po_receive', 'initial'], true)) {
        $supInfo = resolveSupplierInfo($con, $rawPartyName, $rawPartyCode);
        $cleanPartyName = $supInfo['supplierName'] ?: $rawPartyName;
        $cleanPartyCode = $supInfo['supplierCode'] ?: $rawPartyCode;
    } else {
        $cleanPartyName = $rawPartyName;
        $cleanPartyCode = $rawPartyCode;
        if ($cleanPartyName !== '' && preg_match('/^(.*?)\s*\(([^)]+)\)$/', $cleanPartyName, $pm)) {
            if ($cleanPartyCode === '' || $cleanPartyCode === $cleanPartyName) {
                $cleanPartyName = trim($pm[1]);
                $cleanPartyCode = trim($pm[2]);
            }
        }
    }

    $transTypeEsc = mysqli_real_escape_string($con, $transType);
    $docTypeEsc = mysqli_real_escape_string($con, $docType);
    $docId = !empty($data['doc_id']) ? intval($data['doc_id']) : 'NULL';
    $docNo = mysqli_real_escape_string($con, trim(strval($data['doc_no'] ?? '')));
    $partyCode = ($cleanPartyCode !== '') ? "'" . mysqli_real_escape_string($con, $cleanPartyCode) . "'" : 'NULL';
    $partyName = ($cleanPartyName !== '') ? "'" . mysqli_real_escape_string($con, $cleanPartyName) . "'" : 'NULL';
    $qtyChange = floatval($data['quantity_change'] ?? 0);
    $balanceAfter = floatval($data['balance_after'] ?? 0);
    $unitCost = array_key_exists('unit_cost', $data) && $data['unit_cost'] !== null ? floatval($data['unit_cost']) : 'NULL';
    $notes = !empty($data['notes']) ? "'" . mysqli_real_escape_string($con, trim(strval($data['notes']))) . "'" : 'NULL';
    $createdBy = !empty($_SESSION['admin_id']) ? intval($_SESSION['admin_id']) : (!empty($data['created_by']) ? intval($data['created_by']) : 'NULL');

    $sql = "INSERT INTO `part_stock_transactions`
        (`part_id`, `transaction_type`, `doc_type`, `doc_id`, `doc_no`, `party_code`, `party_name`, `quantity_change`, `balance_after`, `unit_cost`, `notes`, `created_by`)
        VALUES
        ($partId, '$transTypeEsc', '$docTypeEsc', $docId, '$docNo', $partyCode, $partyName, $qtyChange, $balanceAfter, $unitCost, $notes, $createdBy)";
    return mysqli_query($con, $sql);
}

function saveAdminPart($con, $data, $id = null) {
    $useLegacy = tableExists($con, 'parts');
    $table = $useLegacy ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if (!$table) {
        sendResponse(false, 'Parts inventory storage is unavailable.', null, 409);
    }

    $nameValue = trim(strval($data['name'] ?? ''));
    if ($nameValue === '') {
        sendResponse(false, 'Part Name is required.', null, 422);
    }
    if (strlen($nameValue) > 150) {
        sendResponse(false, 'Part Name must not exceed 150 characters.', null, 422);
    }

    $skuValue = strval($data['sku'] ?? '');
    if (trim($skuValue) === '') {
        sendResponse(false, 'SKU / Code is required.', null, 422);
    }
    if (strlen($skuValue) > 80) {
        sendResponse(false, 'Item Code must not exceed 80 characters.', null, 422);
    }

    foreach (['price', 'cost', 'stock', 'lowStockThreshold'] as $numericField) {
        if (!array_key_exists($numericField, $data) || !is_numeric($data[$numericField])) {
            sendResponse(false, 'Price, cost, stock and low threshold must be valid numbers.', null, 422);
        }
    }
    $price = floatval($data['price']);
    $cost = floatval($data['cost']);
    $stock = floatval($data['stock']);
    $lowStockThreshold = floatval($data['lowStockThreshold']);
    if ($price < 0 || $cost < 0 || $stock < 0 || $lowStockThreshold < 0) {
        sendResponse(false, 'Price, cost, stock and low threshold cannot be negative.', null, 422);
    }
    if ($id !== null) {
        $existingPart = mysqli_query($con, "SELECT id FROM `$table` WHERE id = " . intval($id) . ' LIMIT 1');
        if (!$existingPart || mysqli_num_rows($existingPart) === 0) {
            sendResponse(false, 'Part record was not found.', null, 404);
        }
    }

    $skuColumn = firstColumn($con, $table, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
    if (!$skuColumn) {
        sendResponse(false, 'Parts storage schema is missing the SKU field.', null, 409);
    }
    $escapedSkuForLookup = mysqli_real_escape_string($con, $skuValue);
    $duplicateWhere = "LOWER(TRIM(`$skuColumn`)) = LOWER('$escapedSkuForLookup')";
    if ($id !== null) $duplicateWhere .= ' AND id <> ' . intval($id);
    $duplicatePart = mysqli_query($con, "SELECT id FROM `$table` WHERE $duplicateWhere LIMIT 1");
    if ($duplicatePart && mysqli_num_rows($duplicatePart) > 0) {
        sendResponse(false, 'Another part already uses this SKU / Code.', null, 409);
    }

    $imageValue = trim(strval($data['image'] ?? ''));
    $imageData = trim(strval($data['imageData'] ?? ''));
    if ($imageData !== '') {
        if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$#', $imageData, $matches)) {
            sendResponse(false, 'Part image must be a JPG, PNG, or WebP file.', null, 400);
        }

        $decodedImage = base64_decode(preg_replace('/\s+/', '', $matches[2]), true);
        if ($decodedImage === false || strlen($decodedImage) === 0) {
            sendResponse(false, 'The selected part image could not be read.', null, 400);
        }
        if (strlen($decodedImage) > 3 * 1024 * 1024) {
            sendResponse(false, 'Part image must not exceed 3 MB.', null, 413);
        }

        $imageMime = function_exists('finfo_open')
            ? (function ($bytes) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mime = $finfo ? finfo_buffer($finfo, $bytes) : '';
                if ($finfo) finfo_close($finfo);
                return $mime;
            })($decodedImage)
            : '';
        $allowedImageTypes = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp'
        ];
        if ($imageMime !== '' && !isset($allowedImageTypes[$imageMime])) {
            sendResponse(false, 'Part image must be a valid JPG, PNG, or WebP file.', null, 400);
        }

        $fallbackMime = strtolower($matches[1]) === 'png'
            ? 'image/png'
            : (strtolower($matches[1]) === 'webp' ? 'image/webp' : 'image/jpeg');
        $extension = $allowedImageTypes[$imageMime ?: $fallbackMime] ?? null;
        if (!$extension) {
            sendResponse(false, 'Unsupported part image format.', null, 400);
        }

        $uploadDirectory = dirname(__DIR__) . '/uploads/parts';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
            sendResponse(false, 'Unable to create the part image upload directory.', null, 500);
        }

        $imageFileName = 'part_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $extension;
        $imageFilePath = $uploadDirectory . '/' . $imageFileName;
        if (file_put_contents($imageFilePath, $decodedImage, LOCK_EX) === false) {
            sendResponse(false, 'Unable to save the selected part image.', null, 500);
        }

        $forwardedProto = strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0]));
        $scheme = in_array($forwardedProto, ['http', 'https'], true)
            ? $forwardedProto
            : (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http');
        $host = preg_replace('/[^A-Za-z0-9.:-]/', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
        $scriptDirectory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/api.php'));
        $scriptDirectory = $scriptDirectory === '/' ? '' : rtrim($scriptDirectory, '/');
        $imageValue = $scheme . '://' . $host . $scriptDirectory . '/uploads/parts/' . rawurlencode($imageFileName);
    }
    
    $name = mysqli_real_escape_string($con, $nameValue);
    $category = mysqli_real_escape_string($con, $data['category'] ?? '');
    $sku = mysqli_real_escape_string($con, $skuValue);
    $uom = mysqli_real_escape_string($con, trim(strval($data['uom'] ?? '')));
    $itemGroupValue = strtoupper(trim(strval($data['itemGroup'] ?? '')));
    $itemGroup = mysqli_real_escape_string($con, substr($itemGroupValue, 0, 30));
    $itemTypeValue = normalizeAdminItemType($data['itemType'] ?? '', $itemGroupValue);
    $itemType = mysqli_real_escape_string($con, $itemTypeValue);
    $taxCode = mysqli_real_escape_string($con, substr(strtoupper(trim(strval($data['taxCode'] ?? ''))), 0, 30));
    $isStockItem = array_key_exists('isStockItem', $data)
        ? (!empty($data['isStockItem']) ? 1 : 0)
        : ($itemTypeValue === 'part' || $itemTypeValue === 'vehicle' ? 1 : 0);
    $isActive = array_key_exists('isActive', $data) ? (!empty($data['isActive']) ? 1 : 0) : 1;
    $supplier = mysqli_real_escape_string($con, $data['supplier'] ?? '');
    $image = mysqli_real_escape_string($con, $imageValue);
    
    if ($useLegacy) {
        $fields = [
            'name' => "'$name'",
            'category' => "'$category'",
            'sku' => "'$sku'",
            'price' => $price,
            'cost_price' => $cost,
            'uom' => "'$uom'",
            'autocount_item_group' => $itemGroup === '' ? 'NULL' : "'$itemGroup'",
            'item_type' => "'$itemType'",
            'tax_code' => $taxCode === '' ? 'NULL' : "'$taxCode'",
            'is_stock_item' => $isStockItem,
            'is_active' => $isActive,
            'stock' => $stock,
            'low_stock_threshold' => $lowStockThreshold,
            'supplier' => "'$supplier'",
            'image_url' => "'$image'"
        ];

        $mapped = [];
        $colMap = [
            'name' => ['name', 'part_name', 'title'],
            'category' => ['category', 'type', 'part_category', 'group_name'],
            'sku' => ['sku', 'part_no', 'code', 'part_code', 'item_code'],
            'price' => ['price', 'selling_price', 'unit_price'],
            'cost_price' => ['cost_price', 'cost', 'standard_cost', 'unit_cost'],
            'uom' => ['uom', 'unit', 'unit_of_measure'],
            'autocount_item_group' => ['autocount_item_group', 'item_group', 'stock_group'],
            'item_type' => ['item_type'],
            'tax_code' => ['tax_code'],
            'is_stock_item' => ['is_stock_item'],
            'is_active' => ['is_active'],
            'stock' => ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance'],
            'low_stock_threshold' => ['low_stock_threshold', 'minimum_stock', 'min_stock', 'reorder_level', 'reorder_point'],
            'supplier' => ['supplier', 'vendor', 'supplier_name'],
            'image_url' => ['image_url', 'image', 'photo', 'image_path']
        ];

        foreach ($fields as $key => $val) {
            $colName = null;
            foreach ($colMap[$key] as $opt) {
                if (columnExists($con, 'parts', $opt)) {
                    $colName = $opt;
                    break;
                }
            }
            if ($colName !== null) {
                $mapped[$colName] = $val;
            }
        }
        if ($id === null && columnExists($con, 'parts', 'status') && !array_key_exists('status', $mapped)) {
            $mapped['status'] = '0';
        }

        $requiredInventoryFields = ['category', 'sku', 'stock', 'low_stock_threshold', 'supplier'];
        $missingInventoryFields = array_values(array_filter(
            $requiredInventoryFields,
            function ($field) use ($mapped, $colMap) {
                foreach ($colMap[$field] as $candidate) {
                    if (array_key_exists($candidate, $mapped)) return false;
                }
                return true;
            }
        ));
        if (!empty($missingInventoryFields)) {
            sendResponse(
                false,
                'Parts storage schema is incomplete. Missing fields: ' .
                implode(', ', $missingInventoryFields) .
                '. Apply migration 010_parts_inventory_fields.sql before saving.',
                null,
                409
            );
        }

        if ($id !== null) {
            $updates = [];
            foreach ($mapped as $col => $val) {
                $updates[] = "`$col` = $val";
            }
            $query = "UPDATE parts SET " . implode(', ', $updates) . " WHERE id = " . intval($id);
            return mysqli_query($con, $query);
        } else {
            $cols = [];
            $vals = [];
            foreach ($mapped as $col => $val) {
                $cols[] = "`$col`";
                $vals[] = $val;
            }
            $query = "INSERT INTO parts (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ")";
            return mysqli_query($con, $query);
        }
    } else {
        if ($id !== null) {
            $costColumn = firstColumn($con, 'spare_parts', ['cost_price', 'cost', 'standard_cost', 'unit_cost']);
            $uomColumn = firstColumn($con, 'spare_parts', ['uom', 'unit', 'unit_of_measure']);
            $query = "UPDATE spare_parts SET 
                      name = '$name',
                      category = '$category',
                      sku = '$sku',
                      price = $price,
                      stock = $stock,
                      low_stock_threshold = $lowStockThreshold,
                      supplier = '$supplier',
                      image_url = '$image',
                      in_stock = " . ($stock > 0 ? 1 : 0) .
                      ($costColumn ? ", `$costColumn` = $cost" : '') .
                      ($uomColumn ? ", `$uomColumn` = '$uom'" : '') .
                      (columnExists($con, 'spare_parts', 'autocount_item_group') ? ", autocount_item_group = " . ($itemGroup === '' ? 'NULL' : "'$itemGroup'") : '') .
                      (columnExists($con, 'spare_parts', 'item_type') ? ", item_type = '$itemType'" : '') .
                      (columnExists($con, 'spare_parts', 'tax_code') ? ", tax_code = " . ($taxCode === '' ? 'NULL' : "'$taxCode'") : '') .
                      (columnExists($con, 'spare_parts', 'is_stock_item') ? ", is_stock_item = $isStockItem" : '') .
                      (columnExists($con, 'spare_parts', 'is_active') ? ", is_active = $isActive" : '') .
                      " WHERE id = " . intval($id);
            return mysqli_query($con, $query);
        } else {
            $costColumn = firstColumn($con, 'spare_parts', ['cost_price', 'cost', 'standard_cost', 'unit_cost']);
            $uomColumn = firstColumn($con, 'spare_parts', ['uom', 'unit', 'unit_of_measure']);
            $columns = ['name', 'category', 'sku', 'price', 'stock', 'low_stock_threshold', 'supplier', 'image_url', 'in_stock'];
            $values = ["'$name'", "'$category'", "'$sku'", $price, $stock, $lowStockThreshold, "'$supplier'", "'$image'", $stock > 0 ? 1 : 0];
            if ($costColumn) {
                $columns[] = $costColumn;
                $values[] = $cost;
            }
            if ($uomColumn) {
                $columns[] = $uomColumn;
                $values[] = "'$uom'";
            }
            foreach ([
                'autocount_item_group' => $itemGroup === '' ? 'NULL' : "'$itemGroup'",
                'item_type' => "'$itemType'",
                'tax_code' => $taxCode === '' ? 'NULL' : "'$taxCode'",
                'is_stock_item' => $isStockItem,
                'is_active' => $isActive
            ] as $optionalColumn => $optionalValue) {
                if (!columnExists($con, 'spare_parts', $optionalColumn)) continue;
                $columns[] = $optionalColumn;
                $values[] = $optionalValue;
            }
            $query = "INSERT INTO spare_parts (`" . implode('`, `', $columns) . "`) VALUES (" . implode(', ', $values) . ")";
            return mysqli_query($con, $query);
        }
    }
}

function importAdminParts($con, $items) {
    if (!is_array($items) || count($items) === 0) {
        sendResponse(false, 'Select a prepared AutoCount CSV file before importing.', null, 422);
    }
    if (count($items) > 5000) {
        sendResponse(false, 'A single parts import cannot exceed 5,000 rows.', null, 413);
    }

    $table = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if (!$table) {
        sendResponse(false, 'Parts inventory storage is unavailable.', null, 409);
    }

    $columns = [
        'id' => firstColumn($con, $table, ['id']),
        'name' => firstColumn($con, $table, ['name', 'part_name', 'title']),
        'category' => firstColumn($con, $table, ['category', 'type', 'part_category', 'group_name']),
        'sku' => firstColumn($con, $table, ['sku', 'part_no', 'code', 'part_code', 'item_code']),
        'price' => firstColumn($con, $table, ['price', 'selling_price', 'unit_price']),
        'cost' => firstColumn($con, $table, ['cost_price', 'cost', 'standard_cost', 'unit_cost']),
        'uom' => firstColumn($con, $table, ['uom', 'unit', 'unit_of_measure']),
        'itemGroup' => firstColumn($con, $table, ['autocount_item_group', 'item_group', 'stock_group']),
        'itemType' => firstColumn($con, $table, ['item_type']),
        'taxCode' => firstColumn($con, $table, ['tax_code']),
        'isStockItem' => firstColumn($con, $table, ['is_stock_item']),
        'isActive' => firstColumn($con, $table, ['is_active']),
        'stock' => firstColumn($con, $table, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']),
        'threshold' => firstColumn($con, $table, ['low_stock_threshold', 'minimum_stock', 'min_stock', 'reorder_level', 'reorder_point']),
        'supplier' => firstColumn($con, $table, ['supplier', 'vendor', 'supplier_name']),
        'image' => firstColumn($con, $table, ['image_url', 'image', 'photo', 'image_path']),
        'inStock' => firstColumn($con, $table, ['in_stock', 'is_available', 'available']),
        'legacyStatus' => firstColumn($con, $table, ['status'])
    ];
    foreach (['id', 'name', 'category', 'sku', 'price', 'cost', 'uom', 'stock', 'threshold'] as $required) {
        if (!$columns[$required]) {
            sendResponse(
                false,
                'Parts import storage is incomplete. Apply migration 012_autocount_parts_import.sql first.',
                null,
                409
            );
        }
    }

    $existing = [];
    $existingResult = mysqli_query($con, "SELECT `{$columns['id']}`, `{$columns['sku']}` FROM `$table`");
    while ($existingResult && $row = mysqli_fetch_assoc($existingResult)) {
        $existing[strtoupper(trim(strval($row[$columns['sku']] ?? '')))] = intval($row[$columns['id']]);
    }

    $created = 0;
    $updated = 0;
    $skipped = 0;
    $seen = [];
    mysqli_begin_transaction($con);
    try {
        foreach ($items as $item) {
            if (!is_array($item)) {
                $skipped++;
                continue;
            }
            $skuValue = strval($item['sku'] ?? '');
            $nameValue = trim(strval($item['name'] ?? ''));
            $key = strtoupper($skuValue);
            if (trim($skuValue) === '' || $nameValue === '' || strlen($skuValue) > 80 || isset($seen[$key])) {
                $skipped++;
                continue;
            }
            $seen[$key] = true;

            $sku = mysqli_real_escape_string($con, $skuValue);
            $name = mysqli_real_escape_string($con, substr($nameValue, 0, 150));
            $hasUom = array_key_exists('uom', $item) && trim(strval($item['uom'])) !== '';
            $hasCategory = array_key_exists('category', $item) && trim(strval($item['category'])) !== '';
            $hasPrice = array_key_exists('price', $item) && $item['price'] !== null && $item['price'] !== '';
            $hasCost = array_key_exists('cost', $item) && $item['cost'] !== null && $item['cost'] !== '';
            $hasStock = array_key_exists('stock', $item) && $item['stock'] !== null && $item['stock'] !== '';
            $hasThreshold = array_key_exists('lowStockThreshold', $item) && $item['lowStockThreshold'] !== null && $item['lowStockThreshold'] !== '';
            $hasSupplier = $columns['supplier'] && array_key_exists('supplier', $item) && trim(strval($item['supplier'])) !== '';
            $hasItemGroup = $columns['itemGroup'] && array_key_exists('itemGroup', $item) && trim(strval($item['itemGroup'])) !== '';
            $hasItemType = $columns['itemType'] && (array_key_exists('itemType', $item) || $hasItemGroup);
            $hasTaxCode = $columns['taxCode'] && array_key_exists('taxCode', $item);
            $hasIsStockItem = $columns['isStockItem'] && array_key_exists('isStockItem', $item);
            $hasIsActive = $columns['isActive'] && array_key_exists('isActive', $item);
            $uom = mysqli_real_escape_string($con, substr(trim(strval($item['uom'] ?? '')), 0, 30));
            $categoryValue = trim(strval($item['category'] ?? ''));
            $category = mysqli_real_escape_string($con, substr($categoryValue !== '' ? $categoryValue : 'Uncategorized', 0, 100));
            $supplier = mysqli_real_escape_string($con, substr(trim(strval($item['supplier'] ?? '')), 0, 150));
            $itemGroupValue = strtoupper(trim(strval($item['itemGroup'] ?? '')));
            $itemGroup = mysqli_real_escape_string($con, substr($itemGroupValue, 0, 30));
            $itemTypeValue = normalizeAdminItemType($item['itemType'] ?? '', $itemGroupValue);
            $itemType = mysqli_real_escape_string($con, $itemTypeValue);
            $taxCode = mysqli_real_escape_string($con, substr(strtoupper(trim(strval($item['taxCode'] ?? ''))), 0, 30));
            $isStockItem = array_key_exists('isStockItem', $item)
                ? (!empty($item['isStockItem']) ? 1 : 0)
                : ($itemTypeValue === 'part' || $itemTypeValue === 'vehicle' ? 1 : 0);
            $isActive = array_key_exists('isActive', $item) ? (!empty($item['isActive']) ? 1 : 0) : 1;
            $price = max(0, floatval($item['price'] ?? 0));
            $cost = max(0, floatval($item['cost'] ?? 0));
            $stock = max(0, floatval($item['stock'] ?? 0));
            $threshold = max(0, floatval($item['lowStockThreshold'] ?? 0));

            if (isset($existing[$key])) {
                $sets = ["`{$columns['name']}` = '$name'"];
                if ($hasUom) $sets[] = "`{$columns['uom']}` = '$uom'";
                if ($hasCategory) $sets[] = "`{$columns['category']}` = '$category'";
                if ($hasPrice) $sets[] = "`{$columns['price']}` = $price";
                if ($hasCost) $sets[] = "`{$columns['cost']}` = $cost";
                if ($hasStock) {
                    $sets[] = "`{$columns['stock']}` = $stock";
                    if ($columns['inStock']) $sets[] = "`{$columns['inStock']}` = " . ($stock > 0 ? 1 : 0);
                }
                if ($hasThreshold) $sets[] = "`{$columns['threshold']}` = $threshold";
                if ($hasSupplier) $sets[] = "`{$columns['supplier']}` = '$supplier'";
                if ($hasItemGroup) $sets[] = "`{$columns['itemGroup']}` = '$itemGroup'";
                if ($hasItemType) $sets[] = "`{$columns['itemType']}` = '$itemType'";
                if ($hasTaxCode) $sets[] = "`{$columns['taxCode']}` = " . ($taxCode === '' ? 'NULL' : "'$taxCode'");
                if ($hasIsStockItem) $sets[] = "`{$columns['isStockItem']}` = $isStockItem";
                if ($hasIsActive) $sets[] = "`{$columns['isActive']}` = $isActive";
                $ok = mysqli_query(
                    $con,
                    "UPDATE `$table` SET " . implode(', ', $sets) . " WHERE `{$columns['id']}` = " . intval($existing[$key])
                );
                if (!$ok) throw new Exception(mysqli_error($con));
                $updated++;
                continue;
            }

            $insert = [
                $columns['name'] => "'$name'",
                $columns['category'] => "'$category'",
                $columns['sku'] => "'$sku'",
                $columns['price'] => $price,
                $columns['cost'] => $cost,
                $columns['uom'] => "'$uom'",
                $columns['stock'] => $stock,
                $columns['threshold'] => $threshold
            ];
            if ($columns['supplier']) $insert[$columns['supplier']] = "'$supplier'";
            if ($columns['itemGroup']) $insert[$columns['itemGroup']] = $itemGroup === '' ? 'NULL' : "'$itemGroup'";
            if ($columns['itemType']) $insert[$columns['itemType']] = "'$itemType'";
            if ($columns['taxCode']) $insert[$columns['taxCode']] = $taxCode === '' ? 'NULL' : "'$taxCode'";
            if ($columns['isStockItem']) $insert[$columns['isStockItem']] = $isStockItem;
            if ($columns['isActive']) $insert[$columns['isActive']] = $isActive;
            if ($columns['image']) $insert[$columns['image']] = "''";
            if ($columns['inStock']) $insert[$columns['inStock']] = $stock > 0 ? 1 : 0;
            if ($columns['legacyStatus']) $insert[$columns['legacyStatus']] = 0;
            $insertColumns = array_map(function ($column) { return "`$column`"; }, array_keys($insert));
            $ok = mysqli_query(
                $con,
                "INSERT INTO `$table` (" . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', array_values($insert)) . ')'
            );
            if (!$ok) throw new Exception(mysqli_error($con));
            $existing[$key] = mysqli_insert_id($con);
            $created++;
        }
        mysqli_commit($con);
    } catch (Throwable $error) {
        mysqli_rollback($con);
        sendResponse(false, 'Unable to import parts: ' . $error->getMessage(), null, 500);
    }

    return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'total' => count($items)];
}

function deleteAdminPart($con, $id) {
    $useLegacy = tableExists($con, 'parts');
    $table = $useLegacy ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if (!$table) {
        sendResponse(false, 'Parts inventory storage is unavailable.', null, 409);
    }
    $query = "DELETE FROM `$table` WHERE id = " . intval($id);
    $deleted = mysqli_query($con, $query);
    if (!$deleted) return false;
    if (mysqli_affected_rows($con) !== 1) {
        sendResponse(false, 'Part record was not found.', null, 404);
    }
    return true;
}

function legacyParts($con) {
    if (!tableExists($con, 'parts')) {
        return null;
    }

    $parts = [];
    $canViewCost = adminCanViewItemCost($con);
    $result = mysqli_query($con, "SELECT * FROM parts ORDER BY id DESC");
    if (!$result) {
        sendResponse(false, 'Unable to load parts inventory: ' . mysqli_error($con), null, 500);
    }
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $stock = floatval(rowValue($row, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance'], 0));
        $threshold = floatval(rowValue($row, ['low_stock_threshold', 'minimum_stock', 'min_stock', 'reorder_level', 'reorder_point'], 10));
        $rawSupplier = trim(strval(rowValue($row, ['supplier', 'vendor', 'supplier_name'], '')));
        $rawSupplierCode = trim(strval(rowValue($row, ['supplier_code', 'creditor_code', 'vendor_code'], '')));
        $supInfo = resolveSupplierInfo($con, $rawSupplier, $rawSupplierCode);
        $parts[] = [
            'id' => intval(rowValue($row, ['id'], 0)),
            'name' => rowValue($row, ['name', 'part_name', 'title'], 'Part #' . rowValue($row, ['id'], '')),
            'category' => rowValue($row, ['category', 'type', 'part_category', 'group_name'], 'Parts'),
            'sku' => rowValue($row, ['sku', 'part_no', 'code', 'part_code', 'item_code'], 'P-' . rowValue($row, ['id'], '')),
            'price' => floatval(rowValue($row, ['price', 'selling_price', 'unit_price'], 0)),
            'cost' => $canViewCost ? floatval(rowValue($row, ['cost_price', 'cost', 'standard_cost', 'unit_cost'], 0)) : null,
            'uom' => rowValue($row, ['uom', 'unit', 'unit_of_measure'], ''),
            'itemGroup' => rowValue($row, ['autocount_item_group', 'item_group', 'stock_group'], ''),
            'itemType' => normalizeAdminItemType(rowValue($row, ['item_type'], ''), rowValue($row, ['autocount_item_group', 'item_group', 'stock_group'], '')),
            'taxCode' => rowValue($row, ['tax_code'], ''),
            'isStockItem' => boolval(rowValue($row, ['is_stock_item'], 1)),
            'isActive' => boolval(rowValue($row, ['is_active'], 1)),
            'stock' => $stock,
            'lowStockThreshold' => $threshold,
            'supplier' => $supInfo['supplier'],
            'supplierCode' => $supInfo['supplierCode'],
            'supplierName' => $supInfo['supplierName'],
            'image' => rowValue($row, ['image_url', 'image', 'photo', 'image_path'], ''),
            'inStock' => $stock > 0
        ];
    }

    return $parts;
}

function adminPartsOrders($con) {
    $orders = legacyOrders($con);
    return is_array($orders) ? $orders : [];
}

function legacyOrders($con) {
    if (
        tableExists($con, 'parts_orders') &&
        tableExists($con, 'parts_order_items') &&
        (tableExists($con, 'customer_appointment') || !tableExists($con, 'bookings'))
    ) {
        $orders = [];
        $customerTable = tableExists($con, 'customer') ? 'customer' : (tableExists($con, 'users') ? 'users' : null);
        $customerNameColumn = $customerTable
            ? firstColumn($con, $customerTable, ['name', 'username', 'customer_name'])
            : null;
        $customerJoin = $customerTable && $customerNameColumn
            ? " LEFT JOIN `$customerTable` customer_contact ON customer_contact.id = parts_orders.customer_id"
            : '';
        $customerSelect = $customerTable && $customerNameColumn
            ? ", customer_contact.`$customerNameColumn` AS customer_name"
            : ", '-' AS customer_name";
        $result = mysqli_query(
            $con,
            "SELECT parts_orders.*$customerSelect
             FROM parts_orders$customerJoin
             ORDER BY parts_orders.created_at DESC, parts_orders.id DESC"
        );
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $orders[] = [
                'id' => $row['order_number'],
                'customer' => $row['customer_name'] ?: '-',
                'items' => fetchPartsOrderItems($con, intval($row['id'])),
                'total' => floatval($row['total']),
                'status' => toAdminOrderStatus(strtolower(str_replace(' ', '_', $row['status']))),
                'orderDate' => substr($row['created_at'], 0, 10),
                'deliveryAddress' => $row['delivery_address'] ?: '-',
                'autocountDoNo' => $row['autocount_do_no'] ?? '',
                'autocountSyncStatus' => $row['autocount_sync_status'] ?? 'not_queued',
                'autocountSyncAt' => $row['autocount_sync_at'] ?? null
            ];
        }
        return $orders;
    }

    $table = tableExists($con, 'job_parts') ? 'job_parts' : (tableExists($con, 'customer_statement') ? 'customer_statement' : null);
    if (!$table) {
        return null;
    }

    $orders = [];
    $result = mysqli_query($con, "SELECT * FROM `$table` ORDER BY id DESC");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $dateValue = rowValue($row, ['order_date', 'date', 'created_at'], date('Y-m-d H:i:s'));
        $orders[] = [
            'id' => rowValue($row, ['order_no', 'statement_no', 'invoice_no', 'id'], 'ORD-' . rowValue($row, ['id'], '')),
            'customer' => rowValue($row, ['customer_name', 'name'], '-'),
            'items' => [[
                'name' => rowValue($row, ['part_name', 'item_name', 'description', 'name'], 'Parts Order'),
                'quantity' => intval(rowValue($row, ['quantity', 'qty'], 1)),
                'price' => floatval(rowValue($row, ['price', 'amount', 'total'], 0))
            ]],
            'total' => floatval(rowValue($row, ['total', 'amount', 'price'], 0)),
            'status' => toAdminOrderStatus(strtolower(str_replace(' ', '_', rowValue($row, ['status'], 'pending')))),
            'orderDate' => substr($dateValue, 0, 10),
            'deliveryAddress' => rowValue($row, ['delivery_address', 'address'], '-')
        ];
    }

    return $orders;
}

function updateAdminOrderStatus($con, $orderId, $status) {
    ensureSchema($con);
    $normalizedStatus = strtolower(str_replace(' ', '_', trim($status)));
    $statusMap = [
        'pending' => 'pending',
        'processing' => 'processing',
        'preparing' => 'processing',
        'shipped' => 'shipped',
        'ready' => 'ready',
        'delivered' => 'completed',
        'completed' => 'completed',
        'cancelled' => 'cancelled'
    ];
    $dbStatus = $statusMap[$normalizedStatus] ?? 'pending';
    $now = date('Y-m-d H:i:s');
    $timeUpdates = [];
    if (in_array($normalizedStatus, ['processing', 'preparing'], true)) {
        $timeUpdates[] = "processing_at = COALESCE(processing_at, '$now')";
    } elseif (in_array($normalizedStatus, ['shipped', 'ready'], true)) {
        $timeUpdates[] = "processing_at = COALESCE(processing_at, '$now')";
        $timeUpdates[] = "shipped_at = COALESCE(shipped_at, '$now')";
    } elseif (in_array($normalizedStatus, ['delivered', 'completed'], true)) {
        $timeUpdates[] = "processing_at = COALESCE(processing_at, '$now')";
        $timeUpdates[] = "shipped_at = COALESCE(shipped_at, '$now')";
        $timeUpdates[] = "delivered_at = COALESCE(delivered_at, '$now')";
        $timeUpdates[] = "completed_at = COALESCE(completed_at, '$now')";
    }
    $timeSql = empty($timeUpdates) ? '' : (', ' . implode(', ', $timeUpdates));
    $cleanOrderId = mysqli_real_escape_string($con, $orderId);
    $cleanDbStatus = mysqli_real_escape_string($con, $dbStatus);
    $updatedAny = false;

    if (tableExists($con, 'parts_orders')) {
        $whereList = [];
        if (columnExists($con, 'parts_orders', 'order_number')) $whereList[] = "order_number = '$cleanOrderId'";
        if (columnExists($con, 'parts_orders', 'order_no')) $whereList[] = "order_no = '$cleanOrderId'";
        if (columnExists($con, 'parts_orders', 'id') && intval($orderId) > 0) $whereList[] = "id = " . intval($orderId);
        if (!empty($whereList)) {
            $sql = "UPDATE parts_orders SET status = '$cleanDbStatus'$timeSql WHERE " . implode(' OR ', $whereList);
            if (mysqli_query($con, $sql)) $updatedAny = true;
        }
    }

    if (tableExists($con, 'bookings')) {
        $whereList = [];
        if (columnExists($con, 'bookings', 'booking_number')) $whereList[] = "booking_number = '$cleanOrderId'";
        if (columnExists($con, 'bookings', 'booking_no')) $whereList[] = "booking_no = '$cleanOrderId'";
        if (columnExists($con, 'bookings', 'id') && intval($orderId) > 0) $whereList[] = "id = " . intval($orderId);
        if (!empty($whereList)) {
            $sql = "UPDATE bookings SET status = '$cleanDbStatus'$timeSql WHERE " . implode(' OR ', $whereList);
            if (mysqli_query($con, $sql)) $updatedAny = true;
        }
    }

    if ($updatedAny) {
        return true;
    }

    $useLegacy = tableExists($con, 'job_parts') || tableExists($con, 'customer_statement');
    $cleanStatus = mysqli_real_escape_string($con, $status);
    
    if ($useLegacy) {
        $table = tableExists($con, 'job_parts') ? 'job_parts' : 'customer_statement';
        $idCol = 'id';
        if (columnExists($con, $table, 'order_no')) {
            $idCol = 'order_no';
        } else if (columnExists($con, $table, 'statement_no')) {
            $idCol = 'statement_no';
        } else if (columnExists($con, $table, 'invoice_no')) {
            $idCol = 'invoice_no';
        }
        $whereLegacy = ["`$idCol` = '$cleanOrderId'"];
        if (columnExists($con, $table, 'id') && $idCol !== 'id' && intval($orderId) > 0) {
            $whereLegacy[] = "id = " . intval($orderId);
        }
        $query = "UPDATE `$table` SET status = '$cleanStatus' WHERE " . implode(' OR ', $whereLegacy);
        return mysqli_query($con, $query);
    }
    return true;
}

function fetchPartsOrderItems($con, $orderId) {
    if (!tableExists($con, 'parts_order_items')) return [];
    $items = [];
    $result = mysqli_query(
        $con,
        "SELECT * FROM parts_order_items WHERE order_id = " . intval($orderId) . " ORDER BY id"
    );
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $items[] = [
            'id' => 'poi' . intval($row['id']),
            'name' => $row['name'],
            'category' => $row['category'] ?: 'part',
            'quantity' => intval($row['quantity']),
            'price' => floatval($row['unit_price']),
            'unitPrice' => floatval($row['unit_price']),
            'total' => floatval($row['total'])
        ];
    }
    return $items;
}

function customerPartsOrders($con, $auth) {
    if (!tableExists($con, 'parts_orders') || !tableExists($con, 'parts_order_items')) return [];

    $companyId = intval($auth['companyId']);
    $customerId = intval($auth['userId']);
    $isSuperadmin = !empty($auth['isSuperadmin']);
    $vehicleScope = customerVehicleAccessScope($con, $auth);
    if ($isSuperadmin) {
        $where = '';
    } elseif ($vehicleScope['scoped']) {
        if (!columnExists($con, 'parts_orders', 'customer_id')) return [];
        $where = " WHERE customer_id = $customerId";
    } else {
        $where = columnExists($con, 'parts_orders', 'company_id')
            ? " WHERE company_id = $companyId"
            : " WHERE customer_id = $customerId";
    }
    $orders = [];
    $result = mysqli_query($con, "SELECT * FROM parts_orders$where ORDER BY created_at DESC, id DESC");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $rawStatus = strtolower(str_replace(' ', '_', $row['status'] ?? 'pending'));
        $statusMap = ['processing' => 'preparing', 'shipped' => 'ready', 'delivered' => 'completed'];
        $appStatus = $statusMap[$rawStatus] ?? $rawStatus;
        $isPickup = ($row['fulfilment_method'] ?? 'delivery') === 'pickup';

        $placedAt = $row['created_at'] ?? date('Y-m-d H:i:s');
        $processingAt = $row['processing_at'] ?? (in_array($rawStatus, ['processing', 'preparing', 'shipped', 'ready', 'delivered', 'completed'], true) ? ($row['updated_at'] ?? $placedAt) : null);
        $shippedAt = $row['shipped_at'] ?? (in_array($rawStatus, ['shipped', 'ready', 'delivered', 'completed'], true) ? ($row['updated_at'] ?? $processingAt) : null);
        $completedAt = $row['completed_at'] ?? $row['delivered_at'] ?? (in_array($rawStatus, ['delivered', 'completed'], true) ? ($row['updated_at'] ?? $shippedAt) : null);

        $timeline = [
            [
                'id' => 'placed',
                'label' => 'Order placed',
                'date' => $placedAt,
                'completed' => true
            ],
            [
                'id' => 'processing',
                'label' => 'Processing',
                'date' => $processingAt,
                'completed' => in_array($rawStatus, ['processing', 'preparing', 'shipped', 'ready', 'delivered', 'completed'], true)
            ],
            [
                'id' => 'fulfilled',
                'label' => $isPickup ? 'Ready for pickup' : 'Dispatched',
                'date' => $shippedAt,
                'completed' => in_array($rawStatus, ['shipped', 'ready', 'delivered', 'completed'], true)
            ],
            [
                'id' => 'complete',
                'label' => 'Completed',
                'date' => $completedAt,
                'completed' => in_array($rawStatus, ['delivered', 'completed'], true)
            ]
        ];

        $orderItems = fetchPartsOrderItems($con, intval($row['id']));
        $invoiceItems = [];
        foreach ($orderItems as $it) {
            $invoiceItems[] = [
                'name' => $it['name'],
                'quantity' => floatval($it['quantity']),
                'unitPrice' => floatval($it['price']),
                'price' => floatval($it['price']) * floatval($it['quantity']),
            ];
        }
        $doNo = $row['autocount_do_no'] ?? '';
        $invoice = [
            'id' => 'po_' . $row['id'],
            'invoiceNo' => $doNo ?: $row['order_number'],
            'autocountDoNo' => $doNo,
            'source' => 'parts_order',
            'status' => in_array($rawStatus, ['delivered', 'completed'], true) ? 'paid' : 'issued',
            'invoiceDate' => substr($placedAt, 0, 10),
            'subtotal' => floatval($row['total']),
            'tax' => 0,
            'total' => floatval($row['total']),
            'balance' => in_array($rawStatus, ['delivered', 'completed'], true) ? 0 : floatval($row['total']),
            'items' => $invoiceItems
        ];

        $orders[] = [
            'id' => 'p' . intval($row['id']),
            'bookingNumber' => $row['order_number'],
            'invoiceNumber' => $doNo ?: $row['order_number'],
            'invoice' => $invoice,
            'orderType' => 'parts',
            'vehicleId' => null,
            'serviceType' => 'Spare Parts Order',
            'serviceDate' => $placedAt,
            'serviceCentre' => $row['service_centre'] ?? '',
            'status' => $appStatus,
            'totalPrice' => floatval($row['total']),
            'notes' => $row['notes'] ?? '',
            'deliveryAddress' => $row['delivery_address'] ?? '',
            'fulfilmentMethod' => $isPickup ? 'pickup' : 'delivery',
            'timeline' => $timeline,
            'processingAt' => $processingAt,
            'shippedAt' => $shippedAt,
            'completedAt' => $completedAt,
            'items' => $orderItems
        ];
    }
    return $orders;
}

function customerParts($con) {
    $parts = legacyParts($con);
    if ($parts === null && tableExists($con, 'spare_parts')) {
        $parts = [];
        $itemTypeWhere = columnExists($con, 'spare_parts', 'item_type') ? " AND item_type = 'part'" : '';
        $activeWhere = columnExists($con, 'spare_parts', 'is_active') ? ' AND is_active = 1' : '';
        $result = mysqli_query($con, "SELECT * FROM spare_parts WHERE in_stock = 1$itemTypeWhere$activeWhere ORDER BY name");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $parts[] = [
                'id' => 'sp' . intval($row['id']),
                'name' => $row['name'],
                'category' => $row['category'],
                'price' => floatval($row['price']),
                'image' => $row['image_url'] ?: '',
                'inStock' => boolval($row['in_stock']),
                'stock' => floatval($row['stock']),
                'itemType' => rowValue($row, ['item_type'], 'part'),
                'isActive' => boolval(rowValue($row, ['is_active'], 1))
            ];
        }
    }
    $parts = array_values(array_filter($parts ?: [], function ($part) {
        return ($part['itemType'] ?? 'part') === 'part'
            && ($part['isActive'] ?? true)
            && ($part['isStockItem'] ?? true)
            && floatval($part['price'] ?? 0) > 0;
    }));
    usort($parts, function ($a, $b) {
        $stockA = floatval($a['stock'] ?? ($a['inStock'] ? 1 : 0));
        $stockB = floatval($b['stock'] ?? ($b['inStock'] ? 1 : 0));
        if ($stockB !== $stockA) {
            return $stockB <=> $stockA;
        }
        return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
    });
    return array_map(function ($part) {
        return [
            'id' => strval($part['id']),
            'name' => $part['name'],
            'category' => $part['category'],
            'price' => floatval($part['price']),
            'image' => $part['image'] ?: '',
            'inStock' => boolval($part['inStock']),
            'stock' => floatval($part['stock'] ?? 0)
        ];
    }, $parts ?: []);
}

function autoCountPartsOrderSyncPayload($con, $orderId) {
    ensureSchema($con);
    $orderIdSql = mysqli_real_escape_string($con, strval($orderId));
    
    // Check parts_orders first
    if (tableExists($con, 'parts_orders')) {
        $res = mysqli_query($con, "SELECT po.*, c.name AS company_name, c.autocount_debtor_code 
                                   FROM parts_orders po 
                                   LEFT JOIN company c ON c.id = po.company_id 
                                   WHERE po.order_number = '$orderIdSql' OR po.id = " . intval($orderId) . " 
                                   LIMIT 1");
        if ($res && $row = mysqli_fetch_assoc($res)) {
            $items = [];
            $rawItems = fetchPartsOrderItems($con, intval($row['id']));
            foreach ($rawItems as $it) {
                $itemName = $it['name'];
                $itemNameSql = mysqli_real_escape_string($con, $itemName);
                $itemCode = '';
                $itemUom = 'UNIT';
                if (tableExists($con, 'parts')) {
                    $partMaster = scalarQuery($con, "SELECT autocount_item_code FROM `parts` WHERE (name = '$itemNameSql' OR part_number = '$itemNameSql' OR sku = '$itemNameSql') AND autocount_item_code IS NOT NULL AND autocount_item_code != '' LIMIT 1", 'autocount_item_code', '');
                    if ($partMaster) $itemCode = $partMaster;
                }
                if (!$itemCode && tableExists($con, 'Item')) {
                    $itemMaster = scalarQuery($con, "SELECT ItemCode FROM `Item` WHERE Description = '$itemNameSql' OR ItemCode = '$itemNameSql' LIMIT 1", 'ItemCode', '');
                    if ($itemMaster) $itemCode = $itemMaster;
                }
                if (!$itemCode && tableExists($con, 'spare_parts')) {
                    $partMaster = scalarQuery($con, "SELECT part_number FROM `spare_parts` WHERE name = '$itemNameSql' OR part_number = '$itemNameSql' LIMIT 1", 'part_number', '');
                    if ($partMaster) $itemCode = $partMaster;
                }
                // Non-stock / free-text items safely leave itemCode empty so AutoCount processes description-only line
                $qty = floatval($it['quantity']);
                $unitPrice = floatval($it['price'] ?? $it['unitPrice'] ?? 0);
                $amount = floatval($it['total'] ?? ($qty * $unitPrice));
                $items[] = [
                    'itemCode' => $itemCode,
                    'description' => $itemName,
                    'uom' => $itemUom,
                    'quantity' => $qty,
                    'unitPrice' => $unitPrice,
                    'amount' => $amount
                ];
            }
            return [
                'orderId' => $row['order_number'],
                'docType' => 'DO',
                'docDate' => substr($row['created_at'], 0, 10),
                'debtorCode' => $row['autocount_debtor_code'] ?: ($row['debtor_code'] ?? '300-C0001'),
                'customerName' => $row['company_name'] ?: 'Cash Customer',
                'deliveryAddress' => $row['delivery_address'] ?: '',
                'totalAmount' => floatval($row['total']),
                'items' => $items
            ];
        }
    }

    // Check bookings
    if (tableExists($con, 'bookings')) {
        $res = mysqli_query($con, "SELECT b.*, u.name AS customer_name, c.name AS company_name, c.autocount_debtor_code 
                                   FROM bookings b 
                                   LEFT JOIN users u ON u.id = b.user_id 
                                   LEFT JOIN company c ON c.id = u.company_id 
                                   WHERE b.booking_number = '$orderIdSql' OR b.id = " . intval($orderId) . " 
                                   LIMIT 1");
        if ($res && $row = mysqli_fetch_assoc($res)) {
            $items = [];
            $rawItems = fetchBookingItems($con, intval($row['id']));
            foreach ($rawItems as $it) {
                $itemName = $it['name'];
                $itemNameSql = mysqli_real_escape_string($con, $itemName);
                $itemCode = '';
                if (tableExists($con, 'parts')) {
                    $partMaster = scalarQuery($con, "SELECT autocount_item_code FROM `parts` WHERE (name = '$itemNameSql' OR part_number = '$itemNameSql' OR sku = '$itemNameSql') AND autocount_item_code IS NOT NULL AND autocount_item_code != '' LIMIT 1", 'autocount_item_code', '');
                    if ($partMaster) $itemCode = $partMaster;
                }
                if (!$itemCode && tableExists($con, 'Item')) {
                    $itemMaster = scalarQuery($con, "SELECT ItemCode FROM `Item` WHERE Description = '$itemNameSql' OR ItemCode = '$itemNameSql' LIMIT 1", 'ItemCode', '');
                    if ($itemMaster) $itemCode = $itemMaster;
                }
                if (!$itemCode && tableExists($con, 'spare_parts')) {
                    $partMaster = scalarQuery($con, "SELECT part_number FROM `spare_parts` WHERE name = '$itemNameSql' OR part_number = '$itemNameSql' LIMIT 1", 'part_number', '');
                    if ($partMaster) $itemCode = $partMaster;
                }
                // Non-stock / free-text items safely leave itemCode empty so AutoCount processes description-only line
                $qty = floatval($it['quantity']);
                $unitPrice = floatval($it['price'] ?? 0);
                $amount = round($qty * $unitPrice, 2);
                $items[] = [
                    'itemCode' => $itemCode,
                    'description' => $itemName,
                    'uom' => 'UNIT',
                    'quantity' => $qty,
                    'unitPrice' => $unitPrice,
                    'amount' => $amount
                ];
            }
            return [
                'orderId' => $row['booking_number'],
                'docType' => 'DO',
                'docDate' => substr($row['service_date'] ?: $row['created_at'], 0, 10),
                'debtorCode' => $row['autocount_debtor_code'] ?: '300-C0001',
                'customerName' => $row['company_name'] ?: ($row['customer_name'] ?: 'Cash Customer'),
                'deliveryAddress' => $row['delivery_address'] ?: '',
                'totalAmount' => floatval($row['total_price']),
                'items' => $items
            ];
        }
    }
    return null;
}

function enqueuePartsOrderAutoCountSync($con, $orderId) {
    ensureSchema($con);
    $payload = autoCountPartsOrderSyncPayload($con, $orderId);
    if (!$payload) return false;
    
    $cleanOrderId = mysqli_real_escape_string($con, $payload['orderId']);
    $cleanDebtor = mysqli_real_escape_string($con, $payload['debtorCode']);
    $cleanCustomer = mysqli_real_escape_string($con, $payload['customerName']);
    $cleanAddress = mysqli_real_escape_string($con, $payload['deliveryAddress']);
    $payloadJson = mysqli_real_escape_string($con, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    
    $sql = "INSERT INTO autocount_parts_order_sync_queue 
            (order_id, doc_type, debtor_code, customer_name, delivery_address, payload_json, operation, status) 
            VALUES ('$cleanOrderId', 'DO', '$cleanDebtor', '$cleanCustomer', '$cleanAddress', '$payloadJson', 'create', 'pending') 
            ON DUPLICATE KEY UPDATE 
            payload_json = '$payloadJson', status = 'pending', attempt_count = 0, locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()";
    
    $ok = mysqli_query($con, $sql);
    if ($ok) {
        if (tableExists($con, 'parts_orders')) {
            mysqli_query($con, "UPDATE parts_orders SET autocount_sync_status = 'pending' WHERE order_number = '$cleanOrderId' OR id = " . intval($orderId));
        }
        if (tableExists($con, 'bookings')) {
            mysqli_query($con, "UPDATE bookings SET autocount_sync_status = 'pending' WHERE booking_number = '$cleanOrderId' OR id = " . intval($orderId));
        }
    }
    return $ok;
}

function deductWorkOrderPartsInventory($con, $jobId) {
    $jobId = intval($jobId);
    if ($jobId <= 0) return false;

    if (columnExists($con, 'job', 'parts_deducted_at')) {
        $deductedAt = scalarQuery($con, "SELECT parts_deducted_at FROM job WHERE id = $jobId", 'parts_deducted_at', null);
        if (!empty($deductedAt)) return true; // Already deducted, prevent double deduction
    }

    $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if (!$partTable || !columnExists($con, $partTable, 'stock')) return false;

    if (tableExists($con, 'work_order_part_requirement')) {
        $reqResult = mysqli_query($con, "SELECT * FROM work_order_part_requirement WHERE work_order_id = $jobId");
        while ($reqResult && $row = mysqli_fetch_assoc($reqResult)) {
            $qty = floatval($row['required_quantity'] ?? 1);
            if ($qty <= 0) continue;
            $partId = intval($row['part_id'] ?? 0);
            $partCode = trim(strval($row['item_code'] ?? $row['part_code'] ?? $row['code'] ?? ''));
            $desc = trim(strval($row['description'] ?? ''));

            $whereClause = null;
            if ($partId > 0) {
                $whereClause = "id = $partId";
            } elseif ($partCode !== '') {
                $escapedCode = mysqli_real_escape_string($con, $partCode);
                $skuCol = firstColumn($con, $partTable, ['sku', 'code', 'part_number', 'item_code', 'part_no']);
                if ($skuCol) $whereClause = "UPPER(TRIM(`$skuCol`)) = UPPER(TRIM('$escapedCode'))";
            }

            if ($whereClause) {
                $inStockSql = columnExists($con, $partTable, 'in_stock') ? ", in_stock = IF(GREATEST(0, stock - $qty) > 0, 1, 0)" : "";
                mysqli_query($con, "UPDATE `$partTable` SET stock = GREATEST(0, stock - $qty)$inStockSql WHERE $whereClause");
            } elseif ($desc !== '') {
                $escapedDesc = mysqli_real_escape_string($con, $desc);
                $nameCol = firstColumn($con, $partTable, ['name', 'description', 'part_name', 'item_name']);
                if ($nameCol) {
                    $inStockSql = columnExists($con, $partTable, 'in_stock') ? ", in_stock = IF(GREATEST(0, stock - $qty) > 0, 1, 0)" : "";
                    mysqli_query($con, "UPDATE `$partTable` SET stock = GREATEST(0, stock - $qty)$inStockSql WHERE `$nameCol` = '$escapedDesc'");
                }
            }
        }
    }

    if (columnExists($con, 'job', 'parts_deducted_at')) {
        mysqli_query($con, "UPDATE job SET parts_deducted_at = NOW() WHERE id = $jobId");
    }
    return true;
}

function restoreWorkOrderPartsInventory($con, $jobId) {
    $jobId = intval($jobId);
    if ($jobId <= 0) return false;

    if (columnExists($con, 'job', 'parts_deducted_at')) {
        $deductedAt = scalarQuery($con, "SELECT parts_deducted_at FROM job WHERE id = $jobId", 'parts_deducted_at', null);
        if (empty($deductedAt)) return true; // Not deducted, nothing to restore
    }

    $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if (!$partTable || !columnExists($con, $partTable, 'stock')) return false;

    if (tableExists($con, 'work_order_part_requirement')) {
        $reqResult = mysqli_query($con, "SELECT * FROM work_order_part_requirement WHERE work_order_id = $jobId");
        while ($reqResult && $row = mysqli_fetch_assoc($reqResult)) {
            $qty = floatval($row['required_quantity'] ?? 1);
            if ($qty <= 0) continue;
            $partId = intval($row['part_id'] ?? 0);
            $partCode = trim(strval($row['item_code'] ?? $row['part_code'] ?? $row['code'] ?? ''));
            $desc = trim(strval($row['description'] ?? ''));

            $whereClause = null;
            if ($partId > 0) {
                $whereClause = "id = $partId";
            } elseif ($partCode !== '') {
                $escapedCode = mysqli_real_escape_string($con, $partCode);
                $skuCol = firstColumn($con, $partTable, ['sku', 'code', 'part_number', 'item_code', 'part_no']);
                if ($skuCol) $whereClause = "UPPER(TRIM(`$skuCol`)) = UPPER(TRIM('$escapedCode'))";
            }

            if ($whereClause) {
                $inStockSql = columnExists($con, $partTable, 'in_stock') ? ", in_stock = IF(stock + $qty > 0, 1, 0)" : "";
                mysqli_query($con, "UPDATE `$partTable` SET stock = stock + $qty$inStockSql WHERE $whereClause");
            } elseif ($desc !== '') {
                $escapedDesc = mysqli_real_escape_string($con, $desc);
                $nameCol = firstColumn($con, $partTable, ['name', 'description', 'part_name', 'item_name']);
                if ($nameCol) {
                    $inStockSql = columnExists($con, $partTable, 'in_stock') ? ", in_stock = IF(stock + $qty > 0, 1, 0)" : "";
                    mysqli_query($con, "UPDATE `$partTable` SET stock = stock + $qty$inStockSql WHERE `$nameCol` = '$escapedDesc'");
                }
            }
        }
    }

    if (columnExists($con, 'job', 'parts_deducted_at')) {
        mysqli_query($con, "UPDATE job SET parts_deducted_at = NULL WHERE id = $jobId");
    }
    return true;
}

/**
 * Handle parts and parts order routes.
 */
function handlePartsRoute($con, $mode, $inputData) {
    switch ($mode) {
        case 'admin-stock-groups':
            $groups = [];
            if (tableExists($con, 'autocount_stock_group')) {
                $result = mysqli_query(
                    $con,
                    "SELECT code, description, item_type, is_workshop_item, is_active
                     FROM autocount_stock_group
                     WHERE is_active = 1
                     ORDER BY code"
                );
                while ($result && $row = mysqli_fetch_assoc($result)) {
                    $groups[] = [
                        'code' => $row['code'],
                        'description' => $row['description'],
                        'itemType' => normalizeAdminItemType($row['item_type'] ?? '', $row['code']),
                        'isWorkshopItem' => !empty($row['is_workshop_item']),
                        'isActive' => !empty($row['is_active'])
                    ];
                }
            }
            sendResponse(true, 'AutoCount stock groups retrieved.', $groups);
            break;

        case 'admin-item-detail':
            if (!tableExists($con, 'Item')) {
                sendResponse(false, 'AutoCount Item master is unavailable.', null, 409);
            }
            $itemCode = trim(strval($inputData['itemCode'] ?? ''));
            if ($itemCode === '' || strlen($itemCode) > 100) {
                sendResponse(false, 'A valid AutoCount Item Code is required.', null, 422);
            }
            $safeItemCode = mysqli_real_escape_string($con, $itemCode);
            $itemResult = mysqli_query(
                $con,
                "SELECT * FROM `Item` WHERE `ItemCode` = '$safeItemCode' LIMIT 1"
            );
            if (!$itemResult) {
                sendResponse(false, 'Unable to load AutoCount Item details: ' . mysqli_error($con), null, 500);
            }
            $item = mysqli_fetch_assoc($itemResult);
            if (!$item) {
                sendResponse(false, 'This system-only part does not have an AutoCount Item master record.', null, 404);
            }
            $imageData = $item['Image'] ?? null;
            unset($item['Image']);
            if (!adminCanViewItemCost($con)) {
                unset($item['AssemblyCost']);
            }
            sendResponse(true, 'AutoCount Item details retrieved.', [
                'itemCode' => $item['ItemCode'],
                'fields' => $item,
                'image' => [
                    'hasImage' => is_string($imageData) && strlen($imageData) > 0,
                    'size' => is_string($imageData) ? strlen($imageData) : 0
                ]
            ]);
            break;

        case 'admin-parts':
            $legacyParts = legacyParts($con);
            if ($legacyParts !== null) {
                sendResponse(true, 'Admin parts retrieved', $legacyParts);
            }

            if (!tableExists($con, 'spare_parts')) {
                sendResponse(false, 'Parts inventory storage is unavailable.', null, 409);
            }
            $parts = [];
            $canViewCost = adminCanViewItemCost($con);
            $query = "SELECT * FROM spare_parts ORDER BY created_at DESC";
            $result = mysqli_query($con, $query);
            if (!$result) {
                sendResponse(false, 'Unable to load parts inventory: ' . mysqli_error($con), null, 500);
            }
            while ($result && $row = mysqli_fetch_assoc($result)) {
                $rawSup = trim(strval($row['supplier'] ?? ''));
                $supInfo = resolveSupplierInfo($con, $rawSup);
                $parts[] = [
                    'id' => intval($row['id']),
                    'name' => $row['name'],
                    'category' => $row['category'],
                    'sku' => $row['sku'] ?: 'SP-' . str_pad($row['id'], 4, '0', STR_PAD_LEFT),
                    'price' => floatval($row['price']),
                    'cost' => $canViewCost ? floatval(rowValue($row, ['cost_price', 'cost', 'standard_cost', 'unit_cost'], 0)) : null,
                    'uom' => rowValue($row, ['uom', 'unit', 'unit_of_measure'], ''),
                    'itemGroup' => rowValue($row, ['autocount_item_group', 'item_group', 'stock_group'], ''),
                    'itemType' => normalizeAdminItemType(rowValue($row, ['item_type'], ''), rowValue($row, ['autocount_item_group', 'item_group', 'stock_group'], '')),
                    'taxCode' => rowValue($row, ['tax_code'], ''),
                    'isStockItem' => boolval(rowValue($row, ['is_stock_item'], 1)),
                    'isActive' => boolval(rowValue($row, ['is_active'], 1)),
                    'stock' => floatval($row['stock']),
                    'lowStockThreshold' => floatval($row['low_stock_threshold']),
                    'supplier' => $supInfo['supplier'] ?: 'Mewah AutoWorks',
                    'supplierCode' => $supInfo['supplierCode'],
                    'supplierName' => $supInfo['supplierName'],
                    'image' => $row['image_url'],
                    'inStock' => $row['in_stock'] ? true : false
                ];
            }
            sendResponse(true, 'Admin parts retrieved', $parts);
            break;

        case 'admin-update-part':
            $partId = intval($inputData['id'] ?? 0);
            if ($partId <= 0) sendResponse(false, 'Part ID is required.', null, 400);
            $threshold = floatval($inputData['lowStockThreshold'] ?? 10);
            if ($threshold < 0) $threshold = 0;
            
            $table = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
            if (!$table) {
                sendResponse(false, 'Parts inventory storage is unavailable.', null, 404);
            }
            
            $thresholdCol = firstColumn($con, $table, ['low_stock_threshold', 'minimum_stock', 'min_stock', 'reorder_level']);
            if (!$thresholdCol) {
                ensureColumn($con, $table, 'low_stock_threshold', 'FLOAT DEFAULT 10');
                $thresholdCol = 'low_stock_threshold';
            }
            mysqli_query($con, "UPDATE `$table` SET `$thresholdCol` = $threshold WHERE id = $partId");
            sendResponse(true, 'Low stock threshold updated successfully.');
            break;

        case 'admin-part-stock-ledger':
            ensurePartStockTransactionsTable($con);
            $partId = intval($inputData['partId'] ?? $inputData['id'] ?? $_GET['partId'] ?? $_GET['id'] ?? 0);
            if ($partId <= 0) {
                sendResponse(false, 'Part ID is required.', null, 400);
            }

            $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
            if (!$partTable) {
                sendResponse(false, 'Parts inventory storage is unavailable.', null, 404);
            }

            $idCol = firstColumn($con, $partTable, ['id', 'part_id']);
            $skuCol = firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
            $nameCol = firstColumn($con, $partTable, ['name', 'part_name', 'title', 'item_name']);
            $stockCol = firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']);
            $costCol = firstColumn($con, $partTable, ['cost', 'cost_price', 'unit_cost', 'purchase_price']);
            $priceCol = firstColumn($con, $partTable, ['price', 'selling_price', 'unit_price']);
            $uomCol = firstColumn($con, $partTable, ['uom', 'unit', 'unit_of_measure']);
            $supplierCol = firstColumn($con, $partTable, ['supplier', 'vendor', 'supplier_name']);
            $supplierCodeCol = firstColumn($con, $partTable, ['supplier_code', 'creditor_code', 'vendor_code']);

            $partResult = mysqli_query($con, "SELECT * FROM `$partTable` WHERE `$idCol` = $partId LIMIT 1");
            $partRow = $partResult ? mysqli_fetch_assoc($partResult) : null;
            if (!$partRow) {
                sendResponse(false, 'Part record not found.', null, 404);
            }

            $supplierVal = $supplierCol ? strval($partRow[$supplierCol] ?? '') : '';
            $supplierCodeVal = $supplierCodeCol ? strval($partRow[$supplierCodeCol] ?? '') : '';
            $supInfo = resolveSupplierInfo($con, $supplierVal, $supplierCodeVal);

            $partInfo = [
                'id' => $partId,
                'sku' => strval($partRow[$skuCol] ?? ''),
                'name' => strval($partRow[$nameCol] ?? ''),
                'stock' => floatval($partRow[$stockCol] ?? 0),
                'cost' => $costCol ? floatval($partRow[$costCol] ?? 0) : 0,
                'price' => $priceCol ? floatval($partRow[$priceCol] ?? 0) : 0,
                'uom' => $uomCol ? strval($partRow[$uomCol] ?? 'UNIT') : 'UNIT',
                'supplier' => $supInfo['supplier'],
                'supplierCode' => $supInfo['supplierCode'],
                'supplierName' => $supInfo['supplierName'],
            ];

            // 1. Supplier Purchasing Intelligence Summary (from purchase orders & items)
            // Trace all suppliers who supplied this part by part_id OR SKU/item_code
            $purchasingSummary = [];
            $escSku = mysqli_real_escape_string($con, $partInfo['sku']);
            if (tableExists($con, 'purchase_order') && tableExists($con, 'purchase_order_item')) {
                $skuCondition = ($escSku !== '') ? "OR (poi.item_code IS NOT NULL AND poi.item_code != '' AND UPPER(TRIM(poi.item_code)) = UPPER(TRIM('$escSku')))" : "";
                $poQuery = "
                    SELECT 
                        COALESCE(TRIM(po.supplier_name), 'Unknown Supplier') AS supplier_name,
                        COALESCE(TRIM(po.supplier_code), '') AS supplier_code,
                        MAX(po.order_date) AS last_purchase_date,
                        SUBSTRING_INDEX(GROUP_CONCAT(poi.unit_cost ORDER BY po.order_date DESC, po.id DESC), ',', 1) AS last_unit_cost,
                        MIN(poi.unit_cost) AS lowest_unit_cost,
                        MAX(poi.unit_cost) AS highest_unit_cost,
                        SUM(COALESCE(poi.received_quantity, poi.quantity)) AS total_qty_purchased,
                        COUNT(DISTINCT po.id) AS total_po_count,
                        SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(po.autocount_po_no, po.internal_ref, CONCAT('PO-', po.id)) ORDER BY po.order_date DESC, po.id DESC), ',', 1) AS last_po_no
                    FROM purchase_order_item poi
                    JOIN purchase_order po ON po.id = poi.purchase_order_id
                    WHERE (poi.part_id = $partId $skuCondition)
                      AND po.status NOT IN ('cancelled', 'draft')
                    GROUP BY po.supplier_name, po.supplier_code
                    ORDER BY last_purchase_date DESC
                ";
                $poRes = mysqli_query($con, $poQuery);
                while ($poRes && $row = mysqli_fetch_assoc($poRes)) {
                    $poSup = resolveSupplierInfo($con, $row['supplier_name'], $row['supplier_code']);
                    $purchasingSummary[] = [
                        'supplierName' => $poSup['supplierName'] ?: $row['supplier_name'],
                        'supplierCode' => $poSup['supplierCode'] ?: $row['supplier_code'],
                        'lastPurchaseDate' => $row['last_purchase_date'],
                        'lastPurchasedAt' => $row['last_purchase_date'],
                        'lastUnitCost' => floatval($row['last_unit_cost']),
                        'lowestUnitCost' => floatval($row['lowest_unit_cost']),
                        'minUnitCost' => floatval($row['lowest_unit_cost']),
                        'highestUnitCost' => floatval($row['highest_unit_cost']),
                        'maxUnitCost' => floatval($row['highest_unit_cost']),
                        'totalQtyPurchased' => floatval($row['total_qty_purchased']),
                        'totalQuantityOrdered' => floatval($row['total_qty_purchased']),
                        'totalPoCount' => intval($row['total_po_count']),
                        'orderCount' => intval($row['total_po_count']),
                        'lastPoNo' => $row['last_po_no'],
                    ];
                }
            }

            // 2. Stock Ledger Transactions with Complete Counterparty & Operator Resolution
            $hasPo = tableExists($con, 'purchase_order');
            $hasCreditor = tableExists($con, 'Creditor');
            $hasAu = tableExists($con, 'admin_users');
            $hasStaff = tableExists($con, 'staff');
            $hasUsers = tableExists($con, 'users');

            $joinPo = $hasPo ? "LEFT JOIN purchase_order po ON (t.doc_type = 'PO' AND (po.id = t.doc_id OR (po.autocount_po_no IS NOT NULL AND po.autocount_po_no != '' AND po.autocount_po_no = t.doc_no) OR (po.internal_ref IS NOT NULL AND po.internal_ref != '' AND po.internal_ref = t.doc_no)))" : "";
            $joinCred = $hasCreditor ? ("LEFT JOIN Creditor c ON (c.AccNo = t.party_code OR c.CompanyName = t.party_name OR c.CompanyName = t.party_code" . ($hasPo ? " OR c.AccNo = po.supplier_code" : "") . ")") : "";
            $joinAu = $hasAu ? "LEFT JOIN admin_users au ON au.id = t.created_by" : "";
            $joinStaff = $hasStaff ? "LEFT JOIN staff st ON st.id = t.created_by" : "";
            $joinUsers = $hasUsers ? "LEFT JOIN users u ON u.id = t.created_by" : "";

            $transSql = "
                SELECT t.*,
                    COALESCE(NULLIF(t.party_name, ''), " . ($hasPo ? "po.supplier_name, " : "") . ($hasCreditor ? "c.CompanyName, " : "") . " '') AS resolved_party_name,
                    COALESCE(NULLIF(t.party_code, ''), " . ($hasPo ? "po.supplier_code, " : "") . ($hasCreditor ? "c.AccNo, " : "") . " '') AS resolved_party_code,
                    COALESCE(" . ($hasAu ? "au.display_name, au.username, " : "") . ($hasStaff ? "st.name, " : "") . ($hasUsers ? "u.name, " : "") . "'System') AS operator_name
                FROM `part_stock_transactions` t
                $joinPo
                $joinCred
                $joinAu
                $joinStaff
                $joinUsers
                WHERE t.part_id = $partId
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT 300
            ";

            $transactions = [];
            $transRes = mysqli_query($con, $transSql);
            while ($transRes && $tRow = mysqli_fetch_assoc($transRes)) {
                $rawPartyName = trim(strval($tRow['resolved_party_name'] ?: ($tRow['party_name'] ?? '')));
                $rawPartyCode = trim(strval($tRow['resolved_party_code'] ?: ($tRow['party_code'] ?? '')));
                $docTypeUpper = strtoupper(trim(strval($tRow['doc_type'] ?? '')));
                $txTypeStr = trim(strval($tRow['transaction_type'] ?? ''));

                $isSupplierTx = in_array($docTypeUpper, ['PO', 'OPENING', 'SUPPLIER', 'CREDITOR'], true)
                             || in_array($txTypeStr, ['po_receive', 'initial'], true);

                if ($isSupplierTx) {
                    $txSup = resolveSupplierInfo($con, $rawPartyName, $rawPartyCode);
                    $finalPartyName = $txSup['supplierName'] ?: $rawPartyName;
                    $finalPartyCode = $txSup['supplierCode'] ?: $rawPartyCode;
                } else {
                    $finalPartyName = $rawPartyName;
                    $finalPartyCode = $rawPartyCode;
                    if ($finalPartyName !== '' && preg_match('/^(.*?)\s*\(([^)]+)\)$/', $finalPartyName, $pm)) {
                        if ($finalPartyCode === '' || $finalPartyCode === $finalPartyName) {
                            $finalPartyName = trim($pm[1]);
                            $finalPartyCode = trim($pm[2]);
                        }
                    }
                }

                $transactions[] = [
                    'id' => intval($tRow['id']),
                    'partId' => intval($tRow['part_id']),
                    'transactionType' => $tRow['transaction_type'],
                    'docType' => $tRow['doc_type'],
                    'docId' => $tRow['doc_id'] !== null ? intval($tRow['doc_id']) : null,
                    'docNo' => $tRow['doc_no'],
                    'partyCode' => $finalPartyCode,
                    'partyName' => $finalPartyName,
                    'quantityChange' => floatval($tRow['quantity_change']),
                    'balanceAfter' => floatval($tRow['balance_after']),
                    'unitCost' => $tRow['unit_cost'] !== null ? floatval($tRow['unit_cost']) : null,
                    'notes' => $tRow['notes'] ?? '',
                    'operatorName' => $tRow['operator_name'] ?? 'System',
                    'createdBy' => $tRow['operator_name'] ?? 'System',
                    'createdAt' => $tRow['created_at'],
                ];
            }

            // Synthesize an opening baseline transaction if no transactions exist and current stock is positive
            if (empty($transactions) && $partInfo['stock'] > 0) {
                $transactions[] = [
                    'id' => 0,
                    'partId' => $partId,
                    'transactionType' => 'initial',
                    'docType' => 'OPENING',
                    'docId' => null,
                    'docNo' => 'INITIAL-STOCK',
                    'partyCode' => $partInfo['supplierCode'] ?: '',
                    'partyName' => $partInfo['supplierName'] ?: ($partInfo['supplier'] ?: 'System Baseline'),
                    'quantityChange' => $partInfo['stock'],
                    'balanceAfter' => $partInfo['stock'],
                    'unitCost' => $partInfo['cost'],
                    'notes' => 'Baseline opening balance upon system initialization / AutoCount synchronization',
                    'operatorName' => 'System',
                    'createdBy' => 'System',
                    'createdAt' => date('Y-m-d H:i:s'),
                ];
            }

            sendResponse(true, 'Stock ledger and purchasing history retrieved.', [
                'part' => $partInfo,
                'purchasingSummary' => $purchasingSummary,
                'transactions' => $transactions,
            ]);
            break;

        case 'admin-adjust-part-stock':
            ensurePartStockTransactionsTable($con);
            $partId = intval($inputData['partId'] ?? $inputData['id'] ?? 0);
            if ($partId <= 0) {
                sendResponse(false, 'Part ID is required.', null, 400);
            }
            if (!array_key_exists('newStock', $inputData) || !is_numeric($inputData['newStock'])) {
                sendResponse(false, 'Valid new physical stock quantity is required.', null, 422);
            }
            $newStock = floatval($inputData['newStock']);
            if ($newStock < 0) {
                sendResponse(false, 'Stock quantity cannot be negative.', null, 422);
            }
            $reason = trim(strval($inputData['reason'] ?? ''));
            if ($reason === '') {
                sendResponse(false, 'Stock adjustment reason is mandatory.', null, 422);
            }
            $notes = trim(strval($inputData['notes'] ?? ''));

            $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
            if (!$partTable) {
                sendResponse(false, 'Parts inventory storage is unavailable.', null, 404);
            }
            $idCol = firstColumn($con, $partTable, ['id', 'part_id']);
            $stockCol = firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']);
            $costCol = firstColumn($con, $partTable, ['cost', 'cost_price', 'unit_cost', 'purchase_price']);

            mysqli_begin_transaction($con);
            try {
                $lockRes = mysqli_query($con, "SELECT `$stockCol` AS stock, " . ($costCol ? "`$costCol` AS cost" : "0 AS cost") . " FROM `$partTable` WHERE `$idCol` = $partId FOR UPDATE");
                $currentPart = $lockRes ? mysqli_fetch_assoc($lockRes) : null;
                if (!$currentPart) {
                    throw new Exception('Part record not found.', 404);
                }
                $oldStock = floatval($currentPart['stock'] ?? 0);
                $unitCost = floatval($currentPart['cost'] ?? 0);
                $delta = round($newStock - $oldStock, 2);

                if (abs($delta) < 0.001) {
                    mysqli_commit($con);
                    sendResponse(true, 'Stock unchanged.', ['stock' => $newStock]);
                }

                if (!mysqli_query($con, "UPDATE `$partTable` SET `$stockCol` = $newStock WHERE `$idCol` = $partId")) {
                    throw new Exception('Failed to update stock balance: ' . mysqli_error($con), 500);
                }

                $adjDocNo = 'ADJ-' . date('Ymd-His');
                $fullNotes = $reason . ($notes !== '' ? ' · ' . $notes : '');
                recordPartStockTransaction($con, [
                    'part_id' => $partId,
                    'transaction_type' => 'manual_adjust',
                    'doc_type' => 'ADJ',
                    'doc_id' => null,
                    'doc_no' => $adjDocNo,
                    'party_code' => null,
                    'party_name' => 'Physical Inventory Audit',
                    'quantity_change' => $delta,
                    'balance_after' => $newStock,
                    'unit_cost' => $unitCost,
                    'notes' => $fullNotes,
                    'created_by' => $_SESSION['admin_id'] ?? null,
                ]);

                mysqli_commit($con);
                sendResponse(true, "Stock successfully adjusted from $oldStock to $newStock.", [
                    'partId' => $partId,
                    'oldStock' => $oldStock,
                    'newStock' => $newStock,
                    'delta' => $delta,
                ]);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, $e->getMessage(), null, $e->getCode() ?: 500);
            }
            break;

        case 'admin-import-parts':
        case 'admin-create-part':
        case 'admin-delete-part':
            sendResponse(false, 'Parts, pricing, and master stock quantities are synchronized from AutoCount ERP.', null, 403);
            break;

        case 'admin-orders':
            $legacyOrders = legacyOrders($con);
            if ($legacyOrders !== null) {
                sendResponse(true, 'Admin orders retrieved', $legacyOrders);
            }

            $orders = [];
            $query = "SELECT b.*, u.name AS customer_name
                      FROM bookings b
                      JOIN users u ON b.user_id = u.id
                      WHERE b.order_type = 'parts'
                      ORDER BY b.service_date DESC";
            $result = mysqli_query($con, $query);
            while ($result && $row = mysqli_fetch_assoc($result)) {
                $orders[] = [
                    'id' => $row['booking_number'],
                    'customer' => $row['customer_name'],
                    'items' => fetchBookingItems($con, intval($row['id'])),
                    'total' => floatval($row['total_price']),
                    'status' => toAdminOrderStatus($row['status']),
                    'orderDate' => substr($row['service_date'], 0, 10),
                    'deliveryAddress' => $row['delivery_address'] ?: '-',
                    'autocountDoNo' => $row['autocount_do_no'] ?? '',
                    'autocountSyncStatus' => $row['autocount_sync_status'] ?? 'not_queued',
                    'autocountSyncAt' => $row['autocount_sync_at'] ?? null
                ];
            }
            sendResponse(true, 'Admin orders retrieved', $orders);
            break;

        case 'admin-update-order-status':
            $orderId = $inputData['id'] ?? $inputData['orderId'] ?? $inputData['order_id'] ?? '';
            $status = $inputData['status'] ?? 'Pending';
            if (!$orderId) {
                sendResponse(false, 'Order ID is required', null, 400);
            }
            if (updateAdminOrderStatus($con, $orderId, $status)) {
                $orderIdSql = mysqli_real_escape_string($con, $orderId);
                $statusLabel = trim(strval($status));
                $statusMessage = "Order $orderId is now $statusLabel.";
                $statusNotificationCreated = false;
                if (in_array(strtolower($status), ['processing', 'shipped', 'delivered', 'completed'], true)) {
                    enqueuePartsOrderAutoCountSync($con, $orderId);
                }
                if (tableExists($con, 'parts_orders')) {
                    $selWhere = ["order_number = '$orderIdSql'"];
                    if (columnExists($con, 'parts_orders', 'order_no')) $selWhere[] = "order_no = '$orderIdSql'";
                    if (columnExists($con, 'parts_orders', 'id') && intval($orderId) > 0) $selWhere[] = "id = " . intval($orderId);
                    $orderResult = mysqli_query(
                        $con,
                        "SELECT * FROM parts_orders
                         WHERE " . implode(' OR ', $selWhere) . "
                         LIMIT 1"
                    );
                    $orderRow = $orderResult ? mysqli_fetch_assoc($orderResult) : null;
                    if ($orderRow) {
                        $statusNotificationCreated = createCustomerRecordNotification(
                            $con,
                            tableExists($con, 'customer') ? 'customer' : 'users',
                            intval($orderRow['company_id'] ?? 0),
                            intval($orderRow['customer_id'] ?? 0),
                            'Parts order updated',
                            $statusMessage,
                            'parts',
                            'parts_order',
                            'p' . intval($orderRow['id']),
                            '/parts-order/p' . intval($orderRow['id'])
                        );
                    }
                }
                if (!$statusNotificationCreated && tableExists($con, 'bookings') && tableExists($con, 'users')) {
                    $orderResult = mysqli_query(
                        $con,
                        "SELECT b.id, b.user_id, u.company_id
                         FROM bookings b
                         JOIN users u ON u.id = b.user_id
                         WHERE b.order_type = 'parts'
                           AND (b.booking_number = '$orderIdSql' OR b.id = " . intval($orderId) . ")
                         LIMIT 1"
                    );
                    $orderRow = $orderResult ? mysqli_fetch_assoc($orderResult) : null;
                    if ($orderRow) {
                        createCustomerRecordNotification(
                            $con,
                            'users',
                            intval($orderRow['company_id'] ?? 0),
                            intval($orderRow['user_id'] ?? 0),
                            'Parts order updated',
                            $statusMessage,
                            'parts',
                            'parts_order',
                            'p' . intval($orderRow['id']),
                            '/parts-order/p' . intval($orderRow['id'])
                        );
                    }
                }
                sendResponse(true, 'Order status updated successfully', ['id' => $orderId, 'status' => $status]);
            }
            sendResponse(false, 'Failed to update order status: ' . mysqli_error($con), null, 500);
            break;

        case 'admin-batch-sync-parts-orders':
            $orderIds = $inputData['orderIds'] ?? [];
            if (!is_array($orderIds) || empty($orderIds)) {
                sendResponse(false, 'Please select at least one parts order to sync.', null, 400);
            }
            $count = 0;
            foreach ($orderIds as $oid) {
                if (enqueuePartsOrderAutoCountSync($con, $oid)) {
                    $count++;
                }
            }
            sendResponse(true, "$count parts order(s) queued for AutoCount sync.", ['count' => $count]);
            break;

        case 'sync-pull-autocount-parts-order':
            requireAutoCountSyncToken();
            ensureSchema($con);
            if (!tableExists($con, 'autocount_parts_order_sync_queue')) sendResponse(false, 'Apply migration 034_parts_order_autocount_do_queue.sql.', null, 409);
            mysqli_query($con, "UPDATE autocount_parts_order_sync_queue SET status = 'pending', locked_at = NULL WHERE status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
            mysqli_begin_transaction($con);
            $queueResult = mysqli_query($con, "SELECT * FROM autocount_parts_order_sync_queue WHERE status = 'pending' ORDER BY created_at, id LIMIT 1 FOR UPDATE");
            $queue = $queueResult ? mysqli_fetch_assoc($queueResult) : null;
            if (!$queue) {
                mysqli_commit($con);
                sendResponse(true, 'No queued AutoCount Parts Orders / DO.', null);
            }
            $queueId = intval($queue['id']);
            $orderId = $queue['order_id'];
            $cleanOrderId = mysqli_real_escape_string($con, $orderId);
            if (!mysqli_query($con, "UPDATE autocount_parts_order_sync_queue SET status = 'processing', attempt_count = attempt_count + 1, locked_at = NOW() WHERE id = $queueId")) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to lock Parts Order sync item.', null, 500);
            }
            if (tableExists($con, 'parts_orders')) mysqli_query($con, "UPDATE parts_orders SET autocount_sync_status = 'processing' WHERE order_number = '$cleanOrderId' OR id = " . intval($orderId));
            if (tableExists($con, 'bookings')) mysqli_query($con, "UPDATE bookings SET autocount_sync_status = 'processing' WHERE booking_number = '$cleanOrderId' OR id = " . intval($orderId));
            if (tableExists($con, 'work_order_invoice')) mysqli_query($con, "UPDATE work_order_invoice SET sync_status = 'processing', sync_error = NULL WHERE internal_ref = '$cleanOrderId' OR invoice_no = '$cleanOrderId' OR id = " . intval($orderId));
            mysqli_commit($con);
            $payload = json_decode($queue['payload_json'] ?? '{}', true) ?: autoCountPartsOrderSyncPayload($con, $orderId);
            if (!$payload) sendResponse(false, 'Queued Parts Order is unavailable.', null, 409);
            sendResponse(true, 'AutoCount Parts Order DO ready.', ['queueId' => $queueId, 'operation' => $queue['operation'], 'partsOrder' => $payload]);
            break;

        case 'sync-ack-autocount-parts-order':
            requireAutoCountSyncToken();
            ensureSchema($con);
            $queueId = intval($inputData['queueId'] ?? 0);
            $success = filter_var($inputData['success'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $queueResult = mysqli_query($con, "SELECT * FROM autocount_parts_order_sync_queue WHERE id = $queueId LIMIT 1");
            $queue = $queueResult ? mysqli_fetch_assoc($queueResult) : null;
            if (!$queue) sendResponse(false, 'Parts Order sync queue item not found.', null, 404);
            $orderId = $queue['order_id'];
            $cleanOrderId = mysqli_real_escape_string($con, $orderId);
            $responseJson = mysqli_real_escape_string($con, json_encode($inputData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            if (!$success) {
                $message = substr(trim(strval($inputData['error'] ?? 'AutoCount rejected the Parts Order DO.')), 0, 5000);
                $errorSql = mysqli_real_escape_string($con, $message);
                mysqli_query($con, "UPDATE autocount_parts_order_sync_queue SET status = 'failed', error_message = '$errorSql', response_payload = '$responseJson', locked_at = NULL WHERE id = $queueId");
                if (tableExists($con, 'parts_orders')) mysqli_query($con, "UPDATE parts_orders SET autocount_sync_status = 'failed' WHERE order_number = '$cleanOrderId' OR id = " . intval($orderId));
                if (tableExists($con, 'bookings')) mysqli_query($con, "UPDATE bookings SET autocount_sync_status = 'failed' WHERE booking_number = '$cleanOrderId' OR id = " . intval($orderId));
                if (tableExists($con, 'work_order_invoice')) mysqli_query($con, "UPDATE work_order_invoice SET sync_status = 'failed', sync_error = '$errorSql' WHERE internal_ref = '$cleanOrderId' OR invoice_no = '$cleanOrderId' OR id = " . intval($orderId));
                sendResponse(true, 'Parts Order DO sync failure recorded.', ['orderId' => $orderId]);
            }
            $doNoValue = strtoupper(trim(strval($inputData['autocountDoNo'] ?? $inputData['docNo'] ?? '')));
            if ($doNoValue === '' || strlen($doNoValue) > 60) sendResponse(false, 'AutoCount Delivery Order (DO) No. is required.', null, 400);
            $doNo = mysqli_real_escape_string($con, $doNoValue);
            mysqli_begin_transaction($con);
            try {
                if (tableExists($con, 'parts_orders')) {
                    mysqli_query($con, "UPDATE parts_orders SET autocount_do_no = '$doNo', autocount_sync_status = 'synced', autocount_sync_at = NOW() WHERE order_number = '$cleanOrderId' OR id = " . intval($orderId));
                }
                if (tableExists($con, 'bookings')) {
                    mysqli_query($con, "UPDATE bookings SET autocount_do_no = '$doNo', autocount_sync_status = 'synced', autocount_sync_at = NOW() WHERE booking_number = '$cleanOrderId' OR id = " . intval($orderId));
                }
                if (tableExists($con, 'work_order_invoice')) {
                    mysqli_query($con, "UPDATE work_order_invoice SET autocount_do_no = '$doNo', status = 'issued', sync_status = 'synced', synced_at = NOW(), issued_at = COALESCE(issued_at, NOW()), sync_error = NULL WHERE internal_ref = '$cleanOrderId' OR invoice_no = '$cleanOrderId' OR id = " . intval($orderId));
                }
                if (!mysqli_query($con, "UPDATE autocount_parts_order_sync_queue SET status = 'succeeded', completed_at = NOW(), locked_at = NULL, error_message = NULL, response_payload = '$responseJson' WHERE id = $queueId")) throw new Exception(mysqli_error($con), 500);
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to record AutoCount Parts Order DO result: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, 'AutoCount Parts Order DO sync completed.', ['orderId' => $orderId, 'autocountDoNo' => $doNoValue]);
            break;

        case 'customer-create-parts-order':
            $auth = requireCustomerSession();
            ensureSchema($con);
            $useUnifiedOrderStorage = tableExists($con, 'bookings') && tableExists($con, 'booking_items');
            $partsTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
            if (!$partsTable) {
                sendResponse(
                    false,
                    'Parts inventory storage is unavailable. Apply migration 010_parts_inventory_fields.sql.',
                    null,
                    409
                );
            }
            $partNameColumn = firstColumn($con, $partsTable, ['name', 'part_name', 'title']);
            $partPriceColumn = firstColumn($con, $partsTable, ['price', 'selling_price', 'unit_price']);
            $partStockColumn = firstColumn(
                $con,
                $partsTable,
                ['stock', 'quantity', 'qty', 'stock_quantity', 'current_stock', 'qty_on_hand', 'on_hand', 'balance']
            );
            $partInStockColumn = firstColumn($con, $partsTable, ['in_stock', 'is_available', 'available']);
            if (!$partNameColumn || !$partPriceColumn || !$partStockColumn) {
                sendResponse(
                    false,
                    'Parts inventory storage is incomplete. Apply migration 010_parts_inventory_fields.sql.',
                    null,
                    409
                );
            }
            $items = $inputData['items'] ?? [];
            $fulfilmentMethod = strtolower(trim($inputData['fulfilmentMethod'] ?? 'delivery'));
            if (!in_array($fulfilmentMethod, ['delivery', 'pickup'], true)) {
                sendResponse(false, 'Select delivery or pickup.', null, 422);
            }
            $deliveryAddress = trim($inputData['deliveryAddress'] ?? '');
            $serviceCentre = 'Customer Parts Order';
            if ($fulfilmentMethod === 'pickup') {
                $requestedCentre = trim($inputData['serviceCentre'] ?? '');
                $matchedCentre = null;
                foreach (customerServiceCentres() as $centre) {
                    if (($centre['name'] ?? '') === $requestedCentre) {
                        $matchedCentre = $centre;
                        break;
                    }
                }
                if (!$matchedCentre) {
                    sendResponse(false, 'Select a valid pickup branch.', null, 422);
                }
                $serviceCentre = $matchedCentre['name'];
                $deliveryAddress = $matchedCentre['address'];
            }
            if (!is_array($items) || count($items) === 0 || $deliveryAddress === '') {
                sendResponse(false, 'Order items and delivery or collection details are required.', null, 422);
            }
            $validatedItems = [];
            $calculatedTotal = 0;
            foreach ($items as $item) {
                $partId = intval(preg_replace('/\D+/', '', strval($item['id'] ?? '')));
                $quantity = intval($item['quantity'] ?? 0);
                if ($partId <= 0 || $quantity <= 0) sendResponse(false, 'Invalid order item.', null, 422);
                $partAvailabilitySelect = $partInStockColumn
                    ? "`$partInStockColumn` AS in_stock"
                    : "1 AS in_stock";
                $partResult = mysqli_query(
                    $con,
                    "SELECT id,
                            `$partNameColumn` AS name,
                            `$partPriceColumn` AS price,
                            `$partStockColumn` AS stock,
                            $partAvailabilitySelect
                     FROM `$partsTable`
                     WHERE id = $partId
                     LIMIT 1"
                );
                $part = $partResult ? mysqli_fetch_assoc($partResult) : null;
                if (!$part || !$part['in_stock'] || intval($part['stock']) < $quantity) {
                    sendResponse(false, 'A selected part is unavailable in the requested quantity.', null, 409);
                }
                $unitPrice = floatval($part['price']);
                $calculatedTotal += $unitPrice * $quantity;
                $validatedItems[] = ['id' => $partId, 'name' => $part['name'], 'quantity' => $quantity, 'price' => $unitPrice];
            }
            $bookingNumber = 'ORD-' . date('YmdHis') . '-' . random_int(100, 999);
            $bookingNumberSql = mysqli_real_escape_string($con, $bookingNumber);
            $addressSql = mysqli_real_escape_string($con, $deliveryAddress);
            $serviceCentreSql = mysqli_real_escape_string($con, $serviceCentre);
            $notesSql = mysqli_real_escape_string($con, trim($inputData['notes'] ?? ''));
            $userId = intval($auth['userId']);
            if ($useUnifiedOrderStorage && !empty($auth['isSuperadmin'])) {
                $userResult = mysqli_query(
                    $con,
                    "SELECT id FROM users WHERE role = 'customer' ORDER BY id LIMIT 1"
                );
                $userRow = $userResult ? mysqli_fetch_assoc($userResult) : null;
                $userId = intval($userRow['id'] ?? 0);
                if ($userId <= 0) {
                    sendResponse(false, 'No customer account is available for the parts order.', null, 409);
                }
            }
            mysqli_begin_transaction($con);
            try {
                if ($useUnifiedOrderStorage) {
                    $query = "INSERT INTO bookings (booking_number, order_type, user_id, vehicle_id, service_date, service_centre, status, total_price, notes, delivery_address, subtotal)
                              VALUES ('$bookingNumberSql', 'parts', $userId, NULL, NOW(), '$serviceCentreSql', 'pending', $calculatedTotal, '$notesSql', '$addressSql', $calculatedTotal)";
                    if (!mysqli_query($con, $query)) throw new Exception('order insert failed');
                    $orderId = mysqli_insert_id($con);
                    foreach ($validatedItems as $item) {
                        $nameSql = mysqli_real_escape_string($con, $item['name']);
                        $lineTotal = $item['price'] * $item['quantity'];
                        if (!mysqli_query($con, "INSERT INTO booking_items (booking_id, name, category, quantity, unit_price, total)
                            VALUES ($orderId, '$nameSql', 'part', {$item['quantity']}, {$item['price']}, $lineTotal)")) {
                            throw new Exception('order item insert failed');
                        }
                    }
                } else {
                    $companyId = intval($auth['companyId']);
                    $methodSql = mysqli_real_escape_string($con, $fulfilmentMethod);
                    $query = "INSERT INTO parts_orders
                              (order_number, customer_id, company_id, fulfilment_method, service_centre, delivery_address, status, subtotal, total, notes)
                              VALUES
                              ('$bookingNumberSql', $userId, $companyId, '$methodSql', '$serviceCentreSql', '$addressSql', 'pending', $calculatedTotal, $calculatedTotal, '$notesSql')";
                    if (!mysqli_query($con, $query)) throw new Exception('legacy order insert failed');
                    $orderId = mysqli_insert_id($con);
                    foreach ($validatedItems as $item) {
                        $nameSql = mysqli_real_escape_string($con, $item['name']);
                        $lineTotal = $item['price'] * $item['quantity'];
                        if (!mysqli_query($con, "INSERT INTO parts_order_items
                            (order_id, part_id, name, category, quantity, unit_price, total)
                            VALUES
                            ($orderId, {$item['id']}, '$nameSql', 'part', {$item['quantity']}, {$item['price']}, $lineTotal)")) {
                            throw new Exception('legacy order item insert failed');
                        }
                    }
                }
                foreach ($validatedItems as $item) {
                    $quantity = intval($item['quantity']);
                    $availabilityUpdate = $partInStockColumn
                        ? ", `$partInStockColumn` = IF(`$partStockColumn` - $quantity > 0, 1, 0)"
                        : '';
                    $stockQuery = "UPDATE `$partsTable`
                                   SET `$partStockColumn` = `$partStockColumn` - $quantity$availabilityUpdate
                                   WHERE id = " . intval($item['id']) . "
                                     AND `$partStockColumn` >= $quantity";
                    if (!mysqli_query($con, $stockQuery) || mysqli_affected_rows($con) !== 1) {
                        throw new Exception('part stock update failed');
                    }
                }
                mysqli_commit($con);
                createCustomerRecordNotification(
                    $con,
                    $auth['source'],
                    intval($auth['companyId']),
                    $userId,
                    'Parts order received',
                    "$bookingNumber has been placed successfully.",
                    'parts',
                    'parts_order',
                    'p' . intval($orderId),
                    '/parts-order/p' . intval($orderId)
                );
            } catch (Throwable $error) {
                mysqli_rollback($con);
                error_log('Customer parts order failed: ' . $error->getMessage());
                sendResponse(false, 'Unable to place parts order.', null, 500);
            }
            sendResponse(true, 'Parts order placed.', [
                'id' => 'p' . $orderId,
                'bookingNumber' => $bookingNumber,
                'orderType' => 'parts',
                'serviceDate' => date(DATE_ATOM),
                'status' => 'pending',
                'totalPrice' => $calculatedTotal,
                'serviceCentre' => $serviceCentre,
                'deliveryAddress' => $deliveryAddress,
                'fulfilmentMethod' => $fulfilmentMethod,
                'notes' => trim($inputData['notes'] ?? ''),
                'items' => $validatedItems
            ], 201);
            break;

        case 'get-parts':
            sendResponse(true, 'Spare parts retrieved', customerParts($con));
            break;

        default:
            sendResponse(false, "Unsupported parts action: $mode", null, 400);
            break;
    }
}

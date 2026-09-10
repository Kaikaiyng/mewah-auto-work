<?php
// Authenticated AutoCount invoice PDF receiver.
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function uploadResponse($ok, $payload, $status = 200) {
    http_response_code($status);
    echo json_encode($ok
        ? array_merge(['ok' => true], $payload)
        : ['ok' => false, 'error' => strval($payload)]
    );
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    uploadResponse(false, 'Method not allowed', 405);
}

$expectedToken = trim(strval(getenv('MAW_AUTOCOUNT_SYNC_TOKEN') ?: ''));
$providedToken = trim(strval($_SERVER['HTTP_X_SYNC_TOKEN'] ?? ''));
$authorization = trim(strval($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
if ($providedToken === '' && stripos($authorization, 'Bearer ') === 0) {
    $providedToken = trim(substr($authorization, 7));
}
if ($expectedToken === '') {
    uploadResponse(false, 'Upload service is not configured', 503);
}
if ($providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
    uploadResponse(false, 'Invalid sync token', 401);
}

if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf'])) {
    uploadResponse(false, 'PDF file is required', 422);
}

$upload = $_FILES['pdf'];
if (intval($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    uploadResponse(false, 'PDF upload failed', 422);
}

$temporaryPath = strval($upload['tmp_name'] ?? '');
$size = intval($upload['size'] ?? 0);
if ($temporaryPath === '' || !is_uploaded_file($temporaryPath)) {
    uploadResponse(false, 'Invalid uploaded file', 422);
}
if ($size < 5 || $size > 12 * 1024 * 1024) {
    uploadResponse(false, 'PDF must be between 5 bytes and 12 MB', 413);
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = strval($finfo->file($temporaryPath));
if ($mimeType !== 'application/pdf') {
    uploadResponse(false, 'Only PDF files are accepted', 415);
}

$signatureHandle = fopen($temporaryPath, 'rb');
$signature = $signatureHandle ? fread($signatureHandle, 5) : '';
if ($signatureHandle) fclose($signatureHandle);
if ($signature !== '%PDF-') {
    uploadResponse(false, 'Invalid PDF signature', 415);
}

$docNo = trim(strval($_POST['docNo'] ?? ''));
if ($docNo === '' || strlen($docNo) > 80) {
    uploadResponse(false, 'A valid document number is required', 422);
}
$safeDocNo = trim(preg_replace('/[^A-Za-z0-9._-]+/', '-', $docNo), '-_.');
if ($safeDocNo === '') $safeDocNo = 'invoice';

$yearMonth = date('Y/m');
$storageDirectory = __DIR__ . '/invoices/' . $yearMonth;
if (!is_dir($storageDirectory) && !mkdir($storageDirectory, 0750, true)) {
    uploadResponse(false, 'Unable to prepare invoice storage', 500);
}

$fileName = $safeDocNo . '-' . bin2hex(random_bytes(12)) . '.pdf';
$destination = $storageDirectory . '/' . $fileName;
if (!move_uploaded_file($temporaryPath, $destination)) {
    uploadResponse(false, 'Unable to store PDF', 500);
}
chmod($destination, 0640);

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = strval($_SERVER['HTTP_HOST'] ?? '');
$scriptDirectory = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/uploads')), '/');
$relativeUrl = $scriptDirectory . '/invoices/' . $yearMonth . '/' . rawurlencode($fileName);
$configuredBaseUrl = rtrim(strval(getenv('MAW_PUBLIC_BASE_URL') ?: ''), '/');
$url = $configuredBaseUrl !== ''
    ? $configuredBaseUrl . $relativeUrl
    : $scheme . '://' . $host . $relativeUrl;

uploadResponse(true, [
    'url' => $url,
    'docNo' => $docNo,
]);

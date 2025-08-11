<?php

use Koriym\AppStateDiagram\Asd;

$profileData = urldecode($_GET['profile']);

// Validate input format (JSON/XML)
if (json_decode($profileData) !== null) {
    $contentType = 'application/json';
    $fileExtension = '.json';
} else {
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($profileData);
    if ($xml !== false) {
        $contentType = 'application/xml';
        $fileExtension = '.xml';
    } else {
        http_response_code(400);
        var_dump(libxml_get_errors());
        echo json_encode([
            'error' => 'Invalid profile format',
            'details' => 'Profile must be valid JSON or XML'
        ]);
        exit;
    }
}

// Validate data size (max 10KB for URL parameters)
if (strlen($profileData) > 10240) {
    http_response_code(413);
    echo json_encode([
        'error' => 'Payload too large',
        'max_size' => '10KB'
    ]);
    exit;
}

// Create temporary file
$tempDir = sys_get_temp_dir();
$tempFile = tempnam($tempDir, 'alps_profile_');
$tempFileWithExtension = $tempFile . $fileExtension;
rename($tempFile, $tempFileWithExtension);

if (file_put_contents($tempFileWithExtension, $profileData) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to create temporary file']);
    exit;
}

try {
    $asd = new Asd();
    $diagram = $asd($tempFileWithExtension);
    
    // Return both original profile and generated diagram
    echo json_encode([
        'profile' => $profileData,
        'diagram' => $diagram
    ]);
    
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'ALPS processing failed',
        'message' => $e->getMessage(),
        'input' => $profileData
    ]);
}

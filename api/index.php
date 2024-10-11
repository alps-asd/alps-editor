<?php

use Koriym\AlpsEditor\InvalidXsdMessage;
use Koriym\AppStateDiagram\Asd;
use Koriym\AppStateDiagram\Exception\DescriptorNotFoundException;
use Koriym\XmlLoader\Exception\InvalidXmlException;

require dirname(__DIR__) . '/vendor/autoload.php';

// Get the request's Content-Type header
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

// Set the directory for temporary files (make sure you have the appropriate permissions)
$tempDir = sys_get_temp_dir();

// Branch processing based on Content-Type
if (strpos($contentType, 'application/xml') !== false) {
    // XML
    $data = file_get_contents('php://input');
    $fileExtension = '.xml';
    $contentDescription = 'XML';
} elseif (strpos($contentType, 'application/json') !== false) {
    // JSON
    $data = file_get_contents('php://input');
    $fileExtension = '.json';
    $contentDescription = 'JSON';
} else {
    http_response_code(400);
    echo 'Unsupported Content-Type. Only accepts XML or JSON。';
    exit;
}

// Create a temporary file and save
$tempFile = tempnam($tempDir, 'data_');
$tempFileWithExtension = $tempFile . $fileExtension;
rename($tempFile, $tempFileWithExtension);
if (file_put_contents($tempFileWithExtension, $data) === false) {
    http_response_code(500);
    echo "Error: Failed to create temporary file.";
    exit;
}

set_exception_handler(function (Throwable $t) {
    http_response_code(500);
    echo "500 Internal Server Error";
    error_log($t->getMessage());
    exit;
});

try {
    echo (new Asd())($tempFileWithExtension);
    exit(0);
} catch (\Throwable $e) {
    http_response_code(500);
    $eClass = $e::class;
    $errorMessage = '';
    $invalidDescriptor = '';
    $line = '';
    $eMessage = $e->getMessage();
    if ($e instanceof InvalidXmlException){
        [$errorMessage, $line] = (new InvalidXsdMessage())->getLine($e->getMessage());
    }
    if ($e instanceof DescriptorNotFoundException) {
        [$errorMessage, $invalidDescriptor] = ["Descriptor not found", $eMessage];
    }
    echo json_encode(
        [
            'class' => (new ReflectionClass($e))->getShortName(),
            'exception-message' => $e->getMessage(),
            'error-message' => $errorMessage,
            'invalid-descriptor' => $invalidDescriptor,
            'line' => $line
        ]
    );
    exit(1);
}

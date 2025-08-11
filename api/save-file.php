<?php
// save-file.php
$data = json_decode(file_get_contents('php://input'), true);
$fileName = $data['fileName'];
$content = $data['content'];

// 最小限のセキュリティチェック：ディレクトリトラバーサル対策
$safeFileName = str_replace('..', '', $fileName);
$safeFileName = str_replace(['/', '\\'], '', $safeFileName);

if (file_put_contents($safeFileName, $content) !== false) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to save file']);
}
?>

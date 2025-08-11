<?php

// リクエストされたURIを取得します。
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// もしリクエストされたファイルが実際に存在する場合は、そのままサーバーが処理します。
if ($uri !== '/' && file_exists(__DIR__ . $uri)) {
    return false;
}

require_once __DIR__. '/index.html';

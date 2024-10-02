let editor;
let debounceTimer;
let alpsSchema;
let ajv;

document.addEventListener('DOMContentLoaded', async function() {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/github");

    // デフォルトのXMLを読み込む
    try {
        const response = await fetch('/default-alps.xml');
        const defaultXml = await response.text();
        editor.setValue(defaultXml);
        editor.getSession().setMode("ace/mode/xml");
    } catch (error) {
        console.error('デフォルトXMLの読み込みに失敗しました:', error);
        debugLog('デフォルトXMLの読み込みに失敗しました: ' + error.message);
    }

    ace.require("ace/ext/language_tools");
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true
    });

    ajv = new Ajv({allErrors: true, verbose: true});

    try {
        const schemaResponse = await axios.get('/alps.json');
        alpsSchema = schemaResponse.data;
        debugLog('ALPSスキーマの取得に成功しました');
    } catch (error) {
        console.error('ALPSスキーマの取得に失敗しました:', error);
        debugLog('ALPSスキーマの取得に失敗しました: ' + error.message);
    }

    editor.getSession().on('change', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(validateAndPreview, 300);
    });

    validateAndPreview();
});


function detectFileType(content) {
    content = content.trim();
    if (content.startsWith('{') || content.startsWith('[')) {
        return 'JSON';
    } else if (content.startsWith('<')) {
        return 'XML';
    }
    return '不明';
}

async function validateAndPreview() {
    const content = editor.getValue();
    const fileType = detectFileType(content);
    document.getElementById('fileTypeDisplay').textContent = fileType;

    const validationMark = document.getElementById('validationMark');

    let isValid = false;

    if (fileType === 'JSON') {
        editor.getSession().setMode("ace/mode/json");
        isValid = validateJson(content);
    } else if (fileType === 'XML') {
        editor.getSession().setMode("ace/mode/xml");
        isValid = validateXml(content);
    }

    validationMark.textContent = isValid ? '✅' : '❌';
    debugLog(`ファイルタイプ: ${fileType}, バリデーション結果: ${isValid ? '成功' : '失敗'}`);

    if (isValid) {
        updatePreview(content, fileType);
    }
}

function validateJson(content) {
    try {
        const data = JSON.parse(content);
        debugLog('JSONパース成功');

        const validate = ajv.compile(alpsSchema);
        const result = validate(data);
        if (!result) {
            debugLog('JSONバリデーションエラー: ' + ajv.errorsText(validate.errors, {separator: '\n'}));
        } else {
            debugLog('JSONバリデーション成功');
        }
        return result;
    } catch (error) {
        debugLog('JSONパースまたはバリデーションエラー: ' + error.message);
        return false;
    }
}

function validateXml(content) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");
        const isValid = xmlDoc.getElementsByTagName("parsererror").length === 0;
        if (!isValid) {
            debugLog('XMLパースエラー: 不正なXML形式');
        }
        return isValid;
    } catch (error) {
        debugLog('XMLバリデーションエラー: ' + error.message);
        return false;
    }
}

async function updatePreview(content, fileType) {
    try {
        debugLog('プレビューの更新を開始します...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        const blob = new Blob([response.data], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        document.getElementById('preview-frame').src = url;
        debugLog('プレビューの更新が完了しました');
    } catch (error) {
        console.error('プレビューの更新中にエラーが発生しました:', error);
        debugLog('プレビューエラー: ' + error.message);
    }
}

document.getElementById('downloadBtn').addEventListener('click', async function() {
    const content = editor.getValue();
    const fileType = detectFileType(content);

    try {
        debugLog('APIリクエストを開始します...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        debugLog('APIレスポンス受信:');
        debugLog(`ステータス: ${response.status}`);
        debugLog(`ステータステキスト: ${response.statusText}`);
        debugLog(`コンテンツタイプ: ${response.headers['content-type']}`);

        const responseText = new TextDecoder().decode(response.data);
        debugLog('APIレスポンス内容:');
        debugLog(responseText);

        const blob = new Blob([response.data], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'result.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        debugLog('ダウンロードが完了しました');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        if (error.response) {
            debugLog(`APIエラー: サーバーレスポンス - ステータス: ${error.response.status}`);
            if (error.response.data) {
                const errorText = new TextDecoder().decode(error.response.data);
                debugLog(`エラーデータ: ${errorText}`);
            }
        } else if (error.request) {
            debugLog('APIエラー: リクエストは送信されましたが、レスポンスがありませんでした');
        } else {
            debugLog('APIエラー: ' + error.message);
        }
    }
});

function debugLog(message) {
    const debugElement = document.getElementById('debug');
    debugElement.style.display = 'block';
    debugElement.textContent += new Date().toISOString() + ': ' + message + '\n';
    debugElement.scrollTop = debugElement.scrollHeight;
}

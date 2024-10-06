let editor;
let debounceTimer;
let alpsSchema;
let ajv;
let customAnnotations = [];

document.addEventListener('DOMContentLoaded', async function() {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/github");

    try {
        const response = await fetch('/default-alps.xml');
        const defaultXml = await response.text();
        editor.setValue(defaultXml);
        editor.getSession().setMode("ace/mode/xml");
    } catch (error) {
        console.error('Failed to load default XML:', error);
        debugLog('Failed to load default XML');
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
    } catch (error) {
        console.error('Failed to load ALPS schema:', error);
        debugLog('Failed to load ALPS schema');
    }

    const originalSetAnnotations = editor.getSession().setAnnotations;
    editor.getSession().setAnnotations = function(annotations) {
        const combinedAnnotations = (annotations || []).concat(customAnnotations);
        originalSetAnnotations.call(this, combinedAnnotations);
    };

    editor.getSession().on('change', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(validateAndPreview, 300);
    });

    validateAndPreview();

    // save short-cut key
    document.addEventListener('keydown', function(event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            document.getElementById('downloadBtn').click();
        }
    });

    // Set drag and drop
    var dropArea = document.getElementById('editor-container');
    dropArea.addEventListener('dragover', function(event) {
        event.preventDefault();
    });
    dropArea.addEventListener('drop', function(event) {
        event.preventDefault();
        var file = event.dataTransfer.files[0];

        if (file) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var content = e.target.result;
                editor.setValue(content);
                console.log('Dropped:', file.name);
            };
            reader.readAsText(file);
            validateAndPreview();
        }
    });

});

function detectFileType(content) {
    content = content.trim();
    if (content.startsWith('{') || content.startsWith('[')) {
        return 'JSON';
    } else if (content.startsWith('<')) {
        return 'XML';
    }
    return 'Unknown';
}

async function validateAndPreview() {
    const content = editor.getValue();
    const fileType = detectFileType(content);
    document.getElementById('fileTypeDisplay').textContent = fileType;

    let isLocallyValid = false;

    if (fileType === 'JSON') {
        editor.getSession().setMode("ace/mode/json");
        isLocallyValid = validateJson(content);
    } else if (fileType === 'XML') {
        editor.getSession().setMode("ace/mode/xml");
        isLocallyValid = validateXml(content);
    }

    debugLog(`File type: ${fileType}, Local Validation: ${isLocallyValid ? 'Success' : 'Failure'}`);

    if (isLocallyValid) {
        await performApiValidationAndPreview(content, fileType);
    } else {
        updateValidationMark(false);
    }
}

async function performApiValidationAndPreview(content, fileType) {
    try {
        debugLog('Calling API for validation and preview...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        // ステータスコードが200の場合のみ成功とみなす
        if (response.status === 200) {
            // バリデーション成功、プレビューを更新
            const blob = new Blob([response.data], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            document.getElementById('preview-frame').src = url;
            debugLog('Preview updated');
            updateValidationMark(true);
            customAnnotations = []; // カスタムアノテーションをクリア
        } else {
            // 200以外のステータスコードはすべてエラーとして扱う
            throw new Error(`Unexpected status code: ${response.status}`);
        }

    } catch (error) {
        console.error('API call failed:', error);
        debugLog('API call failed');
        updateValidationMark(false);

        if (error.response) {
            handleApiError(error.response);
        } else {
            // ネットワークエラーなどの場合
            customAnnotations = [{
                row: 0,
                column: 0,
                text: "API call failed: " + error.message,
                type: "error"
            }];
        }
    }

    // 強制的にアノテーションを再描画
    editor.getSession().setAnnotations(editor.getSession().getAnnotations());
}

function handleApiError(errorResponse) {
    const decoder = new TextDecoder('utf-8');
    let errorData;

    try {
        const decodedData = decoder.decode(errorResponse.data);
        errorData = JSON.parse(decodedData);
    } catch (parseError) {
        console.error('Error parsing error response:', parseError);
        debugLog(`Error parsing error response: ${parseError.message}`);
        errorData = { 'error-message': 'Unknown error occurred' };
    }

    if (errorData && errorData['error-message']) {
        if (errorData['invalid-descriptor']) {
            // 無効なディスクリプターに基づいてアノテーションを追加
            addInvalidWordAnnotations(errorData, editor.getValue());
        } else {
            customAnnotations = [{
                row: errorData['line'] ? errorData['line'] - 1 : 0,
                column: 0,
                text: `(${errorResponse.status}): ${errorData['error-message']}`,
                type: "error"
            }];
            debugLog(`API Error: ${errorData['error-message']}`);
        }
    } else {
        customAnnotations = [{
            row: 0,
            column: 0,
            text: `(${errorResponse.status}): ${errorData['class']}:${errorData['exception-message']}`,
            type: "error"
        }];
        debugLog('API returned an unknown error');
    }
}

function validateJson(content) {
    let annotations = [];
    try {
        const data = JSON.parse(content);
        const validate = ajv.compile(alpsSchema);
        const result = validate(data);
        if (!result) {
            console.log('AJV errors:', validate.errors);
            debugLog('JSON schema validation failed');
            annotations = processValidationErrors(validate.errors, ajv, content);
        }
        editor.session.setAnnotations(annotations);
        return result;
    } catch (error) {
        debugLog('JSON parsing failed');
        const position = getPositionFromParseError(error, content);
        annotations.push({
            row: position.line,
            column: position.column,
            text: error.message,
            type: "error"
        });
        editor.session.setAnnotations(annotations);
        return false;
    }
}

function getPositionFromParseError(error, content) {
    const message = error.message;
    const match = message.match(/at position (\d+)/);
    if (match && match[1]) {
        const position = Number(match[1]);
        const lines = content.substring(0, position).split('\n');
        const line = lines.length - 1;
        const column = lines[lines.length - 1].length;
        return { line, column };
    } else {
        return { line: 0, column: 0 };
    }
}

function validateXml(content) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");
        const isValid = xmlDoc.getElementsByTagName("parsererror").length === 0;
        if (!isValid) {
            debugLog('Invalid XML form');
        }
        return isValid;
    } catch (error) {
        debugLog('XML validation failed');
        return false;
    }
}

function updateValidationMark(isValid) {
    const validationMark = document.getElementById('validationMark');
    validationMark.textContent = isValid ? '✅' : '❌';
}

document.getElementById('downloadBtn').addEventListener('click', async function() {
    const content = editor.getValue();
    const fileType = detectFileType(content);

    try {
        debugLog('Starting API request...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        debugLog('API response received');

        const blob = new Blob([response.data], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'alps.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        debugLog('Download completed');

        // Update validation mark to success
        const validationMark = document.getElementById('validationMark');
        validationMark.textContent = '✅';
    } catch (error) {
        console.error('Error occurred:', response.body);
        debugLog('API request failed:' . res);

        // Update validation mark to failure
        const validationMark = document.getElementById('validationMark');
        validationMark.textContent = '❌';

        // Log error details
        if (error.response) {
            debugLog(`Error status: ${error.response.status}`);
            debugLog(`Error body: ${new TextDecoder().decode(error.response.data)}`);
        } else {
            debugLog(`Error: ${error.message}`);
        }
    }
});

function processValidationErrors(errors, ajvInstance, content) {
    return errors.reduce((acc, error) => {
        let message;
        let path = error.dataPath || '';

        if (error.parentSchema && error.parentSchema.errorMessage) {
            if (error.keydescriptor === 'oneOf') {
                // Handle the case where errorMessage is an object
                if (typeof error.parentSchema.errorMessage === 'object') {
                    message = error.parentSchema.errorMessage[error.keydescriptor] || JSON.stringify(error.parentSchema.errorMessage);
                } else {
                    message = error.parentSchema.errorMessage;
                }
            } else {
                message = error.parentSchema.errorMessage;
            }

            // Ensure message is a string
            message = typeof message === 'string' ? message : JSON.stringify(message);
            const position = getPositionFromDataPath(content, path);
            // const position = {"line": 0, "column": 0};
            acc.push({
                row: position.line,
                column: position.column,
                text: `${message} (${path})`,
                type: "error"
            });
        }

        return acc;
    }, []);
}

function getPositionFromDataPath(content, dataPath) {
    try {
        // Parse the JSON content into an AST with location data
        const ast = jsonToAst(content, { loc: true });

        // Split the dataPath into segments, handling array indices
        const pathSegments = dataPath
            .split('.')
            .filter(Boolean)
            .flatMap(segment => {
                const parts = [];
                segment.replace(/([^[\]]+)|(\[\d+\])/g, (_, prop, index) => {
                    if (prop) parts.push(prop);
                    if (index) parts.push(parseInt(index.slice(1, -1), 10));
                });
                return parts;
            });

        let currentNode = ast;

        for (let segment of pathSegments) {
            if (currentNode.type === 'Object') {
                // Find the property with the matching key
                const property = currentNode.children.find(
                    (prop) => prop.key.value === segment
                );
                if (!property) {
                    return { line: 0, column: 0 };
                }
                currentNode = property.value;
            } else if (currentNode.type === 'Array') {
                const index = parseInt(segment, 10);
                if (isNaN(index) || index >= currentNode.children.length) {
                    return { line: 0, column: 0 };
                }
                currentNode = currentNode.children[index];
            } else {
                return { line: 0, column: 0 };
            }
        }

        if (!currentNode || !currentNode.loc) {
            return { line: 0, column: 0 };
        }

        // Get the line and column from the current node's location data
        const line = currentNode.loc.start.line - 1; // Zero-based index
        const column = currentNode.loc.start.column - 1;
        return { line, column };
    } catch (e) {
        return { line: 0, column: 0 };
    }
}

function addInvalidWordAnnotations(errorData, content) {
    const invalidDescriptor = errorData['invalid-descriptor'];
    const searchWord = '"#' + errorData['invalid-descriptor'] + '"';
    if (!invalidDescriptor) return;

    const lines = content.split('\n');
    const errorMessage = errorData['error-message'];

    lines.forEach((line, index) => {
        if (line.includes(searchWord)) {
            const column = line.indexOf(searchWord);
            customAnnotations = [{
                row: index,
                column: column,
                text: `${errorMessage} ("${invalidDescriptor}")`,
                type: "error"
            }];
        }
    });
}

function debugLog(message) {
    const debugElement = document.getElementById('debug');
    // debugElement.style.display = 'block';
    debugElement.textContent += `${new Date().toISOString()}: ${message}\n`;
    debugElement.scrollTop = debugElement.scrollHeight;
}

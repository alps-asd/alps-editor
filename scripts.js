let editor;
let debounceTimer;
let alpsSchema;
let ajv;

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
    return 'Unknown';
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
    debugLog(`File type: ${fileType}, Validation: ${isValid ? 'Success' : 'Failure'}`);

    if (isValid) {
        updatePreview(content, fileType);
    }
}

function validateJson(content) {
    try {
        const data = JSON.parse(content);
        const validate = ajv.compile(alpsSchema);
        const result = validate(data);
        if (!result) {
            debugLog('JSON validation failed');
        }
        return result;
    } catch (error) {
        debugLog('JSON parsing failed');
        return false;
    }
}

function validateXml(content) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");
        const isValid = xmlDoc.getElementsByTagName("parsererror").length === 0;
        if (!isValid) {
            debugLog('XML parsing failed');
        }
        return isValid;
    } catch (error) {
        debugLog('XML validation failed');
        return false;
    }
}

async function updatePreview(content, fileType) {
    try {
        debugLog('Updating preview...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        const blob = new Blob([response.data], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        document.getElementById('preview-frame').src = url;
        debugLog('Preview updated');
    } catch (error) {
        console.error('Preview update failed:', error);
        debugLog('Preview update failed');
    }
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
        a.download = 'result.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        debugLog('Download completed');
    } catch (error) {
        console.error('Error occurred:', error);
        debugLog('API request failed');
    }
});

function debugLog(message) {
    const debugElement = document.getElementById('debug');
    // debugElement.style.display = 'block';
    debugElement.textContent += `${new Date().toISOString()}: ${message}\n`;
    debugElement.scrollTop = debugElement.scrollHeight;
}

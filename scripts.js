let editor;
let debounceTimer;
let alpsSchema;
let ajv;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the editor
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/github");
    ace.require("ace/ext/language_tools");
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true
    });

    // Load default XML
    try {
        const response = await fetch('/default-alps.xml');
        const defaultXml = await response.text();
        editor.setValue(defaultXml);
        editor.getSession().setMode("ace/mode/xml");
    } catch (error) {
        console.error('Failed to load default XML:', error);
    }

    // Load ALPS schema
    ajv = new Ajv({ allErrors: true, verbose: true });
    try {
        const schemaResponse = await axios.get('/alps.json');
        alpsSchema = schemaResponse.data;
    } catch (error) {
        console.error('Failed to load ALPS schema:', error);
    }

    // Set up editor change event
    editor.getSession().on('change', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(validateAndPreview, 300);
    });

    // Display initial preview
    validateAndPreview();
});

const detectFileType = (content) => {
    const trimmedContent = content.trim();
    if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
        return 'JSON';
    } else if (trimmedContent.startsWith('<')) {
        return 'XML';
    }
    return 'Unknown';
};

const validateAndPreview = async () => {
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
    console.log(`File type: ${fileType}, Validation: ${isValid ? 'Success' : 'Failure'}`);

    if (isValid) {
        updatePreview(content, fileType);
    }
};

const validateJson = (content) => {
    try {
        const data = JSON.parse(content);
        const validate = ajv.compile(alpsSchema);
        const result = validate(data);
        if (!result) {
            console.warn('JSON validation failed:', validate.errors);
        }
        return result;
    } catch (error) {
        console.warn('Failed to parse JSON:', error);
        return false;
    }
};

const validateXml = (content) => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");
        const isValid = xmlDoc.getElementsByTagName("parsererror").length === 0;
        if (!isValid) {
            console.warn('Failed to parse XML:', xmlDoc.getElementsByTagName("parsererror")[0].textContent);
        }
        return isValid;
    } catch (error) {
        console.warn('XML validation failed:', error);
        return false;
    }
};

const updatePreview = async (content, fileType) => {
    try {
        console.log('Updating preview...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        const blob = new Blob([response.data], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        document.getElementById('preview-frame').src = url;
        console.log('Preview updated');
    } catch (error) {
        console.error('Failed to update preview:', error);
        if (error.response && error.response.data) {
            const errorData = new TextDecoder().decode(error.response.data);
            console.error('Error response from server:', errorData);
        }
    }
};

document.getElementById('downloadBtn').addEventListener('click', async () => {
    const content = editor.getValue();
    const fileType = detectFileType(content);

    try {
        console.log('Starting API request...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml'
            },
            responseType: 'arraybuffer'
        });

        console.log('Received API response');

        const blob = new Blob([response.data], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'result.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        console.log('Download completed');
    } catch (error) {
        console.error('API request failed:', error);
        if (error.response && error.response.data) {
            const errorData = new TextDecoder().decode(error.response.data);
            console.error('Error response from server:', errorData);
        }
    }
});

// The unnecessary debugLog function has been removed

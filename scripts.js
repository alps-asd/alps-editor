let editor;
let debounceTimer;
let alpsSchema;
let ajv;
let customAnnotations = [];

import { SEMANTIC_TERMS } from './semanticTerms.js';

document.addEventListener('DOMContentLoaded', initEditor);

async function initEditor() {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/github");

    configureAceEditor();
    await loadDefaultXml();
    await setupCompletion();
    setupSaveShortcut();
    setupDragAndDrop();
    setupCompleteHref();
}

function configureAceEditor() {
    ace.require("ace/ext/language_tools");
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
    });
}

async function loadDefaultXml() {
    try {
        const response = await fetch('/default-alps.xml');
        const defaultXml = await response.text();
        editor.setValue(defaultXml);
        editor.getSession().setMode("ace/mode/xml");
    } catch (error) {
        handleError(error, 'Failed to load default XML');
    }
}

async function setupCompletion() {
    ajv = new Ajv({ allErrors: true, verbose: true });

    try {
        const schemaResponse = await axios.get('/alps.json');
        alpsSchema = schemaResponse.data;
    } catch (error) {
        handleError(error, 'Failed to load ALPS schema');
    }

    const originalSetAnnotations = editor.getSession().setAnnotations;
    editor.getSession().setAnnotations = function (annotations) {
        const combinedAnnotations = (annotations || []).concat(customAnnotations);
        originalSetAnnotations.call(this, combinedAnnotations);
    };

    editor.getSession().on('change', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(validateAndPreview, 300);
    });

    validateAndPreview();
}

function setupSaveShortcut() {
    // Save shortcut key
    document.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            document.getElementById('downloadBtn').click();
        }
    });
}

function setupDragAndDrop() {
    const dropArea = document.getElementById('editor-container');
    dropArea.addEventListener('dragover', function (event) {
        event.preventDefault();
    });

    dropArea.addEventListener('drop', function (event) {
        event.preventDefault();
        const file = event.dataTransfer.files[0];

        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const content = e.target.result;
                editor.setValue(content);
                console.log('Dropped:', file.name);
                validateAndPreview();
            };
            reader.readAsText(file);
        }
    });
}

function setupCompleteHref() {
    // Watch for changes to trigger autocomplete
    editor.commands.on('afterExec', function (e) {
        if (e.command.name === 'insertstring' && e.args === '#') {
            const existingCompleters = editor.completers || [];
            editor.completers = [hrefCompleter];
            editor.execCommand('startAutocomplete');
            editor.completers = existingCompleters;
        }
    });
}

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

    const isLocallyValid = validateContent(content, fileType);

    debugLog(`File type: ${fileType}, Local Validation: ${isLocallyValid ? 'Success' : 'Failure'}`);

    if (isLocallyValid) {
        await updatePreview(content, fileType);
    } else {
        updateValidationMark(false);
    }
}

function validateContent(content, fileType) {
    let isLocallyValid = false;

    if (fileType === 'JSON') {
        editor.getSession().setMode('ace/mode/json');
        isLocallyValid = validateJson(content);
        editor.completers = [alpsJsonCompleter];
    } else if (fileType === 'XML') {
        editor.getSession().setMode('ace/mode/xml');
        isLocallyValid = validateXml(content);
        editor.completers = [alpsXmlCompleter];
    }

    return isLocallyValid;
}

async function updatePreview(content, fileType) {
    await performApiValidationAndPreview(content, fileType);
}

async function performApiValidationAndPreview(content, fileType) {
    try {
        debugLog('Calling API for validation and preview...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml',
            },
            responseType: 'arraybuffer',
        });

        if (response.status === 200) {
            const blob = new Blob([response.data], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            document.getElementById('preview-frame').src = url;
            debugLog('Preview updated');
            updateValidationMark(true);
            customAnnotations = [];
        } else {
            throw new Error(`Unexpected status code: ${response.status}`);
        }
    } catch (error) {
        handleError(error, 'API call failed');
        updateValidationMark(false);

        if (error.response) {
            handleApiError(error.response);
        } else {
            customAnnotations = [
                {
                    row: 0,
                    column: 0,
                    text: 'API call failed: ' + error.message,
                    type: 'error',
                },
            ];
        }
    }

    // Force re-rendering of annotations
    editor.getSession().setAnnotations(editor.getSession().getAnnotations());
}

function handleApiError(errorResponse) {
    const decoder = new TextDecoder('utf-8');
    let errorData;

    try {
        const decodedData = decoder.decode(errorResponse.data);
        errorData = JSON.parse(decodedData);
    } catch (parseError) {
        handleError(parseError, 'Error parsing error response');
        errorData = { 'error-message': 'Unknown error occurred' };
    }

    if (errorData && errorData['error-message']) {
        if (errorData['invalid-descriptor']) {
            addInvalidWordAnnotations(errorData, editor.getValue());
        } else {
            customAnnotations = [
                {
                    row: errorData['line'] ? errorData['line'] - 1 : 0,
                    column: 0,
                    text: `(${errorResponse.status}): ${errorData['error-message']}`,
                    type: 'error',
                },
            ];
            debugLog(`API Error: ${errorData['error-message']}`);
        }
    } else {
        customAnnotations = [
            {
                row: 0,
                column: 0,
                text: `(${errorResponse.status}): ${errorData['class']}:${errorData['exception-message']}`,
                type: 'error',
            },
        ];
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
        } else {
            editor.session.clearAnnotations();
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
            type: 'error',
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
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        const isValid = xmlDoc.getElementsByTagName('parsererror').length === 0;
        if (!isValid) {
            debugLog('Invalid XML form');
        } else {
            editor.session.clearAnnotations();
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

document.getElementById('downloadBtn').addEventListener('click', async function () {
    const content = editor.getValue();
    const fileType = detectFileType(content);

    try {
        debugLog('Starting API request...');
        const response = await axios.post('/api/', content, {
            headers: {
                'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml',
            },
            responseType: 'arraybuffer',
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

        updateValidationMark(true);
    } catch (error) {
        handleError(error, 'API request failed');
        updateValidationMark(false);

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
            if (error.keyword === 'oneOf') {
                if (typeof error.parentSchema.errorMessage === 'object') {
                    message =
                        error.parentSchema.errorMessage[error.keyword] ||
                        JSON.stringify(error.parentSchema.errorMessage);
                } else {
                    message = error.parentSchema.errorMessage;
                }
            } else {
                message = error.parentSchema.errorMessage;
            }

            message = typeof message === 'string' ? message : JSON.stringify(message);
            const position = getPositionFromDataPath(content, path);
            acc.push({
                row: position.line,
                column: position.column,
                text: `${message} (${path})`,
                type: 'error',
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
            .flatMap((segment) => {
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
                const property = currentNode.children.find((prop) => prop.key.value === segment);
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

        const line = currentNode.loc.start.line - 1;
        const column = currentNode.loc.start.column - 1;
        return { line, column };
    } catch (e) {
        return { line: 0, column: 0 };
    }
}

function addInvalidWordAnnotations(errorData, content) {
    const invalidDescriptor = errorData['invalid-descriptor'];
    const searchWord = '"#' + invalidDescriptor + '"';
    if (!invalidDescriptor) return;

    customAnnotations = [];

    const lines = content.split('\n');
    const errorMessage = errorData['error-message'];

    lines.forEach((line, index) => {
        if (line.includes(searchWord)) {
            const column = line.indexOf(searchWord);
            customAnnotations.push({
                row: index,
                column: column,
                text: `${errorMessage} ("${invalidDescriptor}")`,
                type: 'error',
            });
        }
    });
}

const hrefCompleter = {
    getCompletions: function (editor, session, pos, prefix, callback) {
        const cursorPosition = editor.getCursorPosition();
        const line = editor.session.getLine(cursorPosition.row);

        if (line[cursorPosition.column - 1] === '#' && line[cursorPosition.column - 2] === '"') {
            const content = editor.getValue();
            const suggestions = extractIdsFromContent(content);

            callback(
                null,
                suggestions.map(function (word) {
                    return {
                        caption: word,
                        value: word,
                        meta: 'id',
                    };
                })
            );
        } else {
            callback(null, []);
        }
    },
};

function extractIdsFromContent(content) {
    let match;
    const ids = [];
    const jsonStyleRegex = /"id"\s*:\s*"([^"]+)"/g;
    const xmlStyleRegex = /id=["']([^"']+)["']/g;
    const regex = detectFileType(content) === 'JSON' ? jsonStyleRegex : xmlStyleRegex;

    while ((match = regex.exec(content)) !== null) {
        const id = match[1];
        if (id) {
            ids.push(id);
        }
    }

    return ids;
}

function debugLog(message) {
    const isDebugMode = false;
    if (isDebugMode) {
        const debugElement = document.getElementById('debug');
        debugElement.textContent += `${new Date().toISOString()}: ${message}\n`;
        debugElement.scrollTop = debugElement.scrollHeight;
    }
}

function handleError(error, message) {
    console.error(message, error);
    debugLog(`${message}: ${error.message}`);
}

const DESCRIPTOR_TYPES = ['safe', 'unsafe', 'idempotent'];

const alpsJsonCompleter = {
    getCompletions: function (editor, session, pos, prefix, callback) {
        const content = editor.getValue();
        const ids = extractIdsFromContent(content);
        const dynamicHrefOptions = ids.join(',');

        const snippets = [
            {
                caption: 'Ontology',
                snippet: `{"id":"\${1|${SEMANTIC_TERMS.join(',')}|}", "title": "\${2}"}`,
                meta: 'id',
            },
            {
                caption: 'Ontology',
                snippet: `{"href": "#\${1|${dynamicHrefOptions}|}"}`,
                meta: 'href',
            },
            {
                caption: 'Taxonomy',
                snippet: `{"id":"\${1|${SEMANTIC_TERMS.join(',')}|}", "title": "\${2}", "descriptor": [
    {"href": "#\${3|${dynamicHrefOptions}|}"}
]}`,
            },
            {
                caption: 'Choreography',
                snippet: `{"id":"\${1}", "title": "\${2}", "type": "\${3|${DESCRIPTOR_TYPES.join(
                    ','
                )}|}", "rt": "#\${4|${dynamicHrefOptions}|}"}`,
                meta: 'no-parameter',
            },
            {
                caption: 'Choreography',
                snippet: `{"id":"\${1}", "title": "\${2}", "type": "\${3|${DESCRIPTOR_TYPES.join(
                    ','
                )}|}", "rt": "#\${4|${dynamicHrefOptions}|}", "descriptor": [
    {"href": "#\${5|${dynamicHrefOptions}|}"}
]}`,
                meta: 'with-parameter',
            },
            {
                caption: 'Skeleton',
                snippet: `{
    "$schema": "https://alps-io.github.io/schemas/alps.json",
    "alps": {
        "title": "\${1}",
        "doc": {"value": "\${2}"},
        "descriptor": [
            \${3}
        ]
    }
}`,
                meta: 'JSON',
            },
        ];

        const completions = snippets.map(function (snippet, index) {
            return {
                caption: snippet.caption,
                snippet: snippet.snippet,
                meta: snippet.meta,
                type: 'snippet',
                score: 1000 - index,
            };
        });
        callback(null, completions);
    },
};

const alpsXmlCompleter = {
    getCompletions: function (editor, session, pos, prefix, callback) {
        const content = editor.getValue();
        const ids = extractIdsFromContent(content);
        const dynamicHrefOptions = ids.join(',');

        const snippets = [
            {
                caption: 'Ontology',
                snippet: `<descriptor id="\${1|${SEMANTIC_TERMS.join(',')}|}" title="\${2}"/>`,
                meta: 'id',
            },
            {
                caption: 'Ontology',
                snippet: `<descriptor href="#\${1|${dynamicHrefOptions}|}"/>`,
                meta: 'href',
            },
            {
                caption: 'Taxonomy',
                snippet: `<descriptor id="\${1|${SEMANTIC_TERMS.join(
                    ','
                )}|}" title="\${2}">
    <descriptor href="#\${3|${dynamicHrefOptions}|}"/>
</descriptor>`,
            },
            {
                caption: 'Choreography',
                snippet: `<descriptor id="\${1|${SEMANTIC_TERMS.join(',')}|}" title="\${2}" type="\${3|${DESCRIPTOR_TYPES.join(
                    ','
                )}|}" rt="#\${4|${dynamicHrefOptions}|}"/>`,
                meta: 'no-parameter',
            },
            {
                caption: 'Choreography',
                snippet: `<descriptor id="\${1|${SEMANTIC_TERMS.join(',')}|}" title="\${2}" type="\${3|${DESCRIPTOR_TYPES.join(
                    ','
                )}|}" rt="#\${4|${dynamicHrefOptions}|}">
    <descriptor href="#\${5|${dynamicHrefOptions}|}"/>
</descriptor>`,
                meta: 'with-parameter',
            },
            {
                caption: 'Skeleton',
                snippet:
                    '?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<alps\n' +
                    '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
                    '    xsi:noNamespaceSchemaLocation="https://alps-io.github.io/schemas/alps.xsd">\n' +
                    '    <title>${1}</title>\n' +
                    '    <doc>${2}</doc>\n' +
                    '    <!-- Ontology -->\n' +
                    `    \${3}\n` +
                    '    <!-- Taxonomy -->\n' +
                    '    <!-- Choreography -->\n' +
                    '</alps>',
                meta: 'XML',
            },
        ];

        const completions = snippets.map(function (snippet, index) {
            return {
                caption: snippet.caption,
                snippet: snippet.snippet,
                meta: snippet.meta,
                type: 'snippet',
                score: 1000 - index,
            };
        });
        callback(null, completions);
    },
};

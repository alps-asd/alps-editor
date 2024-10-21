import { SEMANTIC_TERMS } from './semanticTerms.js';

class AlpsEditor {
    constructor() {
        this.editor = null;
        this.debounceTimer = null;
        this.alpsSchema = null;
        this.ajv = new Ajv({ allErrors: true, verbose: true });
        this.customAnnotations = [];
        this.isDebugMode = false;
        this.init();
    }

    async init() {
        document.addEventListener('DOMContentLoaded', async () => {
            this.editor = ace.edit("editor");
            this.editor.setTheme("ace/theme/github");
            this.configureAceEditor();
            await this.loadDefaultXml();
            await this.setupCompletion();
            this.setupSaveShortcut();
            this.setupDragAndDrop();
            this.setupCompleteHref();
            this.setupDownloadButton();
        });
    }

    configureAceEditor() {
        ace.require("ace/ext/language_tools");
        this.editor.setOptions({
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
        });
    }

    async loadDefaultXml() {
        try {
            const response = await fetch('/default-alps.xml');
            const defaultXml = await response.text();
            this.editor.setValue(defaultXml);
            this.editor.getSession().setMode("ace/mode/xml");
        } catch (error) {
            this.handleError(error, 'Failed to load default XML');
        }
    }

    async setupCompletion() {
        try {
            const schemaResponse = await axios.get('/alps.json');
            this.alpsSchema = schemaResponse.data;
        } catch (error) {
            this.handleError(error, 'Failed to load ALPS schema');
        }

        const originalSetAnnotations = this.editor.getSession().setAnnotations.bind(this.editor.getSession());
        this.editor.getSession().setAnnotations = (annotations) => {
            const combinedAnnotations = (annotations || []).concat(this.customAnnotations);
            originalSetAnnotations(combinedAnnotations);
        };

        this.editor.getSession().on('change', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.validateAndPreview(), 300);
        });

        this.validateAndPreview();
    }

    setupSaveShortcut() {
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                document.getElementById('downloadBtn').click();
            }
        });
    }

    setupDragAndDrop() {
        const dropArea = document.getElementById('editor-container');
        dropArea.addEventListener('dragover', (event) => event.preventDefault());

        dropArea.addEventListener('drop', (event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];

            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    let content = e.target.result;
                    const fileExtension = file.name.split('.').pop().toLowerCase();

                    if (fileExtension === 'html') {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(content, 'text/html');
                        const codeElement = doc.querySelector('code');
                        if (codeElement) {
                            content = this.unescapeHtml(codeElement.textContent);
                        } else {
                            console.warn('No <code> element found in HTML file');
                            return;
                        }
                    }

                    this.editor.setValue(content);
                    console.log('Dropped:', file.name);
                    this.validateAndPreview();
                };
                reader.readAsText(file);
            }
        });
    }

    unescapeHtml(html) {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    }

    setupCompleteHref() {
        this.editor.commands.on('afterExec', (e) => {
            if (e.command.name === 'insertstring' && e.args === '#') {
                const existingCompleters = this.editor.completers || [];
                this.editor.completers = [this.hrefCompleter()];
                this.editor.execCommand('startAutocomplete');
                this.editor.completers = existingCompleters;
            }
        });
    }

    detectFileType(content) {
        content = content.trim();
        if (content.startsWith('{') || content.startsWith('[')) return 'JSON';
        if (content.startsWith('<')) return 'XML';
        return 'Unknown';
    }

    async validateAndPreview() {
        const content = this.editor.getValue();
        const fileType = this.detectFileType(content);
        document.getElementById('fileTypeDisplay').textContent = fileType;

        let validationResult;
        if (fileType === 'JSON') {
            this.editor.getSession().setMode('ace/mode/json');
            validationResult = this.validateJson(content);
            this.editor.completers = [this.alpsJsonCompleter()];
        } else if (fileType === 'XML') {
            this.editor.getSession().setMode('ace/mode/xml');
            validationResult = this.validateXml(content);
            this.editor.completers = [this.alpsXmlCompleter()];
        } else {
            validationResult = { isValid: false, errors: [{ row: 0, column: 0, text: 'Unknown file type', type: 'error' }] };
        }

        this.debugLog(`File type: ${fileType}, Local Validation: ${validationResult.isValid ? 'Success' : 'Failure'}`);

        if (validationResult.isValid) {
            await this.updatePreview(content, fileType);
        } else {
            this.updateValidationMark(false);
            this.displayErrors(validationResult.errors);
        }

        this.editor.getSession().setAnnotations(validationResult.errors);
    }

    async updatePreview(content, fileType) {
        try {
            this.debugLog('Calling API for validation and preview...');
            const response = await axios.post('/api/', content, {
                headers: { 'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml' },
                responseType: 'arraybuffer',
            });

            if (response.status === 200) {
                const blob = new Blob([response.data], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                document.getElementById('preview-frame').src = url;
                this.debugLog('Preview updated');
                this.updateValidationMark(true);
                this.displayErrors([]);
            } else {
                throw new Error(`Unexpected status code: ${response.status}`);
            }
        } catch (error) {
            this.handleError(error, 'API call failed');
            this.updateValidationMark(false);
            const apiErrors = error.response ? this.handleApiError(error.response) : [{
                row: 0,
                column: 0,
                text: 'API call failed: ' + error.message,
                type: 'error'
            }];
            this.displayErrors(apiErrors);
        }
    }

    handleApiError(errorResponse) {
        const decoder = new TextDecoder('utf-8');
        let errorData;

        try {
            const decodedData = decoder.decode(errorResponse.data);
            errorData = JSON.parse(decodedData);
        } catch (parseError) {
            this.handleError(parseError, 'Error parsing error response');
            errorData = { 'error-message': 'Unknown error occurred' };
        }

        if (errorData && errorData['error-message']) {
            return errorData['invalid-descriptor'] ? this.addInvalidWordAnnotations(errorData, this.editor.getValue()) : [{
                row: errorData['line'] ? errorData['line'] - 1 : 0,
                column: 0,
                text: `API Error (${errorResponse.status}): ${errorData['error-message']}`,
                type: 'error'
            }];
        } else {
            return [{
                row: 0,
                column: 0,
                text: `API Error (${errorResponse.status}): ${errorData['class'] || ''}:${errorData['exception-message'] || 'Unknown error'}`,
                type: 'error'
            }];
        }
    }

    addInvalidWordAnnotations(errorData, content) {
        const invalidDescriptor = errorData['invalid-descriptor'];
        const searchWord = '"#' + invalidDescriptor + '"';
        const errors = [];

        if (invalidDescriptor) {
            content.split('\n').forEach((line, index) => {
                if (line.includes(searchWord)) {
                    errors.push({
                        row: index,
                        column: line.indexOf(searchWord),
                        text: `API Error: ${errorData['error-message']} ("${invalidDescriptor}")`,
                        type: 'error'
                    });
                }
            });
        }

        return errors.length ? errors : [{
            row: 0,
            column: 0,
            text: `API Error: ${errorData['error-message']}`,
            type: 'error'
        }];
    }

    displayErrors(errors) {
        const errorContainer = document.getElementById('error-container');
        if (!errors.length) {
            errorContainer.style.display = 'none';
            return;
        }

        errorContainer.innerHTML = `
            <div class="error-title">Errors</div>
            ${errors.map(error => `
                <div class="error-message">${error.text}</div>
                <div class="error-location">Line: ${error.row + 1}, Column: ${error.column + 1}</div>
            `).join('')}
        `;
        errorContainer.style.display = 'block';
    }

    validateJson(content) {
        try {
            const data = JSON.parse(content);
            const validate = this.ajv.compile(this.alpsSchema);
            if (!validate(data)) {
                this.debugLog('JSON schema validation failed');
                const errors = this.processAjvErrors(validate.errors, content);
                return { isValid: false, errors };
            }
            return { isValid: true, errors: [] };
        } catch (error) {
            const position = this.getPositionFromJsonParseError(error, content);
            return {
                isValid: false,
                errors: [{ row: position.line, column: position.column, text: `JSON Parse Error: ${error.message}`, type: 'error' }]
            };
        }
    }

    getPositionFromJsonParseError(error, content) {
        const match = error.message.match(/at position (\d+)/);
        if (match) {
            const position = parseInt(match[1], 10);
            const lines = content.slice(0, position).split('\n');
            return { line: lines.length - 1, column: lines[lines.length - 1].length };
        }
        return { line: 0, column: 0 };
    }

    processAjvErrors(ajvErrors, content) {
        return ajvErrors.map(error => {
            const location = this.getLocationFromJsonPointer(error.dataPath, content);
            return {
                row: location.line,
                column: location.column,
                text: `Schema Error: ${error.message} at ${error.dataPath}`,
                type: 'error'
            };
        });
    }

    getLocationFromJsonPointer(jsonPointer, content) {
        try {
            const path = jsonPointer.split('/').slice(1);
            let currentObj = JSON.parse(content);
            let line = 0;
            let column = 0;

            for (const key of path) {
                if (currentObj.hasOwnProperty(key)) {
                    const index = content.indexOf(`"${key}"`);
                    if (index !== -1) {
                        const beforeKey = content.slice(0, index);
                        const lines = beforeKey.split('\n');
                        line = lines.length - 1;
                        column = lines[lines.length - 1].length;
                        currentObj = currentObj[key];
                    } else {
                        return { line: 0, column: 0 };
                    }
                } else {
                    return { line: 0, column: 0 };
                }
            }

            return { line, column };
        } catch (e) {
            return { line: 0, column: 0 };
        }
    }

    validateXml(content) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        const parseError = xmlDoc.getElementsByTagName('parsererror')[0];

        if (parseError) {
            const errorMessage = parseError.textContent || "Unknown XML parse error";
            this.debugLog('Invalid XML form');
            const lineMatch = errorMessage.match(/line (\d+)/);
            const columnMatch = errorMessage.match(/column (\d+)/);
            const line = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;
            const column = columnMatch ? parseInt(columnMatch[1], 10) - 1 : 0;

            return {
                isValid: false,
                errors: [{ row: line, column: column, text: `XML Parse Error: ${errorMessage}`, type: 'error' }]
            };
        }
        return { isValid: true, errors: [] };
    }

    updateValidationMark(isValid) {
        document.getElementById('validationMark').textContent = isValid ? '✅' : '❌';
    }

    setupDownloadButton() {
        document.getElementById('downloadBtn').addEventListener('click', async () => {
            const content = this.editor.getValue();
            const fileType = this.detectFileType(content);

            try {
                this.debugLog('Starting API request...');
                const response = await axios.post('/api/', content, {
                    headers: { 'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml' },
                    responseType: 'arraybuffer',
                });

                this.debugLog('API response received');

                const blob = new Blob([response.data], { type: 'text/html' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'alps.html';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                this.debugLog('Download completed');

                this.updateValidationMark(true);
            } catch (error) {
                this.handleError(error, 'API request failed');
                this.updateValidationMark(false);
                this.debugLog(`Error: ${error.message}`);
            }
        });
    }

    debugLog(message) {
        if (this.isDebugMode) {
            const debugElement = document.getElementById('debug');
            debugElement.textContent += `${new Date().toISOString()}: ${message}\n`;
            debugElement.scrollTop = debugElement.scrollHeight;
        }
    }

    handleError(error, message) {
        console.error(message, error);
        this.debugLog(`${message}: ${error.message}`);
    }

    extractIdsFromContent(content) {
        const ids = [];
        const regex = this.detectFileType(content) === 'JSON' ? /"id"\s*:\s*"([^"]+)"/g : /id=["']([^"']+)["']/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            if (match[1]) ids.push(match[1]);
        }
        return ids;
    }

    hrefCompleter() {
        return {
            getCompletions: (editor, session, pos, prefix, callback) => {
                const cursorPosition = editor.getCursorPosition();
                const line = editor.session.getLine(cursorPosition.row);

                if (line[cursorPosition.column - 1] === '#' && line[cursorPosition.column - 2] === '"') {
                    const content = editor.getValue();
                    const suggestions = this.extractIdsFromContent(content);

                    callback(null, suggestions.map(word => ({ caption: word, value: word, meta: 'id' })));
                } else {
                    callback(null, []);
                }
            },
        };
    }

    alpsJsonCompleter() {
        const DESCRIPTOR_TYPES = ['safe', 'unsafe', 'idempotent'];
        return {
            getCompletions: (editor, session, pos, prefix, callback) => {
                const content = editor.getValue();
                const ids = this.extractIdsFromContent(content);
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

                const completions = snippets.map((snippet, index) => ({
                    caption: snippet.caption,
                    snippet: snippet.snippet,
                    meta: snippet.meta,
                    type: 'snippet',
                    score: 1000 - index,
                }));
                callback(null, completions);
            },
        };
    }

    alpsXmlCompleter() {
        const DESCRIPTOR_TYPES = ['safe', 'unsafe', 'idempotent'];
        return {
            getCompletions: (editor, session, pos, prefix, callback) => {
                const content = editor.getValue();
                const ids = this.extractIdsFromContent(content);
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
                            '<?xml version="1.0" encoding="UTF-8"?>\n' +
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

                const completions = snippets.map((snippet, index) => ({
                    caption: snippet.caption,
                    snippet: snippet.snippet,
                    meta: snippet.meta,
                    type: 'snippet',
                    score: 1000 - index,
                }));
                callback(null, completions);
            },
        };
    }
}

new AlpsEditor();

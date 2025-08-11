import { SEMANTIC_TERMS } from './semanticTerms.js';
import { DiagramAdapterManager } from './diagramAdapters.js';

class AlpsEditor {
    constructor() {
        this.editor = null;
        this.debounceTimer = null;
        this.alpsSchema = null;
        this.ajv = new Ajv({ allErrors: true, verbose: true });
        this.customAnnotations = [];
        this.isDebugMode = false;
        this.adapterManager = new DiagramAdapterManager();
        this.isLocalMode = window.location.protocol === 'file:'; // ローカルファイルで開いているかチェック
        // Portable static detection: prefer explicit flag; default to static when flag is absent
        const hasApi = (typeof window.ALPSEDITOR_HAS_API === 'boolean') ? window.ALPSEDITOR_HAS_API : false;
        this.isStaticMode = !hasApi || this.isLocalMode;
        // Ensure static/local environments use client-side diagramming before first preview
        if (this.isLocalMode || this.isStaticMode) {
            this.adapterManager.setAdapter('alps2dot');
        }
        this.SKELETON_SNIPPETS = [
            {
                caption: 'ALPS XML Skeleton',
                snippet: `<?xml version="1.0" encoding="UTF-8"?>
<alps version="1.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="https://alps-io.github.io/schemas/alps.xsd">
    <title>\${1:Profile Title}</title>
    <doc>\${2:}</doc>
    \${3}
</alps>`,
                meta: 'XML',
                type: 'snippet',
                score: 1000
            },
            {
                caption: 'ALPS JSON Skeleton',
                snippet: `{
    "$schema": "https://alps-io.github.io/schemas/alps.json",
    "alps": {
        "version": "1.0",
        "title": "\${1:Profile Title}",
        "doc": {
            "value": "\${2:}"
        },
        "descriptor": [
            \${3}
        ]
    }
}`,
                meta: 'JSON',
                type: 'snippet',
                score: 999
            }
        ];
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
            this.setupAdapterSelector();
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
            // Default ALPS XML embedded directly in JavaScript - no external files needed
            const defaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
Welcome to Alps Editor! Let's make API design fun and effective.

Quick tips:
- Press Ctrl + Space to show snippets for auto-completion (suggested terms are from Schema.org)
- To start from scratch, delete all content and press Ctrl + Space, then select "Skeleton"
  (For JSON format, type "{" first)
- Drag and drop an ALPS file (JSON, XML, or HTML) into the editor to open it
  (For HTML files, the ALPS profile contained within will be extracted)
- Hit Ctrl + S to download your work anytime

ALPS bridges vision and implementation, creating APIs that speak business and tech fluently.

Learn more about ALPS:
- Official ALPS website: http://alps.io/
- app-state-diagram: https://www.app-state-diagram.com/

Happy modeling! Remember, solid semantics supports the long-term evolution of your APIs. :)
-->
<alps
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="https://alps-io.github.io/schemas/alps.xsd">
    <title>ALPS Online Shopping</title>
    <doc>This is a sample ALPS profile demonstrating the semantic descriptors
        and operations for a basic e-commerce system. It includes product listing,
        shopping cart management, and checkout process, serving as an educational
        example for ALPS implementation in online shopping contexts.</doc>

    <!-- Ontology -->
    <descriptor id="id" def="https://schema.org/identifier" title="identifier"/>
    <descriptor id="name" def="https://schema.org/name" title="name"/>
    <descriptor id="description" def="https://schema.org/description" title="description"/>
    <descriptor id="price" def="https://schema.org/price" title="price"/>
    <descriptor id="quantity" def="https://schema.org/Quantity" title="quantity"/>
    <descriptor id="email" def="https://schema.org/email" title="email"/>
    <descriptor id="address" def="https://schema.org/address" title="address"/>

    <!-- Taxonomy -->
    <descriptor id="ProductList" def="https://schema.org/ItemList" title="Product List" tag="collection">
        <descriptor href="#id"/>
        <descriptor href="#name"/>
        <descriptor href="#description"/>
        <descriptor href="#goProductDetail"/>
        <descriptor href="#goCart"/>
        <descriptor href="#goProductList"/>
    </descriptor>

    <descriptor id="ProductDetail" def="https://schema.org/Product" title="Product Detail" tag="item">
        <descriptor href="#id"/>
        <descriptor href="#name"/>
        <descriptor href="#description"/>
        <descriptor href="#price"/>
        <descriptor href="#goProductList"/>
        <descriptor href="#doAddToCart"/>
    </descriptor>

    <descriptor id="Cart" def="https://schema.org/Cart" title="Shopping Cart" tag="collection">
        <descriptor href="#id"/>
        <descriptor href="#goProductList"/>
        <descriptor href="#goCheckout"/>
        <descriptor href="#doUpdateQuantity"/>
        <descriptor href="#doRemoveItem"/>
    </descriptor>

    <descriptor id="Checkout" title="Checkout">
        <descriptor href="#email"/>
        <descriptor href="#address"/>
        <descriptor href="#goPayment"/>
    </descriptor>

    <descriptor id="Payment" def="https://schema.org/PayAction" title="Payment">
        <descriptor href="#doPayment"/>
    </descriptor>

    <!-- Choreography -->
    <descriptor id="goProductList" type="safe" rt="#ProductList" title="View product list">
        <descriptor href="#id"/>
    </descriptor>

    <descriptor id="goProductDetail" type="safe" rt="#ProductDetail" title="View product details">
        <descriptor href="#id"/>
    </descriptor>

    <descriptor id="goCart" type="safe" rt="#Cart" title="View shopping cart"/>

    <descriptor id="goCheckout" type="safe" rt="#Checkout" title="Proceed to checkout"/>

    <descriptor id="goPayment" type="safe" rt="#Payment" title="Proceed to payment"/>

    <descriptor id="doAddToCart" type="unsafe" rt="#Cart" title="Add product to cart">
        <descriptor href="#id"/>
        <descriptor href="#quantity"/>
    </descriptor>

    <descriptor id="doUpdateQuantity" type="idempotent" rt="#Cart" title="Update item quantity">
        <descriptor href="#id"/>
        <descriptor href="#quantity"/>
    </descriptor>
    <descriptor id="doRemoveItem" type="idempotent" rt="#Cart" title="Remove item from cart">
        <descriptor href="#id"/>
    </descriptor>

    <descriptor id="doPayment" type="idempotent" rt="#ProductList" title="Complete payment"/>

</alps>`;

            this.editor.setValue(defaultXml);
            this.editor.getSession().setMode("ace/mode/xml");
        } catch (error) {
            this.handleError(error, 'Failed to load default XML');
        }
    }

    async setupCompletion() {
        try {
            if (this.isLocalMode) {
                // ローカルモード用の簡易スキーマ
                this.alpsSchema = {
                    type: "object",
                    properties: {
                        alps: {
                            type: "object",
                            properties: {
                                version: { type: "string" },
                                title: { type: "string" },
                                doc: { type: ["string", "object"] },
                                descriptor: {
                                    type: "array",
                                    items: { type: "object" }
                                }
                            }
                        }
                    }
                };
            } else {
                const schemaResponse = await axios.get('alps.json');
                this.alpsSchema = schemaResponse.data;
            }
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
        txt.textContent = html; // Use textContent instead of innerHTML to prevent XSS
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
            this.debugLog(`Using ${this.adapterManager.getCurrentAdapter().getName()} for diagram generation`);

            // Use the adapter manager to generate diagram
            const url = await this.adapterManager.generateDiagram(content, fileType);

            document.getElementById('preview-frame').src = url;
            this.debugLog('Preview updated');
            this.updateValidationMark(true);
            this.displayErrors([]);

        } catch (error) {
            this.handleError(error, 'Diagram generation failed');
            this.updateValidationMark(false);
            const apiErrors = [{
                row: 0,
                column: 0,
                text: 'Diagram generation failed: ' + error.message,
                type: 'error'
            }];
            this.displayErrors(apiErrors);
        }
    }

    setupAdapterSelector() {
        const selector = document.getElementById('diagramAdapter');

        if (this.isLocalMode || this.isStaticMode) {
            // ローカルモードまたはstatic hostingではDiagramのみ利用可能
            this.adapterManager.setAdapter('alps2dot');
            selector.value = 'alps2dot';
            selector.disabled = true;
            selector.title = this.isStaticMode ? 'Static版ではDiagramモードのみ利用可能です' : 'ローカルモードではDiagramモードのみ利用可能です';
        } else {
            // Set current value
            selector.value = this.adapterManager.currentAdapter;
        }

        // Handle changes
        selector.addEventListener('change', (event) => {
            const newAdapter = event.target.value;
            if (this.adapterManager.setAdapter(newAdapter)) {
                this.debugLog(`Switched to ${newAdapter} adapter`);
                // Regenerate preview with new adapter
                this.validateAndPreview();
            }
        });
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

        // Clear container and create elements safely to prevent XSS
        errorContainer.innerHTML = '';

        const errorTitle = document.createElement('div');
        errorTitle.className = 'error-title';
        errorTitle.textContent = 'Errors';
        errorContainer.appendChild(errorTitle);

        errors.forEach(error => {
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.textContent = error.text;

            const errorLocation = document.createElement('div');
            errorLocation.className = 'error-location';
            errorLocation.textContent = `Line: ${error.row + 1}, Column: ${error.column + 1}`;

            errorContainer.appendChild(errorMessage);
            errorContainer.appendChild(errorLocation);
        });
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

            if (this.isLocalMode || this.isStaticMode) {
                // Static版では単純にALPSファイルをダウンロード
                const blob = new Blob([content], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileType === 'JSON' ? 'alps-profile.json' : 'alps-profile.xml';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                this.debugLog('ALPS profile downloaded');
                return;
            }

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
                if (!content) {
                    callback(null, [...this.SKELETON_SNIPPETS].sort((a, b) => {
                        return a.meta === 'JSON Skeleton' ? -1 : 1;
                    }));
                    return;
                }
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
                if (!content) {
                    callback(null, [...this.SKELETON_SNIPPETS].sort((a, b) => {
                        return a.meta === 'XML Skeleton' ? -1 : 1;
                    }));
                    return;
                }
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

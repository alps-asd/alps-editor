// Diagram generator adapters for switching between ASD and alps2dot

class DiagramAdapter {
    constructor(name) {
        this.name = name;
    }

    getName() {
        return this.name;
    }

    async generate(content, fileType) {
        throw new Error('generate method must be implemented');
    }
}

class AsdAdapter extends DiagramAdapter {
    constructor() {
        super('ASD');
    }

    async generate(content, fileType) {
        try {
            const response = await axios.post('/api/', content, {
                headers: { 'Content-Type': fileType === 'JSON' ? 'application/json' : 'application/xml' },
                responseType: 'arraybuffer',
            });

            if (response.status === 200) {
                // Extract DOT content from ASD response for comparison
                let responseText = new TextDecoder().decode(response.data);
                const dotMatch = responseText.match(/digraph[^}]*}/s);
                if (dotMatch) {
                    console.log('ASD DOT Content:', dotMatch[0]);
                    // Store in hidden field for comparison
                    setTimeout(() => {
                        let debugDiv = document.getElementById('asd-dot-debug');
                        if (!debugDiv) {
                            debugDiv = document.createElement('div');
                            debugDiv.id = 'asd-dot-debug';
                            debugDiv.style.display = 'none';
                            document.body.appendChild(debugDiv);
                        }
                        debugDiv.textContent = dotMatch[0];
                    }, 100);
                }

                // Add CSS and script to ensure proper initial display
                const initializationCode = `
                <style>
                #asd-graph-name { 
                    display: none; 
                }
                .highlighted {
                    filter: drop-shadow(0 0 8px #ff6b35) !important;
                    opacity: 0.8 !important;
                }
                </style>
                <script>
                // Listen for highlight messages from parent window (same as Diagram version)
                window.addEventListener('message', function(event) {
                    if (event.data) {
                        if (event.data.type === 'highlightElement') {
                            highlightElementInASD(event.data.text);
                        } else if (event.data.type === 'clearHighlights') {
                            clearHighlightsInASD();
                        }
                    }
                });
                
                function highlightElementInASD(text) {
                    console.log('ASD: Highlighting element containing:', text);
                    
                    // Clear previous highlights
                    clearHighlightsInASD();
                    
                    // 1. Simple ID-based matching
                    const exactIdElements = document.querySelectorAll('a[id="' + text + '"]');
                    if (exactIdElements.length > 0) {
                        exactIdElements.forEach(element => {
                            element.classList.add('highlighted');
                            console.log('ASD: Highlighted a[id=' + text + ']:', element);
                        });
                        return; // Found exact matches, stop here
                    }
                    
                    // 2. Look for text content that contains the selection as a complete word
                    const textElements = document.querySelectorAll('span, td, th, div, p, a');
                    textElements.forEach(element => {
                        const textContent = element.textContent || '';
                        const id = element.id || '';
                        
                        // Only highlight if:
                        // - Text exactly matches selection
                        // - ID exactly matches selection  
                        // - Text contains selection as complete word (not partial)
                        const isExactTextMatch = textContent.trim() === text.trim();
                        const isExactIdMatch = id === text;
                        const isCompleteWordMatch = textContent.toLowerCase().includes(' ' + text.toLowerCase() + ' ') ||
                                                  textContent.toLowerCase().startsWith(text.toLowerCase() + ' ') ||
                                                  textContent.toLowerCase().endsWith(' ' + text.toLowerCase()) ||
                                                  textContent.toLowerCase() === text.toLowerCase();
                        
                        if (isExactTextMatch || isExactIdMatch || isCompleteWordMatch) {
                            element.classList.add('highlighted');
                            console.log('ASD: Highlighted selective match:', element, 'reason:', 
                                      isExactTextMatch ? 'exact text' : 
                                      isExactIdMatch ? 'exact ID' : 'complete word');
                        }
                    });
                    
                    // 2. SVG elements - use same approach as Diagram version
                    const svgElements = document.querySelectorAll('svg text, svg title');
                    svgElements.forEach(element => {
                        if (element.textContent && element.textContent.toLowerCase().includes(text.toLowerCase())) {
                            // Find the parent group or shape to highlight
                            let parentShape = element.closest('g');
                            if (parentShape) {
                                parentShape.style.filter = 'drop-shadow(0 0 8px #ff6b35)';
                                parentShape.style.opacity = '0.8';
                                parentShape.classList.add('highlighted');
                                console.log('ASD: Highlighted SVG element:', element, 'text:', element.textContent);
                            }
                        }
                    });
                }
                
                function clearHighlightsInASD() {
                    // Clear CSS class highlights
                    const highlighted = document.querySelectorAll('.highlighted');
                    highlighted.forEach(element => {
                        element.classList.remove('highlighted');
                        element.style.filter = '';
                        element.style.opacity = '';
                    });
                }
                
                // Add Ctrl+Click functionality for documentation links
                document.addEventListener('click', function(e) {
                    if (e.ctrlKey || e.metaKey) { // Ctrl on Windows/Linux, Cmd on Mac
                        const link = e.target.closest('a');
                        if (link && link.href) {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Open in new tab/window
                            window.open(link.href, '_blank', 'noopener,noreferrer');
                            console.log('Ctrl+Click: Opened link in new tab:', link.href);
                        }
                    }
                });
                
                // Add click-to-jump functionality for ASD elements (same as Diagram version)
                document.addEventListener('click', function(e) {
                    // Skip if Ctrl+Click (handled above)
                    if (e.ctrlKey || e.metaKey) return;
                    
                    const clickedElement = e.target;
                    let targetId = null;
                    
                    // Try to extract ID from various sources
                    if (clickedElement.id) {
                        targetId = clickedElement.id;
                    } else if (clickedElement.textContent) {
                        // Look for ALPS identifiers in the text content
                        const text = clickedElement.textContent.trim();
                        // Simple heuristic: if it looks like an identifier, use it
                        if (text.match(/^[a-zA-Z][a-zA-Z0-9]*$/)) {
                            targetId = text;
                        }
                    }
                    
                    if (targetId && window.parent !== window) {
                        // Send message to parent window to search for this ID in the editor
                        window.parent.postMessage({
                            type: 'jumpToId',
                            id: targetId
                        }, '*');
                        console.log('ASD: Click-to-jump message sent for:', targetId);
                    }
                });
                </script>
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const showIdRadio = document.getElementById('asd-show-id');
                    const showNameRadio = document.getElementById('asd-show-name');
                    const idGraph = document.getElementById('asd-graph-id');
                    const nameGraph = document.getElementById('asd-graph-name');
                    
                    if (showIdRadio && showNameRadio && idGraph && nameGraph) {
                        showIdRadio.addEventListener('change', function() {
                            if (this.checked) {
                                idGraph.style.display = 'block';
                                nameGraph.style.display = 'none';
                            }
                        });
                        
                        showNameRadio.addEventListener('change', function() {
                            if (this.checked) {
                                nameGraph.style.display = 'block';
                                idGraph.style.display = 'none';
                            }
                        });
                        
                        // 初期化：IDボタンをプログラムでクリック
                        setTimeout(() => {
                            showIdRadio.click();
                        }, 100);
                    }
                });
                </script>`;

                // Fix HTML structure issues before insertion
                responseText = this.fixHtmlStructure(responseText);

                // Insert the code before the closing </head> tag
                if (responseText.includes('</head>')) {
                    responseText = responseText.replace('</head>', initializationCode + '\n</head>');
                } else {
                    // Fallback: insert before </body> or at end
                    if (responseText.includes('</body>')) {
                        responseText = responseText.replace('</body>', initializationCode + '\n</body>');
                    } else {
                        responseText += initializationCode;
                    }
                }

                const blob = new Blob([responseText], { type: 'text/html; charset=utf-8' });
                return URL.createObjectURL(blob);
            } else {
                throw new Error(`ASD generation failed with status: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`ASD generation failed: ${error.message}`);
        }
    }

    fixHtmlStructure(html) {
        // Fix common HTML structure issues that cause XML parsing errors
        return html
            // Fix self-closing tags
            .replace(/<link([^>]*?)(?<!\/)>/g, '<link$1/>')
            .replace(/<meta([^>]*?)(?<!\/)>/g, '<meta$1/>')
            .replace(/<br(?<!\/)>/g, '<br/>')
            .replace(/<hr(?<!\/)>/g, '<hr/>')
            .replace(/<img([^>]*?)(?<!\/)>/g, '<img$1/>')
            // Ensure proper DOCTYPE
            .replace(/^\s*/, '<!DOCTYPE html>\n');
    }
}

class Alps2DotAdapter extends DiagramAdapter {
    constructor() {
        super('alps2dot');
    }

    async generate(content, fileType) {
        try {
            console.log('Alps2DotAdapter.generate called with:', { content: content.substring(0, 200) + '...', fileType });

            // Parse ALPS data first
            const alpsData = this.parseAlpsData(content, fileType);
            
            // Generate DOT content using parsed ALPS data
            const dotContent = this.generateDotFromAlps(alpsData);
            console.log('Generated DOT content:', dotContent.substring(0, 200) + '...');

            // Wait for Viz.js to be available in main page context
            console.log('Checking Viz.js availability...');
            let viz = window.Viz;
            for (let i = 0; i < 50 && (!viz || typeof viz !== 'function'); i++) {
                await new Promise(r => setTimeout(r, 100));
                viz = window.Viz;
                console.log(`Attempt ${i + 1}: Viz available = ${typeof viz}`);
            }

            if (viz && typeof viz === 'function') {
                console.log('Main page: Using pre-loaded Viz.js to generate SVG...');
                try {
                    const vizInstance = new viz();
                    const svgString = await vizInstance.renderString(dotContent, { format: 'svg' });
                    console.log('Main page: SVG generated successfully');
                    
                    // Create relationship data for highlighting
                    const relationships = this.buildRelationshipMap(alpsData);
                    
                    // Return the SVG directly as data URL for iframe-less display
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ALPS Diagram</title>
<style>body{margin:0;padding:20px;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif} .container{background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);padding:20px;} a{cursor:pointer;}</style>
<script>
// ALPS relationship data for parent-child highlighting
window.alpsRelationships = ${JSON.stringify(relationships).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};
console.log('Loaded relationships:', window.alpsRelationships);

document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers to all SVG elements with href="#something"
    const svgLinks = document.querySelectorAll('svg a[href^="#"], svg a[*|href^="#"]');
    console.log('Found SVG links:', svgLinks.length);
    
    svgLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('SVG link clicked:', this);
            
            const href = this.getAttribute('href') || this.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (href && href.startsWith('#')) {
                const id = href.substring(1);
                console.log('Extracted ID:', id);
                
                if (window.parent !== window) {
                    // Send message to parent window to search for this ID in the editor
                    window.parent.postMessage({
                        type: 'jumpToId',
                        id: id
                    }, '*');
                    console.log('Message sent to parent');
                }
            }
        });
    });
    
    // Listen for highlight messages from parent window
    window.addEventListener('message', function(event) {
        if (event.data) {
            if (event.data.type === 'highlightElement') {
                highlightElementInSVG(event.data.text);
            } else if (event.data.type === 'clearHighlights') {
                clearHighlightsInSVG();
            }
        }
    });
    
    function highlightElementInSVG(text) {
        console.log('Highlighting in SVG:', text);
        
        // Clear previous highlights
        clearHighlightsInSVG();
        
        // Simple debug
        console.log('Highlighting text:', text);
        
        // Find SVG elements that contain this text (partial matching)
        const svgElements = document.querySelectorAll('svg text, svg title');
        svgElements.forEach(element => {
            if (element.textContent && element.textContent.toLowerCase().includes(text.toLowerCase())) {
                // Find the parent group or shape to highlight
                let parentShape = element.closest('g');
                if (parentShape) {
                    parentShape.style.filter = 'drop-shadow(0 0 8px #ff6b35)';
                    parentShape.style.opacity = '0.8';
                    parentShape.classList.add('highlighted');
                    console.log('Highlighted text element:', parentShape, 'contains:', text);
                }
            }
        });
        
        // Find by partial ID/class match (case-insensitive)
        const allElements = document.querySelectorAll('svg [id], svg [class]');
        allElements.forEach(element => {
            const id = element.getAttribute('id') || '';
            const className = element.getAttribute('class') || '';
            
            if (id.toLowerCase().includes(text.toLowerCase()) || 
                className.toLowerCase().includes(text.toLowerCase())) {
                element.style.filter = 'drop-shadow(0 0 8px #ff6b35)';
                element.style.opacity = '0.8';
                element.classList.add('highlighted');
                console.log('Highlighted partial match:', element, 'matches:', text);
            }
        });
        
        // Also search in href attributes and other text content
        const allTextNodes = document.querySelectorAll('svg *');
        allTextNodes.forEach(element => {
            // Check various attributes for partial matches
            ['href', 'xlink:href', 'data-id'].forEach(attr => {
                const value = element.getAttribute(attr);
                if (value && value.toLowerCase().includes(text.toLowerCase())) {
                    element.style.filter = 'drop-shadow(0 0 8px #ff6b35)';
                    element.style.opacity = '0.8';
                    element.classList.add('highlighted');
                    console.log('Highlighted attribute match:', element, attr, '=', value);
                }
            });
        });
        
        // STRUCTURAL RELATIONSHIP MATCHING using ALPS hierarchy
        console.log('Using ALPS relationships for:', text);
        
        if (window.alpsRelationships) {
            const relationships = window.alpsRelationships;
            
            // If this text is a child element, highlight its parents
            if (relationships.parentOf[text]) {
                relationships.parentOf[text].forEach(parentId => {
                    console.log('Highlighting parent:', parentId, 'contains child:', text);
                    
                    // Find SVG elements with this parent ID
                    document.querySelectorAll('svg text').forEach(textEl => {
                        if (textEl.textContent && textEl.textContent.trim() === parentId) {
                            let parentGroup = textEl.closest('g');
                            if (parentGroup) {
                                parentGroup.style.filter = 'drop-shadow(0 0 6px #35a3ff)'; // Blue for parents
                                parentGroup.style.opacity = '0.9';
                                parentGroup.classList.add('highlighted');
                                console.log('✓ Highlighted parent element:', parentId);
                            }
                        }
                    });
                });
            }
            
            // If this text is a parent element, highlight its children  
            if (relationships.childrenOf[text]) {
                relationships.childrenOf[text].forEach(childId => {
                    console.log('Highlighting child:', childId, 'of parent:', text);
                    
                    // Find SVG elements with this child ID
                    document.querySelectorAll('svg text').forEach(textEl => {
                        if (textEl.textContent && (textEl.textContent.trim() === childId || textEl.textContent.includes(childId))) {
                            let parentGroup = textEl.closest('g');
                            if (parentGroup) {
                                parentGroup.style.filter = 'drop-shadow(0 0 6px #00ff88)'; // Green for children
                                parentGroup.style.opacity = '0.9';
                                parentGroup.classList.add('highlighted');
                                console.log('✓ Highlighted child element:', childId);
                            }
                        }
                    });
                });
            }
        }
    }
    
    function clearHighlightsInSVG() {
        const highlighted = document.querySelectorAll('.highlighted');
        highlighted.forEach(element => {
            element.style.filter = '';
            element.style.opacity = '';
            element.classList.remove('highlighted');
        });
    }
    
    // Also try with regular click event on the whole document
    document.addEventListener('click', function(e) {
        if (e.target.tagName === 'a' || e.target.closest('a')) {
            const link = e.target.tagName === 'a' ? e.target : e.target.closest('a');
            const href = link.getAttribute('href') || link.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                e.stopPropagation();
                const id = href.substring(1);
                console.log('Document click - extracted ID:', id);
                
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'jumpToId',
                        id: id
                    }, '*');
                }
            }
        }
    });
});
</script>
</head><body><div class="container">${svgString}</div></body></html>`;
                    const blob = new Blob([html], { type: 'text/html' });
                    return URL.createObjectURL(blob);
                } catch (vizError) {
                    console.error('Viz.js rendering error:', vizError);
                    throw new Error(`Viz.js rendering failed: ${vizError.message}`);
                }
            }

            // Fallback: show error message
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ALPS Diagram - Error</title>
<style>body{margin:0;padding:20px;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif} .container{background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);padding:20px;} .error{color:#dc3545;}</style>
</head><body><div class="container"><div class="error"><strong>Diagram generation failed:</strong><br>Viz.js library not available after 5 seconds. Check network connection and try refreshing the page.</div></div></body></html>`;
            const blob = new Blob([html], { type: 'text/html' });
            return URL.createObjectURL(blob);
        } catch (error) {
            throw new Error(`Alps2dot generation failed: ${error.message}`);
        }
    }

    parseAlpsData(content, fileType) {
        console.log('parseAlpsData called with fileType:', fileType);
        let alpsData;

        // Parse ALPS content
        if (fileType === 'JSON') {
            try {
                alpsData = JSON.parse(content);
                console.log('Parsed JSON ALPS data:', alpsData);
            } catch (e) {
                console.error('JSON parsing error:', e);
                throw new Error('Invalid JSON format: ' + e.message);
            }
        } else {
            // Parse XML to extract ALPS data
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, 'text/xml');
                console.log('Parsed XML document:', xmlDoc);
                alpsData = this.xmlToAlpsObject(xmlDoc);
                console.log('Converted to ALPS data:', alpsData);
            } catch (e) {
                console.error('XML parsing error:', e);
                throw new Error('Invalid XML format: ' + e.message);
            }
        }

        return alpsData;
    }

    convertAlpsToDot(content, fileType) {
        // This method is now deprecated - use parseAlpsData + generateDotFromAlps instead
        const alpsData = this.parseAlpsData(content, fileType);
        return this.generateDotFromAlps(alpsData);
    }

    xmlToAlpsObject(xmlDoc) {
        const alpsElement = xmlDoc.documentElement;
        const descriptors = [];

        // Extract only top-level descriptors from XML
        const descriptorElements = xmlDoc.querySelectorAll('alps > descriptor');
        descriptorElements.forEach(desc => {
            const descriptor = {
                id: desc.getAttribute('id'),
                title: desc.getAttribute('title') || desc.getAttribute('id'),
                type: desc.getAttribute('type'),
                rt: desc.getAttribute('rt'),
                tag: desc.getAttribute('tag'),
                def: desc.getAttribute('def') // Schema.org definition indicates ontology
            };

            // Extract nested descriptors (href references) - only direct children
            const nestedDescs = Array.from(desc.children).filter(child => child.tagName === 'descriptor');
            if (nestedDescs.length > 0) {
                descriptor.descriptor = [];
                nestedDescs.forEach(nested => {
                    descriptor.descriptor.push({
                        href: nested.getAttribute('href'),
                        id: nested.getAttribute('id')
                    });
                });
            }

            descriptors.push(descriptor);
        });

        return {
            alps: {
                title: xmlDoc.querySelector('title')?.textContent || 'ALPS Diagram',
                descriptor: descriptors
            }
        };
    }

    generateDotFromAlps(alpsData) {
        const descriptors = alpsData.alps?.descriptor || [];

        // Separate states and transitions (exclude ontology descriptors)
        const states = descriptors.filter(d =>
            d.tag === 'collection' || d.tag === 'item' ||
            (d.id && !d.type && !d.rt && !d.def && d.descriptor && d.descriptor.length > 0)
        );
        const transitions = descriptors.filter(d => d.type && d.rt);

        console.log('States found:', states.map(s => s.id));
        console.log('Transitions found:', transitions.map(t => t.id));

        let dot = `digraph application_state_diagram {
    graph [
        labelloc="t";
        fontname="Helvetica"
    ];
    node [shape = box, style = "bold,filled" fillcolor="lightgray", margin="0.3,0.1"];

`;

        // Add state nodes
        states.forEach(state => {
            if (state.id) {
                dot += `    ${state.id} [margin=0.1, label="${state.title || state.id}", shape=box, URL="#${state.id}"]\n`;
            }
        });

        dot += '\n';

        // Add transitions
        transitions.forEach(trans => {
            if (trans.id && trans.rt) {
                const targetState = trans.rt.replace('#', '');
                const sourceStates = this.findSourceStatesForTransition(trans.id, descriptors);

                sourceStates.forEach(sourceState => {
                    const color = this.getTransitionColor(trans.type);
                    const symbol = this.getTransitionSymbol(trans.type);

                    // Use colored square emoji + black text (no target to prevent navigation)
                    dot += `    ${sourceState} -> ${targetState} [label="${symbol} ${trans.id}" URL="#${trans.id}" fontsize=13 class="${trans.id}" penwidth=1.5];\n`;
                });
            }
        });

        dot += '\n';

        // Add basic state nodes again (for compatibility)
        states.forEach(state => {
            if (state.id) {
                dot += `    ${state.id} [label="${state.title || state.id}" URL="#${state.id}"]\n`;
            }
        });

        dot += '\n}';

        return dot;
    }

    buildRelationshipMap(alpsData) {
        const relationships = {
            parentOf: {}, // parentOf['name'] = ['ProductList', 'UserProfile'] (parents that contain 'name')
            childrenOf: {} // childrenOf['ProductList'] = ['name', 'id', 'goCart'] (children of ProductList)
        };
        
        const descriptors = alpsData.alps?.descriptor || [];
        
        descriptors.forEach(parent => {
            if (parent.id && parent.descriptor && Array.isArray(parent.descriptor)) {
                // Initialize children array for this parent
                relationships.childrenOf[parent.id] = [];
                
                parent.descriptor.forEach(child => {
                    let childId = child.href || child.id;
                    if (childId && childId.startsWith('#')) {
                        childId = childId.substring(1); // Remove #
                    }
                    
                    if (childId) {
                        // Record parent-child relationship
                        relationships.childrenOf[parent.id].push(childId);
                        
                        // Record child-parent relationship
                        if (!relationships.parentOf[childId]) {
                            relationships.parentOf[childId] = [];
                        }
                        relationships.parentOf[childId].push(parent.id);
                    }
                });
            }
        });
        
        console.log('Built relationships:', relationships);
        return relationships;
    }

    findSourceStatesForTransition(transitionId, descriptors) {
        const sources = [];
        descriptors.forEach(desc => {
            if (desc.descriptor && Array.isArray(desc.descriptor)) {
                const hasTransition = desc.descriptor.some(nested =>
                    nested.href === `#${transitionId}` || nested.id === transitionId
                );
                if (hasTransition && desc.id) {
                    sources.push(desc.id);
                }
            }
        });
        return sources.length > 0 ? sources : ['UnknownState'];
    }

    getTransitionColor(type) {
        switch (type) {
            case 'safe': return '#00A86B';
            case 'unsafe': return '#FF4136';
            case 'idempotent': return '#FFDC00';
            default: return '#000000';
        }
    }

    getTransitionSymbol(type) {
        // Use large colored square emoji
        switch (type) {
            case 'safe': return '🟩';      // Green large square
            case 'unsafe': return '🟥';    // Red large square
            case 'idempotent': return '🟨'; // Yellow large square
            default: return '⬛';         // Black large square
        }
    }
}

// Adapter factory and manager
class DiagramAdapterManager {
    constructor() {
        this.adapters = {
            'asd': new AsdAdapter(),
            'alps2dot': new Alps2DotAdapter()
        };
        this.currentAdapter = 'asd'; // default
        this.loadSetting();
    }

    loadSetting() {
        const saved = localStorage.getItem('diagramAdapter');
        if (saved && this.adapters[saved]) {
            this.currentAdapter = saved;
        }
    }

    saveSetting() {
        localStorage.setItem('diagramAdapter', this.currentAdapter);
    }

    setAdapter(adapterName) {
        if (this.adapters[adapterName]) {
            this.currentAdapter = adapterName;
            this.saveSetting();
            return true;
        }
        return false;
    }

    getCurrentAdapter() {
        return this.adapters[this.currentAdapter];
    }

    getAdapterNames() {
        return Object.keys(this.adapters);
    }

    async generateDiagram(content, fileType) {
        const adapter = this.getCurrentAdapter();
        return await adapter.generate(content, fileType);
    }
}

export { DiagramAdapterManager };

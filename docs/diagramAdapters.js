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
                </style>
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
            
            // Generate DOT content using simple ALPS to DOT conversion
            const dotContent = this.convertAlpsToDot(content, fileType);
            console.log('Generated DOT content:', dotContent.substring(0, 200) + '...');
            
            // Now let's render the DOT as SVG using WASM Graphviz
            const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>ALPS Diagram (alps2dot + Graphviz)</title>
                        <script src="https://d3js.org/d3.v7.min.js"></script>
                        <script src="https://unpkg.com/@hpcc-js/wasm@2.21.0/dist/graphviz.umd.js"></script>
                        <script src="https://unpkg.com/d3-graphviz@5.6.0/build/d3-graphviz.min.js"></script>
                        <style>
                            body { 
                                margin: 0; 
                                padding: 20px; 
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                background: #f8f9fa;
                            }
                            .container {
                                background: white;
                                border-radius: 8px;
                                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                                padding: 20px;
                                min-height: 400px;
                            }
                            .info {
                                position: fixed;
                                top: 10px;
                                right: 10px;
                                background: rgba(52, 152, 219, 0.9);
                                color: white;
                                padding: 8px 12px;
                                border-radius: 4px;
                                font-size: 12px;
                                font-weight: 500;
                                z-index: 1000;
                            }
                            .loading {
                                color: #666;
                                text-align: center;
                                padding: 40px 20px;
                            }
                            #graphviz-output {
                                text-align: center;
                                margin-top: 20px;
                            }
                            #graphviz-output svg {
                                max-width: 100%;
                                height: auto;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div id="graphviz-output">
                                <div class="loading">Loading Graphviz WASM...</div>
                            </div>
                        </div>
                        
                        <script>
                            // Auto-render when page loads
                            document.addEventListener('DOMContentLoaded', function() {
                                tryGraphvizRender();
                            });

                            // Also try immediately if DOM is already loaded
                            if (document.readyState !== 'loading') {
                                tryGraphvizRender();
                            }
                            
                            async function tryGraphvizRender() {
                                const outputDiv = document.getElementById('graphviz-output');
                                if (!outputDiv) {
                                    setTimeout(tryGraphvizRender, 100);
                                    return;
                                }
                                
                                try {
                                    // Create a div for d3-graphviz
                                    outputDiv.innerHTML = '<div id="graph"></div>';
                                    
                                    // Wait a moment for libraries to be ready
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    
                                    // Use d3-graphviz like ASD does
                                    const dot = \`${dotContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
                                    
                                    // Render using d3-graphviz (same approach as ASD)
                                    d3.select("#graph")
                                        .graphviz()
                                        .renderDot(dot);
                                    
                                } catch (error) {
                                    console.error('Graphviz rendering error:', error);
                                    outputDiv.innerHTML = \`
                                        <div style="color: #dc3545; padding: 20px; text-align: left;">
                                            <strong>Diagram rendering failed:</strong><br>
                                            \${error.message}<br><br>
                                            <details>
                                                <summary>View DOT source</summary>
                                                <pre style="background: #f8f9fa; padding: 10px; margin-top: 10px; font-size: 11px; overflow: auto; max-height: 200px;">\${dotContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                                            </details>
                                        </div>
                                    \`;
                                }
                            }
                        </script>
                    </body>
                    </html>
                `;
            
            const blob = new Blob([html], { type: 'text/html' });
            return URL.createObjectURL(blob);
        } catch (error) {
            throw new Error(`Alps2dot generation failed: ${error.message}`);
        }
    }

    convertAlpsToDot(content, fileType) {
        console.log('convertAlpsToDot called with fileType:', fileType);
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
        
        const dotResult = this.generateDotFromAlps(alpsData);
        console.log('Generated DOT result:', dotResult);
        return dotResult;
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
                dot += `    ${state.id} [margin=0.1, label="${state.title || state.id}", shape=box, URL="#${state.id}" target="_parent"]\n`;
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
                    
                    dot += `    ${sourceState} -> ${targetState} [label=<<table border="0" cellborder="0" cellspacing="0" cellpadding="0"><tr><td valign="middle" href="#${trans.id}" tooltip="${trans.title || trans.id} (${trans.type})"><font color="${color}">${symbol}</font> ${trans.id}</td></tr></table>> URL="#${trans.id}" target="_parent" fontsize=13 class="${trans.id}" penwidth=1.5];\n`;
                });
            }
        });

        dot += '\n';

        // Add basic state nodes again (for compatibility)
        states.forEach(state => {
            if (state.id) {
                dot += `    ${state.id} [label="${state.title || state.id}" URL="#${state.id}" target="_parent"]\n`;
            }
        });

        dot += '\n}';
        
        return dot;
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
        // Use consistent square symbol - color differentiation is sufficient
        switch (type) {
            case 'safe': return '■';
            case 'unsafe': return '■';
            case 'idempotent': return '■';
            default: return '■';
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
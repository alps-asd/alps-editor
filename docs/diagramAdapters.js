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
    
}

class Alps2DotAdapter extends DiagramAdapter {
    constructor() {
        super('alps2dot');
    }

    async generate(content, fileType) {
        try {
            // 1. Parse ALPS and convert to DOT
            const dotContent = this.convertAlpsToDot(content, fileType);
            
            // 2. Load Graphviz WASM if needed
            await this.ensureGraphvizLoaded();
            
            // 3. Generate SVG using d3-graphviz
            const svg = await this.generateSvgFromDot(dotContent);
            
            // 4. Return as data URL
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            
        } catch (error) {
            throw new Error(`Diagram generation failed: ${error.message}`);
        }
    }
    
    async ensureGraphvizLoaded() {
        if (window.d3 && window.d3.graphviz) return;
        
        try {
            // Load d3 first if not available
            if (!window.d3) {
                await this.loadScript('https://d3js.org/d3.v7.min.js');
            }
            
            // Load d3-graphviz
            await this.loadScript('https://unpkg.com/d3-graphviz@5.6.0/build/d3-graphviz.js');
            
            // Wait for d3.graphviz to be available
            let attempts = 0;
            while ((!window.d3 || !window.d3.graphviz) && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!window.d3 || !window.d3.graphviz) {
                throw new Error('d3-graphviz not available after loading');
            }
            
        } catch (error) {
            throw new Error(`Failed to load Graphviz dependencies: ${error.message}`);
        }
    }
    
    async loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if script is already loaded
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }
    
    async generateSvgFromDot(dotContent) {
        return new Promise((resolve, reject) => {
            // Create a temporary container for d3-graphviz
            const tempContainer = document.createElement('div');
            tempContainer.style.display = 'none';
            document.body.appendChild(tempContainer);
            
            try {
                // Use d3-graphviz to render SVG
                window.d3.select(tempContainer)
                    .graphviz()
                    .renderDot(dotContent)
                    .on('end', () => {
                        try {
                            const svgElement = tempContainer.querySelector('svg');
                            if (svgElement) {
                                const svgString = new XMLSerializer().serializeToString(svgElement);
                                document.body.removeChild(tempContainer);
                                resolve(svgString);
                            } else {
                                document.body.removeChild(tempContainer);
                                reject(new Error('No SVG element generated'));
                            }
                        } catch (error) {
                            document.body.removeChild(tempContainer);
                            reject(error);
                        }
                    });
            } catch (error) {
                document.body.removeChild(tempContainer);
                reject(error);
            }
        });
    }

    convertAlpsToDot(content, fileType) {
        // Parse ALPS content
        const alpsData = fileType === 'JSON' 
            ? JSON.parse(content)
            : this.xmlToAlpsObject(new DOMParser().parseFromString(content, 'text/xml'));
        
        return this.generateDotFromAlps(alpsData);
    }

    xmlToAlpsObject(xmlDoc) {
        const descriptors = Array.from(xmlDoc.querySelectorAll('alps > descriptor')).map(desc => {
            const descriptor = {
                id: desc.getAttribute('id'),
                title: desc.getAttribute('title') || desc.getAttribute('id'),
                type: desc.getAttribute('type'),
                rt: desc.getAttribute('rt'),
                tag: desc.getAttribute('tag')
            };
            
            const nestedDescs = Array.from(desc.children).filter(child => child.tagName === 'descriptor');
            if (nestedDescs.length > 0) {
                descriptor.descriptor = nestedDescs.map(nested => ({
                    href: nested.getAttribute('href'),
                    id: nested.getAttribute('id')
                }));
            }
            
            return descriptor;
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
        const states = descriptors.filter(d => d.tag === 'collection' || d.tag === 'item' || 
            (d.id && !d.type && !d.rt && d.descriptor?.length > 0));
        const transitions = descriptors.filter(d => d.type && d.rt);
        
        let dot = `digraph "${alpsData.alps?.title || 'ALPS Diagram'}" {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fillcolor=lightblue];
    edge [fontsize=10];

`;

        // Add state nodes
        states.forEach(state => {
            if (state.id) {
                dot += `    "${state.id}" [label="${state.title || state.id}"];\n`;
            }
        });

        // Add transitions
        transitions.forEach(trans => {
            if (trans.id && trans.rt) {
                const targetState = trans.rt.replace('#', '');
                const sourceStates = this.findSourceStatesForTransition(trans.id, descriptors);
                const color = this.getTransitionColor(trans.type);
                
                sourceStates.forEach(sourceState => {
                    dot += `    "${sourceState}" -> "${targetState}" [label="${trans.id}", color="${color}"];\n`;
                });
            }
        });

        dot += '}';
        return dot;
    }

    findSourceStatesForTransition(transitionId, descriptors) {
        const sources = descriptors
            .filter(desc => desc.descriptor?.some(nested => 
                nested.href === `#${transitionId}` || nested.id === transitionId))
            .map(desc => desc.id)
            .filter(Boolean);
        return sources.length > 0 ? sources : ['Start'];
    }

    getTransitionColor(type) {
        const colors = {
            safe: 'green',
            unsafe: 'red', 
            idempotent: 'blue'
        };
        return colors[type] || 'black';
    }
}

// Adapter factory and manager
class DiagramAdapterManager {
    constructor() {
        // Static version - only alps2dot adapter available (no PHP server)
        this.adapters = {
            'alps2dot': new Alps2DotAdapter()
        };
        this.currentAdapter = 'alps2dot';
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

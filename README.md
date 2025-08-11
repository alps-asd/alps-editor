# ALPS Online Editor


<img src="https://www.app-state-diagram.com/images/home.png" width=100px>

ALPS Online Editor is a web-based editor for creating and editing Application-Level Profile Semantics (ALPS) documents. It supports both XML and JSON formats with real-time validation, auto-completion, and live preview features.

## Usage

### Online Version

Visit [app-state-diagram.com](https://app-state-diagram.com) to use the editor directly in your browser.

### Static Version (GitHub Pages)

Try the static version at [alps-asd.github.io/alps-editor](https://alps-asd.github.io/alps-editor) - no server required, works entirely in your browser with client-side diagram generation.

### Offline Usage

#### Prerequisites
- PHP 8.0 or higher
- Composer

#### Installation

1. Clone the repository
2. 
```bash
git clone https://github.com/alps-asd/alps-editor
cd alps-editor
```

2. Install dependencies
3. 
```bash
composer install
```

3. Start the local server
```bash
composer serve
```

4. Open [http://localhost:8081/](http://localhost:8081/) in your browser

## Features

### 🎯 Interactive Diagram Experience
- **Bidirectional highlighting**: Select text in editor → elements glow in diagram
- **Click-to-jump navigation**: Click diagram elements → jump to code line
- **Dual rendering modes**: Switch between Document (ASD) and Diagram (SVG) views
- **Real-time visual feedback**: Instant synchronization between editor and diagrams

### 🎨 Smart Auto-Completion
- Press `Ctrl + Space` to show context-aware snippets
- When starting from scratch:
    1. Clear the editor content
    2. Press `Ctrl + Space`
    3. Choose either "ALPS XML Skeleton" or "ALPS JSON Skeleton"
    4. Fill in the placeholders using `Tab`

### ✅ Real-Time Validation
- Automatic validation against ALPS schema
- Immediate visual feedback on errors
- Detailed error messages with line numbers
- Live preview of the rendered ALPS document

### 📁 File Management
- Support for both XML and JSON ALPS formats
- Drag and drop ALPS files directly into the editor
- Accepts JSON, XML, and HTML files containing ALPS profiles
- Quick save with `Ctrl + S` (or `Cmd + S` on Mac)

### 💡 Smart Suggestions
- Context-aware descriptor completions
- Automatic href suggestions from existing descriptors
- Built-in semantic terms from Schema.org

## Getting Started

1. **Creating a New Document**
    - Clear the editor content
    - Press `Ctrl + Space`
    - Select either "ALPS XML Skeleton" or "ALPS JSON Skeleton"
    - Start filling in your API description

2. **Adding Descriptors**
    - Type at desired location
    - Press `Ctrl + Space` for suggestions
    - Available snippet types:
        - Ontology (with/without href)
        - Taxonomy
        - Choreography (with/without parameters)

3. **Opening Existing Files**
    - Drag and drop your ALPS file into the editor
    - Supports:
        - `.json` (ALPS JSON format)
        - `.xml` (ALPS XML format)
        - `.html` (Will extract ALPS profile if present)

4. **Saving Your Work**
    - Press `Ctrl + S` (or `Cmd + S` on Mac)
    - File will be downloaded in current format

## Keyboard Shortcuts

- `Ctrl + Space`: Show auto-completion suggestions
- `Ctrl + S` / `Cmd + S`: Save document
- `Tab`: Navigate through snippet placeholders
- `Shift + Tab`: Navigate backwards through placeholders

## Interactive Features

- **Text selection**: Select any text in the editor to highlight corresponding elements in the diagram
- **Click navigation**: Click on any element in the diagram to jump to its definition in the editor
- **Mode switching**: Use the dropdown to switch between Document (server-generated) and Diagram (client-generated) views

## Validation

The editor performs two types of validation:
1. Syntax validation (JSON/XML)
2. ALPS semantic validation against the official ALPS schema

Error indicators:
- ❌ Red squiggly underline: Syntax error
- ✅ Green checkmark: Valid ALPS document

## References

- [app-state-diagram](https://www.app-state-diagram.com/)
- [ALPS Specification](http://alps.io/)
- [Schema.org](https://schema.org) (source for semantic terms)

# ALPS Online Editor

<img src="https://www.app-state-diagram.com/images/home.png" width=100px>

ALPS Online Editor is a web-based editor for creating and editing Application-Level Profile Semantics (ALPS) documents. It supports both XML and JSON formats with real-time validation, auto-completion, and live preview features.

## Usage

### Online Version

Visit [alps-asd.github.io/alps-editor](https://alps-asd.github.io/alps-editor) to use the editor directly in your browser. No server required - runs entirely client-side.

### Local Development

```bash
cd docs && php -S localhost:8080
```

Then open http://localhost:8080/index.html

## Features

### Interactive Diagram Experience
- **Bidirectional highlighting**: Select text in editor → elements glow in diagram
- **Click-to-jump navigation**: Click diagram elements → jump to code line
- **View modes**: Switch between Document, Diagram, and Preview views
- **Real-time visual feedback**: Instant synchronization between editor and diagrams

### Smart Auto-Completion
- Press `Ctrl + Space` to show context-aware snippets
- When starting from scratch:
    1. Clear the editor content
    2. Press `Ctrl + Space`
    3. Choose either "ALPS XML Skeleton" or "ALPS JSON Skeleton"
    4. Fill in the placeholders using `Tab`

### Real-Time Validation
- Automatic validation against ALPS schema
- Immediate visual feedback on errors
- Detailed error messages with line numbers
- Live preview of the rendered ALPS document

### File Management
- Support for both XML and JSON ALPS formats
- Drag and drop ALPS files directly into the editor
- Accepts JSON, XML, and HTML files containing ALPS profiles
- Download as HTML, SVG, or Profile (JSON/XML)

### Smart Suggestions
- Context-aware descriptor completions
- Automatic href suggestions from existing descriptors
- Built-in semantic terms from Schema.org

## Keyboard Shortcuts

- `Ctrl + Space`: Show auto-completion suggestions
- `Ctrl + S` / `Cmd + S`: Save document
- `Tab`: Navigate through snippet placeholders
- `Shift + Tab`: Navigate backwards through placeholders

## Validation

The editor performs two types of validation:
1. Syntax validation (JSON/XML)
2. ALPS semantic validation against the official ALPS schema

## References

- [app-state-diagram](https://www.app-state-diagram.com/)
- [ALPS Specification](http://alps.io/)
- [Schema.org](https://schema.org) (source for semantic terms)

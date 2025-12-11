# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALPS Online Editor is a web-based editor for creating and editing Application-Level Profile Semantics (ALPS) documents. It supports both XML and JSON formats with real-time validation, auto-completion, and live preview features.

This is a **serverless/static** implementation that runs entirely in the browser without any backend server.

## Development Commands

### Local Development
```bash
cd docs && php -S localhost:8080
```
Then open http://localhost:8080/index.html

## Architecture

### File Structure
```
/
├── README.md
├── LICENSE
├── CLAUDE.md
├── .gitignore
├── examples/           # Sample ALPS files
│   └── amazon.json
└── docs/               # GitHub Pages (public site)
    ├── index.html      # Main HTML page
    ├── alps.json       # ALPS JSON schema for validation
    └── js/
        ├── scripts.js          # Main AlpsEditor class
        ├── diagramAdapters.js  # ALPS→DOT + Graphviz WASM
        ├── descriptor2table.js # Descriptor to HTML table
        ├── semanticTerms.js    # Schema.org vocabulary
        └── styles.css          # Editor styles
```

### Frontend (Client-side only)
- **Primary Interface**: `docs/index.html` - Main HTML page with Ace editor integration
- **Core JavaScript**: `docs/js/scripts.js` - Main AlpsEditor class handling:
  - Ace editor setup with auto-completion
  - Real-time ALPS validation (JSON schema and XML)
  - File drag & drop handling
  - View mode switching (Document/Diagram/Preview)
- **Diagram System**: `docs/js/diagramAdapters.js` - ALPS→DOT conversion + WASM Graphviz rendering
- **Table Generator**: `docs/js/descriptor2table.js` - Converts descriptors to HTML table
- **Styling**: `docs/js/styles.css` - Editor and UI styles
- **Semantic Terms**: `docs/js/semanticTerms.js` - Schema.org vocabulary for auto-completion

### Key Dependencies (CDN)
- Ace Editor - Code editor
- Axios - HTTP client
- AJV - JSON schema validator
- Viz.js - Graphviz WASM for DOT→SVG conversion

### View Modes
The editor supports three view modes:
1. **Document** - Full HTML documentation with diagram and descriptor table
2. **Diagram** - SVG state diagram only
3. **Preview** - Hide editor, show document full-width

### Validation System
The editor performs dual validation:
1. **Syntax validation** - JSON/XML parsing validation
2. **ALPS semantic validation** - Against official ALPS schema

### Deployment
- Hosted via GitHub Pages from `docs/` directory
- No server required - runs entirely in browser

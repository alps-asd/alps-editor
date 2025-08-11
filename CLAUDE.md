# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALPS Online Editor is a web-based editor for creating and editing Application-Level Profile Semantics (ALPS) documents. It supports both XML and JSON formats with real-time validation, auto-completion, and live preview features.

## Development Commands

### Local Development
- `composer serve` - Start local PHP server on localhost:8001 (configured in composer.json:24)
- `composer install` - Install PHP dependencies

### Prerequisites
- PHP 8.0 or higher (required in composer.json:12)
- Composer for PHP dependency management
- Node.js 18.x (specified in package.json:2-4 for deployment)

## Architecture

### Frontend (Client-side)
- **Primary Interface**: `index.html` - Main HTML page with Ace editor integration and dual-mode selector
- **Core JavaScript**: `scripts.js` - Main AlpsEditor class handling:
  - Ace editor setup with auto-completion
  - Real-time ALPS validation (both JSON schema and XML XSD)
  - File drag & drop handling
  - Dual-mode rendering via DiagramAdapterManager
- **Diagram System**: `diagramAdapters.js` - Modular diagram generation system:
  - Alps2DotAdapter - Client-side ALPS→DOT conversion + WASM Graphviz rendering
  - AsdAdapter - Server-side rendering via PHP ASD library
- **Styling**: `styles.css` - Editor and UI styles
- **Semantic Terms**: `semanticTerms.js` - Schema.org vocabulary for auto-completion

### Backend (PHP)
- **Entry Point**: `index.php` - Router handling GET (serve HTML) and POST (API) requests
- **API Endpoints**:
  - `api/alps_processor.php` - Processes ALPS profiles and generates state diagrams using koriym/app-state-diagram
  - `api/save-file.php` - File save functionality
  - `api/index.php` - Main API handler
- **Core Library**: Uses `koriym/app-state-diagram` package for ALPS processing and diagram generation

### Key Dependencies
- **PHP**: `koriym/app-state-diagram` (dev-master) - Core ALPS processing library
- **Frontend**: Ace Editor, Axios, AJV JSON validator, @hpcc-js/wasm@2.21.0, d3-graphviz@5.6.0 loaded via CDN
- **Deployment**: Configured for Vercel with vercel-php runtime

### File Structure
- `src/` - PHP source files with PSR-4 autoloading (Koriym\\AlpsEditor namespace)
- `api/` - PHP API endpoints
- `bin/` - CLI utilities
- `docs/` - Static version for GitHub Pages deployment (diagram-only mode)
- Frontend assets are in root directory

### Rendering Modes
The editor supports two rendering modes:
1. **Diagram Mode** - JavaScript-based ALPS→DOT conversion with WASM Graphviz rendering
2. **Document Mode** - Server-side HTML generation via PHP ASD library

### Validation System
The editor performs dual validation:
1. **Syntax validation** - JSON/XML parsing validation
2. **ALPS semantic validation** - Against official ALPS schema for both JSON and XML formats

### Deployment Options
- **Server version** (`index.html`) - Full functionality requiring PHP server
- **Static version** (`docs/index.html`) - Diagram-only mode for GitHub Pages/static hosting
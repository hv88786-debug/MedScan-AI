# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — MVP Release

### Added
- **Backend (Express, Node.js 18+)**
  - `POST /api/upload` — validated file upload (PDF/JPG/JPEG/PNG, 10 MB max)
  - `POST /api/extract-text` — PDF text extraction (`pdf-parse`) and image
    OCR (`tesseract.js`), with path-traversal-safe filename handling
  - `GET /api/processing-status/:filename` — in-memory extraction status
  - `POST /api/parse-report` — conservative lab-parameter line parser with
    documented `<`/`>` range conventions
  - `POST /api/analyze` — Gemini-powered plain-language explanation of
    parsed parameters, with strict prompt rules (no diagnosis, no
    prescriptions, no invented values) and response validation/normalization
  - `POST /api/analyze-report` — single-call pipeline chaining upload → OCR
    → parse → analyze, with per-step error reporting and guaranteed file
    cleanup on every exit path
  - `GET /api/health` — health check
- **Frontend (single-file HTML/CSS/JS)**
  - Full guided screen flow: Landing → Upload → Processing → Report
    Overview → Detailed Analysis → Report Ready
  - Real API integration: file upload via `FormData`, live processing
    animation joined to the actual network request (no simulated progress)
  - Report Overview and Detailed Analysis screens populated entirely from
    the API response — parameter tables, abnormal-value cards, risk badge,
    key findings, health insights, recommendations
  - Friendly toast messaging for every failure mode: offline, server
    error, validation error, OCR failure, Gemini failure, unsupported file
    type, oversized file
  - Client-side PDF export (jsPDF + jspdf-autotable) generated entirely in
    the browser from `appState` — no server round-trip, no fabricated data
  - Full app-state reset via "Analyze Another Report"
- **Documentation**
  - Root `README.md`, `backend/README.md`, `frontend/README.md`
  - `docs/API.md`, `docs/PROJECT_STRUCTURE.md`, `docs/MVP_FEATURES.md`,
    `docs/UI_FLOW.md`
  - MIT `LICENSE` and Node.js-focused `.gitignore`

### Security
- No database, no authentication, no `localStorage`/`sessionStorage`, no
  persistent report history
- Uploaded files are deleted immediately after processing, success or
  failure

### Known Limitations
- No automated test suite or CI pipeline yet
- No server-side PDF generation (client-side only)
- No rate limiting or auth — not intended for public/production deployment
  as-is

[1.0.0]: #100--mvp-release

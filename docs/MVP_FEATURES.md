# MVP Features

Scope of the v1.0.0 MedScan AI release.

## In Scope (v1.0.0)

### Upload & Ingestion
- Upload a single report as PDF, JPG, JPEG, or PNG
- 10 MB max file size, enforced client-side and server-side
- Drag-and-drop, file picker, and camera capture on the Upload screen

### Text Extraction
- PDF text extraction via `pdf-parse`
- Image OCR via `tesseract.js`
- In-memory processing status (`idle / extracting / completed / failed`)

### Lab Parameter Parsing
- Conservative single-line parser: `name value [unit] [reference range]`
- Supports `min-max` ranges and `<`/`>` single-sided ranges
- Explicitly skips ambiguous lines (e.g. `BP 120/80 mmHg`, dates, free text)
  rather than guessing
- Returns per-parameter status: `Normal`, `Low`, `High`, or `Unknown`

### AI Analysis
- Sends only structured parameters (never raw text) to the Gemini API
- Plain-language summary, risk level, key findings, health insights,
  recommendations
- Hard rules enforced in the prompt: no diagnosis, no prescriptions, no
  invented values, mandatory disclaimer
- Server normalizes/validates the model's JSON response before returning it

### One-Call Pipeline
- `POST /api/analyze-report` chains upload → OCR → parse → analyze
- Reports the exact failing step on error
- Uploaded file is always deleted after processing (success or failure)

### Frontend Experience
- Guided screen flow: Landing → Upload → Processing → Report Overview →
  Detailed Analysis → Report Ready
- Real-time processing animation joined to the actual network request
  (no fake progress percentages)
- Report Overview: summary, parameter counts, risk badge, key findings
- Detailed Analysis: full parameter table, abnormal-value call-outs,
  health insights, recommendations
- Client-side PDF export (jsPDF + jspdf-autotable) — no server round-trip
- Friendly toast messages for every failure mode (offline, server error,
  validation error, OCR failure, Gemini failure, unsupported file, oversized
  file)
- "Analyze Another Report" fully resets app state

### Privacy & Security
- No database, no authentication, no accounts
- No `localStorage` / `sessionStorage` usage
- No persistent report history
- Uploaded files never stored beyond the lifetime of a single request

## Explicitly Out of Scope (v1.0.0)

- User accounts / authentication
- Persistent database or report history
- Server-side PDF generation
- Multi-report or multi-page batch analysis
- Configurable/regional reference ranges
- Automated test suite / CI pipeline
- Rate limiting or abuse protection for public deployment

See the root [README.md](../README.md#future-roadmap) for the longer-term
roadmap.

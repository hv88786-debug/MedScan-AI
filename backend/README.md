# MedScan AI — Backend

Express backend for the MedScan AI MVP: file upload, OCR text extraction,
conservative lab-parameter parsing, and Gemini-powered plain-language
analysis. No database, no authentication — everything is stateless and
in-memory beyond the temporary uploaded file.

## Installation

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set GEMINI_API_KEY
```

```bash
npm start     # normal start -> http://localhost:5000
npm run dev   # auto-restart on file changes (nodemon)
```

Requires **Node.js 18+** (the app uses the built-in `fetch`, no extra HTTP
client library).

## Environment Variables

Defined in `.env.example` — copy it to `.env` and fill in your own values:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | Port the Express server listens on |
| `GEMINI_API_KEY` | Yes (for `/api/analyze` & `/api/analyze-report`) | — | API key from [Google AI Studio](https://aistudio.google.com/app/apikey) |

## API Endpoints

Full documentation with example requests/responses is in
[`../docs/API.md`](../docs/API.md). Quick reference:

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| GET  | `/api/health` | — | Simple health check |
| POST | `/api/upload` | `multipart/form-data`, field `report` | Saves file to `uploads/`, returns file metadata |
| POST | `/api/extract-text` | `{ filename, mimetype }` | Runs OCR/PDF extraction on a previously uploaded file |
| GET  | `/api/processing-status/:filename` | — | In-memory status: `idle \| extracting \| completed \| failed` |
| POST | `/api/parse-report` | `{ text, filename? }` | Extracts structured lab parameters from raw text |
| POST | `/api/analyze` | `{ filename?, parameters }` | Sends parsed parameters to Gemini for a plain-language explanation |
| POST | `/api/analyze-report` | `multipart/form-data`, field `report` | Full pipeline: upload → OCR → parse → analyze, in one call |

## Example Requests

**Health check**
```bash
curl http://localhost:5000/api/health
```

**Upload a report**
```bash
curl -X POST http://localhost:5000/api/upload \
  -F "report=@/path/to/your/file.pdf"
```

**Extract text**
```bash
curl -X POST http://localhost:5000/api/extract-text \
  -H "Content-Type: application/json" \
  -d '{"filename": "report-12345.pdf", "mimetype": "application/pdf"}'
```

**Parse lab parameters**
```bash
curl -X POST http://localhost:5000/api/parse-report \
  -H "Content-Type: application/json" \
  -d '{"text": "Hemoglobin 13.2 g/dL 12-16\nGlucose: 105 mg/dL (70 - 100)"}'
```

**Analyze parsed parameters**
```bash
curl -X POST http://localhost:5000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "report-12345.pdf",
    "parameters": [
      { "name": "Hemoglobin", "value": 13.2, "unit": "g/dL", "referenceRange": "12-16", "status": "Normal" }
    ]
  }'
```

**Full pipeline (used by the frontend)**
```bash
curl -X POST http://localhost:5000/api/analyze-report \
  -F "report=@/path/to/report.pdf"
```

## Error Handling

Every endpoint returns a consistent shape on failure:

```json
{ "success": false, "message": "Human-readable description of what went wrong" }
```

`/api/analyze-report` additionally includes a `"step"` field so the caller
knows exactly where the pipeline stopped:

```json
{ "success": false, "step": "upload" | "ocr" | "parser" | "analysis", "message": "…" }
```

Common failure cases and their HTTP status:

| Status | Cause |
|---|---|
| 400 | Missing/invalid fields, invalid file type, invalid filename |
| 404 | File not found (e.g. `/api/extract-text` on an unknown filename) |
| 422 | No structured lab parameters detected — nothing to analyze |
| 429 | Gemini API rate limit exceeded |
| 500 | Unexpected server error, missing `GEMINI_API_KEY` |
| 502 | Gemini network error or unparsable response |
| 504 | Gemini request timed out (30s) |

Uploaded files are always deleted after `/api/analyze-report` finishes,
success or failure — nothing is stored permanently.

## Dependencies

| Package | Purpose |
|---|---|
| `express` | Web framework |
| `multer` | Multipart file upload handling |
| `cors` | Cross-origin requests from the frontend |
| `dotenv` | Loads `.env` into `process.env` |
| `pdf-parse` | Extracts text from PDF files |
| `tesseract.js` | OCR for JPG/JPEG/PNG images |
| `nodemon` *(dev)* | Auto-restarts the server on file changes |

> **Note on `tesseract.js`:** the first OCR run downloads the English
> language data file (~11 MB) from a CDN, so the server needs internet
> access at least once before image OCR will work.

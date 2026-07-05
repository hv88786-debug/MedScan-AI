# MedScan AI — API Reference

Base URL (local development): `http://localhost:5000/api`

All responses are JSON. Every response includes a `success` boolean.
Failure responses always include a human-readable `message`; some also
include a `step` field (see `/api/analyze-report`).

---

## GET /api/health

Simple health check — confirms the API process is running.

**Request body:** none

**Response 200**
```json
{
  "success": true,
  "message": "MedScan AI API is running"
}
```

---

## POST /api/upload

Uploads a single report file. Field name **must** be `report`.
Allowed types: PDF, JPG, JPEG, PNG. Max size: 10 MB.

**Request:** `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `report` | file | Yes |

**Response 200 (success)**
```json
{
  "success": true,
  "message": "Report uploaded successfully",
  "file": {
    "originalName": "bloodwork.pdf",
    "filename": "report-1720120000000-123456789.pdf",
    "mimetype": "application/pdf",
    "size": 245678,
    "path": "/absolute/path/to/backend/uploads/report-1720120000000-123456789.pdf"
  }
}
```

**Response 400 — invalid file type**
```json
{ "success": false, "message": "Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed." }
```

**Response 400 — file too large**
```json
{ "success": false, "message": "File is too large. Maximum allowed size is 10 MB." }
```

**Response 400 — no file provided**
```json
{ "success": false, "message": "No file uploaded. Please attach a file using the \"report\" field." }
```

---

## POST /api/extract-text

Runs OCR (images) or text extraction (PDF) on a file that was already
saved to `uploads/` by `/api/upload`.

**Request body**
```json
{
  "filename": "report-1720120000000-123456789.pdf",
  "mimetype": "application/pdf"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `filename` | string | Yes | Must reference a file already in `uploads/`; sanitized against path traversal |
| `mimetype` | string | Yes | Must be one of `application/pdf`, `image/jpeg`, `image/png` |

**Response 200 (success)**
```json
{
  "success": true,
  "message": "Text extracted successfully",
  "data": {
    "filename": "report-1720120000000-123456789.pdf",
    "mimetype": "application/pdf",
    "text": "Hemoglobin 13.2 g/dL 12-16\nGlucose: 105 mg/dL (70 - 100)\n...",
    "characterCount": 812
  }
}
```

**Response 200 — no readable text found** (still `success: true`, honest empty result)
```json
{
  "success": true,
  "message": "No readable text was found in this file.",
  "data": { "filename": "report-1720120000000-123456789.pdf", "mimetype": "application/pdf", "text": "", "characterCount": 0 }
}
```

**Response 400 — missing fields / invalid filename**
```json
{ "success": false, "message": "Both \"filename\" and \"mimetype\" are required." }
```

**Response 404 — file not found**
```json
{ "success": false, "message": "File not found in uploads folder." }
```

**Response 500 — extraction failed**
```json
{ "success": false, "message": "Failed to extract text from the file." }
```

---

## GET /api/processing-status/:filename

Returns the in-memory OCR processing status for a given filename.
Resets whenever the server restarts (no database).

**Response 200**
```json
{
  "success": true,
  "filename": "report-1720120000000-123456789.pdf",
  "status": "completed"
}
```

`status` is one of: `"idle"`, `"extracting"`, `"completed"`, `"failed"`.

---

## POST /api/parse-report

Parses raw report text (typically the output of `/api/extract-text`) into
structured lab parameters. Deliberately conservative — see
`backend/services/reportParser.js` for the exact matching rules.

**Request body**
```json
{
  "text": "Hemoglobin 13.2 g/dL 12-16\nGlucose: 105 mg/dL (70 - 100)\nBP 120/80 mmHg",
  "filename": "report-1720120000000-123456789.pdf"
}
```

| Field | Type | Required |
|---|---|---|
| `text` | string | Yes (non-empty) |
| `filename` | string | No |

**Response 200**
```json
{
  "success": true,
  "message": "Report parsed successfully",
  "data": {
    "filename": "report-1720120000000-123456789.pdf",
    "parameters": [
      {
        "name": "Hemoglobin",
        "value": 13.2,
        "unit": "g/dL",
        "referenceRange": "12-16",
        "minRange": 12,
        "maxRange": 16,
        "status": "Normal",
        "originalLine": "Hemoglobin 13.2 g/dL 12-16"
      },
      {
        "name": "Glucose",
        "value": 105,
        "unit": "mg/dL",
        "referenceRange": "(70 - 100)",
        "minRange": 70,
        "maxRange": 100,
        "status": "High",
        "originalLine": "Glucose: 105 mg/dL (70 - 100)"
      }
    ],
    "totalDetected": 2,
    "normalCount": 1,
    "abnormalCount": 1,
    "unparsedLineCount": 1
  }
}
```

**Response 400 — missing/empty text**
```json
{ "success": false, "message": "\"text\" is required and must be a non-empty string." }
```

---

## POST /api/analyze

Sends already-parsed parameters to the Gemini API for a plain-language
explanation. Never sends raw report text — only the structured parameters.

**Request body**
```json
{
  "filename": "report-1720120000000-123456789.pdf",
  "parameters": [
    { "name": "Hemoglobin", "value": 13.2, "unit": "g/dL", "referenceRange": "12-16", "status": "Normal" },
    { "name": "Glucose", "value": 105, "unit": "mg/dL", "referenceRange": "70-100", "status": "High" }
  ]
}
```

| Field | Type | Required |
|---|---|---|
| `filename` | string | No |
| `parameters` | array of objects | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "summary": "Your results are mostly within normal ranges, with one value slightly elevated.",
    "findings": [
      { "title": "Elevated Glucose", "description": "Your glucose level is slightly above the typical reference range." }
    ],
    "riskLevel": "Moderate",
    "healthInsights": [
      "Blood glucose can be affected by recent meals, stress, and activity level."
    ],
    "recommendations": [
      "Consider discussing this result with your doctor at your next visit."
    ],
    "disclaimer": "AI-generated insights are informational only and are not a medical diagnosis."
  }
}
```

**Error responses** (status varies by cause)
```json
{ "success": false, "message": "GEMINI_API_KEY is not set. Add it to your .env file." }        // 500
{ "success": false, "message": "Gemini API request timed out." }                                // 504
{ "success": false, "message": "Gemini API rate limit exceeded. Please try again shortly." }      // 429
{ "success": false, "message": "Network error while contacting the Gemini API." }                 // 502
{ "success": false, "message": "Gemini returned a response we could not understand." }            // 502
```

---

## POST /api/analyze-report

The single endpoint the frontend uses for the full MVP flow:
**Upload → OCR → Parse → Analyze**, in one call. Internally reuses the
exact same logic as the four endpoints above — nothing is duplicated.
The uploaded file is always deleted before the response is sent, whether
the pipeline succeeded or failed.

**Request:** `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `report` | file | Yes |

**Response 200 (success)**
```json
{
  "success": true,
  "message": "Report analyzed successfully",
  "data": {
    "file": {
      "originalName": "bloodwork.pdf",
      "filename": "report-1720120000000-123456789.pdf",
      "mimetype": "application/pdf",
      "size": 245678
    },
    "ocr": {
      "characterCount": 812,
      "text": "Hemoglobin 13.2 g/dL 12-16\n..."
    },
    "parsedReport": {
      "parameters": [ /* same shape as /api/parse-report */ ],
      "totalDetected": 6,
      "normalCount": 4,
      "abnormalCount": 2,
      "unparsedLineCount": 3
    },
    "analysis": {
      "summary": "...",
      "findings": [ { "title": "...", "description": "..." } ],
      "riskLevel": "Moderate",
      "healthInsights": [ "..." ],
      "recommendations": [ "..." ],
      "disclaimer": "AI-generated insights are informational only and are not a medical diagnosis."
    }
  }
}
```

**Error response shape** — every failure includes which step failed:
```json
{ "success": false, "step": "upload",   "message": "Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed." }
{ "success": false, "step": "ocr",      "message": "Failed to extract text from the file." }
{ "success": false, "step": "parser",   "message": "No structured lab parameters were detected in this report, so analysis could not be performed." }
{ "success": false, "step": "analysis", "message": "Gemini API request timed out. Please try again." }
```

`step` is one of: `"upload"`, `"ocr"`, `"parser"`, `"analysis"`.

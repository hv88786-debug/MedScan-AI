# MedScan AI

MedScan AI is an MVP web application that lets a person upload a medical lab
report (PDF or photo) and get a plain-language, AI-generated explanation of
the values in it — a summary, a risk level, key findings, and general
health insights — without ever receiving a diagnosis or prescription.

> ⚠️ **Medical Disclaimer**
> AI-generated insights are for informational purposes only and are **not**
> a medical diagnosis. Always consult a qualified healthcare professional
> for medical advice, diagnosis, or treatment.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Running the Frontend](#running-the-frontend)
- [Running the Backend](#running-the-backend)
- [API Endpoints](#api-endpoints)
- [Tech Stack](#tech-stack)
- [Security Notes](#security-notes)
- [Medical Disclaimer](#medical-disclaimer)
- [Future Roadmap](#future-roadmap)
- [License](#license)

---

## Features

- 📤 **Upload** a lab report as a PDF, JPG, JPEG, or PNG (max 10 MB)
- 🔎 **OCR / text extraction** — `pdf-parse` for PDFs, `tesseract.js` for images
- 🧪 **Conservative lab-value parsing** — only trusts clearly structured
  `name value [unit] [reference range]` lines; ambiguous lines are safely
  skipped rather than guessed at
- 🤖 **AI-generated plain-language analysis** via the Gemini API — summary,
  risk level, key findings, health insights, and recommendations, with a
  mandatory disclaimer and no invented values
- 📊 **Report Overview & Detailed Analysis screens** — parameter tables,
  abnormal-value call-outs, risk badge
- 🧾 **Client-side PDF export** of the full analysis (via jsPDF), generated
  entirely in the browser — no report data is ever sent anywhere just to
  produce the PDF
- 🔐 **No database, no accounts, no persistent storage** — uploaded files
  are deleted from the server immediately after processing
- 📱 Single-file, mobile-first frontend with a full guided screen flow
  (Landing → Upload → Processing → Overview → Detailed Analysis → Report Ready)

## Screenshots

> Screenshots live in [`/screenshots`](./screenshots). Replace these
> placeholders with real captures of your running app.

| Landing | Upload | Processing |
|---|---|---|
| ![Landing](./screenshots/landing.png) | ![Upload](./screenshots/upload.png) | ![Processing](./screenshots/processing.png) |

| Overview | Detailed Analysis | Report Ready |
|---|---|---|
| ![Overview](./screenshots/overview.png) | ![Analysis](./screenshots/analysis.png) | ![Report Ready](./screenshots/report-ready.png) |

## Folder Structure

```text
MedScan-AI/
│
├── frontend/                 # Single-file HTML/CSS/JS client
│   ├── medscan-ai.html
│   ├── assets/
│   │   ├── icons/
│   │   ├── images/
│   │   ├── fonts/
│   │   └── favicon/
│   ├── README.md
│   └── package.json          # optional — only needed for a local static server
│
├── backend/                  # Express API (MVP — no database)
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   ├── README.md
│   ├── uploads/               # temporary storage — always emptied after each request
│   ├── routes/                # reserved for future route modules
│   ├── services/
│   │   ├── ocrService.js
│   │   ├── reportParser.js
│   │   ├── reportParser.devtest.js
│   │   └── geminiService.js
│   └── utils/                 # reserved for future shared helpers
│
├── docs/
│   ├── API.md
│   ├── PROJECT_STRUCTURE.md
│   ├── MVP_FEATURES.md
│   └── UI_FLOW.md
│
├── screenshots/
│
├── LICENSE
├── .gitignore
├── README.md
└── CHANGELOG.md
```

See [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md) for a
file-by-file explanation.

## Installation

```bash
git clone <your-fork-or-repo-url> MedScan-AI
cd MedScan-AI
```

The frontend and backend are independent — install and run each separately
(see below).

## Running the Frontend

The frontend is a single static HTML file with no build step.

```bash
cd frontend
# Open directly in a browser:
open medscan-ai.html      # macOS
# or just double-click medscan-ai.html in your file explorer

# OR serve it locally (recommended, avoids any file:// quirks):
npx serve .
```

By default the frontend calls the backend at `http://localhost:5000/api`
(see `API_BASE` near the top of the `<script>` block in `medscan-ai.html`).
Update that constant if your backend runs elsewhere.

## Running the Backend

```bash
cd backend
npm install
cp .env.example .env
# then edit .env and add your GEMINI_API_KEY

npm start        # normal start
# or
npm run dev      # auto-restart on changes (nodemon)
```

The server starts at `http://localhost:5000`.

## API Endpoints

Full request/response documentation lives in
[`docs/API.md`](./docs/API.md). Summary:

| Method | Endpoint | Purpose |
|---|---|---|
| GET  | `/api/health` | Health check |
| POST | `/api/upload` | Upload a report file |
| POST | `/api/extract-text` | OCR / text extraction on an uploaded file |
| POST | `/api/parse-report` | Parse structured lab parameters from raw text |
| POST | `/api/analyze` | AI-explain parsed parameters via Gemini |
| POST | `/api/analyze-report` | Full pipeline in one call (upload → OCR → parse → analyze) |

## Tech Stack

**Frontend**
- Vanilla HTML / CSS / JavaScript (no framework, no build step)
- [jsPDF](https://github.com/parallax/jsPDF) + [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) for client-side PDF export

**Backend**
- [Node.js](https://nodejs.org/) 18+ (built-in `fetch`)
- [Express](https://expressjs.com/)
- [Multer](https://github.com/expressjs/multer) — file upload handling
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — PDF text extraction
- [tesseract.js](https://github.com/naptha/tesseract.js) — image OCR
- [Google Gemini API](https://ai.google.dev/) — plain-language analysis
- `cors`, `dotenv`

## Security Notes

- Uploaded files are validated by MIME type (PDF, JPG, JPEG, PNG only) and
  capped at 10 MB.
- Filenames used by `/api/extract-text` are sanitized against path traversal
  (`path.basename` + a resolved-path containment check).
- `/api/analyze-report` **always deletes** the uploaded file from disk after
  processing, whether the request succeeded or failed — reports are never
  stored permanently.
- Processing status is kept in memory only and resets on server restart —
  there is no database and nothing persists between runs.
- The Gemini prompt explicitly forbids diagnosis, prescriptions, and invented
  values, and the required disclaimer is enforced server-side rather than
  trusted from the model's output.
- There is currently **no authentication layer** — this is an MVP intended
  for local/demo use. Do not deploy publicly without adding auth, rate
  limiting, and HTTPS.

## Medical Disclaimer

AI-generated insights are for informational purposes only and are not a
medical diagnosis. Always consult a qualified healthcare professional.

## Future Roadmap

- [ ] User accounts and report history
- [ ] Persistent database (encrypted at rest) instead of in-memory status
- [ ] Server-side PDF generation as an alternative export path
- [ ] Multi-language OCR and analysis
- [ ] Support for multi-page / multi-report uploads
- [ ] Configurable reference ranges per lab/region
- [ ] Automated tests (unit + integration) and CI pipeline
- [ ] Rate limiting and authentication for public deployment

## License

Released under the [MIT License](./LICENSE).

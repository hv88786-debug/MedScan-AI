# Project Structure

A file-by-file map of the MedScan AI repository.

```text
MedScan-AI/
│
├── frontend/
│   ├── medscan-ai.html          # Entire client app: HTML + CSS + JS in one file
│   ├── assets/
│   │   ├── icons/                # Reserved for standalone icon assets
│   │   ├── images/               # Reserved for illustrations/marketing images
│   │   ├── fonts/                # Reserved for self-hosted font files
│   │   └── favicon/              # Reserved for favicon variants
│   ├── README.md                 # Frontend-specific docs
│   └── package.json              # Optional — only needed to run a local static server
│
├── backend/
│   ├── server.js                 # Express app: routes, multer config, middleware
│   ├── package.json              # Backend dependencies & scripts
│   ├── package-lock.json         # Exact dependency versions (generate via `npm install`)
│   ├── .env.example               # Template for required environment variables
│   ├── README.md                 # Backend-specific docs
│   ├── uploads/                  # Temporary file storage — always emptied per request
│   ├── routes/                   # Reserved for future route modules (currently inline in server.js)
│   ├── services/
│   │   ├── ocrService.js          # PDF text extraction (pdf-parse) + image OCR (tesseract.js)
│   │   ├── reportParser.js        # Conservative lab-value line parser
│   │   ├── reportParser.devtest.js # Manual dev-only sanity check for reportParser.js
│   │   └── geminiService.js       # Builds prompts, calls Gemini API, validates responses
│   └── utils/                    # Reserved for future shared helper functions
│
├── docs/
│   ├── API.md                    # Full endpoint reference (request/response/example JSON)
│   ├── PROJECT_STRUCTURE.md       # This file
│   ├── MVP_FEATURES.md            # What's in scope for v1.0.0 vs. future work
│   └── UI_FLOW.md                 # Screen-by-screen navigation flow
│
├── screenshots/                   # App screenshots referenced from the root README
│
├── LICENSE                        # MIT License
├── .gitignore                     # Node.js-focused ignore rules
├── README.md                      # Project overview (start here)
└── CHANGELOG.md                   # Version history
```

## Notes on empty folders

`frontend/assets/*` and `backend/{routes,utils}` are intentionally empty
(each contains a `.gitkeep` placeholder) — they exist to give the project a
conventional, production-ready shape to grow into without requiring a
restructure later. No functionality currently depends on them.

`backend/uploads/` is also kept with only a `.gitkeep` file: the backend
creates this folder automatically on startup if it's missing, and every
file written into it is deleted again as soon as processing finishes (see
`/api/analyze-report` in `docs/API.md`).

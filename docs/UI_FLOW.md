# UI Flow

MedScan AI's frontend is a single-file app with a small in-memory screen
router (`showScreen()` / `goBack()`). This document describes the flow
between screens and what triggers each transition.

## Screen Map

```
┌───────────┐   Continue    ┌───────────┐  Continue (valid file)   ┌─────────────┐
│  Landing  │ ────────────► │  Upload   │ ───────────────────────► │ Processing  │
└───────────┘               └───────────┘                          └─────────────┘
                                  ▲                                        │
                                  │ Back                                   │ POST /api/analyze-report
                                  │                                        │ resolves (success)
                                  │                                        ▼
                             ┌────┴──────┐   View Detailed Analysis  ┌─────────────────┐
                             │  (toast + │ ◄───────────────────────  │ Report Overview │
                             │  return on│                            └─────────────────┘
                             │  failure) │                             │  │  Download
                             └───────────┘                             │  ▼
                                                                        │ Detailed Analysis
                                                                        │  │  Back to Overview / Download
                                                                        ▼  ▼
                                                                  Report Overview
                                                                        │
                                                                        │ Download (from Overview or Detail)
                                                                        ▼
                                                                  Report Ready
                                                                        │
                                                        ┌───────────────┼──────────────────┐
                                                        │               │                  │
                                                 Download PDF   View Detailed       Analyze Another
                                                  (again)         Analysis            Report
                                                                                          │
                                                                                          ▼
                                                                                   back to Upload
                                                                                (full state reset)
```

## Screen-by-Screen

### 1. Landing
Marketing/intro screen. **Continue** → Upload.

### 2. Upload
- File picker (tap, drag-and-drop, or camera capture)
- Client-side validation: file type + 10 MB size limit
- **Continue** is disabled until a valid file is selected
- On **Continue**:
  1. Disables Continue + Remove buttons
  2. Fires `POST /api/analyze-report` in the background
  3. Immediately shows the Processing screen and starts the step animation

### 3. Processing
- Animated steps: Uploading → OCR → Parsing → AI Analysis → Preparing Results
- The animation and the real network request run concurrently; the app
  only advances once **both** are done
- **On success:** stores `ocr`, `parsedReport`, and `analysis` into
  `appState`, populates the Overview screen's data, and auto-advances
- **On failure:** shows a friendly toast describing exactly what went
  wrong (e.g. "No structured lab parameters were detected...") and returns
  to Upload
- A **"View Results"** button appears once processing completes, letting
  the person skip the short auto-advance delay

### 4. Report Overview
- Summary, total/normal/abnormal parameter counts, risk level, key findings
- **View Detailed Analysis** → Detailed Analysis
- **Download Analysis PDF** → generates a PDF client-side, then shows
  Report Ready
- **Back** → Landing

### 5. Detailed Analysis
- Full parameter table, abnormal-value cards, health insights,
  recommendations, safety note
- **Back to Overview** / **Back** → Report Overview
- **Download Analysis PDF** → generates a PDF client-side (stays on this screen)

### 6. Report Ready
- Confirms the analysis is complete
- **Download Analysis PDF** (again, if needed)
- **View Detailed Analysis** → Detailed Analysis
- **Analyze Another Report** → fully resets `appState`, clears every
  screen back to its empty state, and returns to Upload

## State & Data Flow

```
appState = {
  file: null,          // File object selected on Upload
  ocr: null,            // { characterCount, text } from the API response
  parsedReport: null,   // { parameters[], totalDetected, normalCount, abnormalCount, unparsedLineCount }
  analysis: null         // { summary, findings[], riskLevel, healthInsights[], recommendations[], disclaimer }
}
```

- Populated once, after a successful `/api/analyze-report` call
- `buildDashboardData()` reshapes it for the Overview screen
- `buildAnalysisData()` reshapes it for the Detailed Analysis screen
- `downloadPDF()` reads directly from `appState` to build the PDF —
  nothing is fetched again just to export
- Fully cleared by `resetApplication()` when **Analyze Another Report**
  is pressed

# MedScan AI — Frontend

A single-file, mobile-first client for the MedScan AI MVP. No build step,
no framework — plain HTML, CSS, and JavaScript in `medscan-ai.html`.

## Running the App

```bash
cd frontend

# Option 1: open it directly
open medscan-ai.html        # macOS
# or double-click it in your file explorer

# Option 2: serve it locally (recommended)
npx serve .
```

The frontend expects the backend to be running at
`http://localhost:5000/api` by default. That base URL is a single constant
near the top of the `<script>` block:

```js
const API_BASE = "http://localhost:5000/api";
```

Change it if your backend runs on a different host or port.

## UI Architecture

Everything lives in one file, organized into clearly commented sections:

- **Design tokens & shared styles** — CSS custom properties (`:root`),
  shared header/card/button components reused across every screen
- **Screen markup** — one `<section class="screen" id="screen-...">` per
  screen; a tiny router (`showScreen()` / `goBack()`) toggles the `.active`
  class instead of navigating between pages
- **Application state** — a single `appState` object:
  ```js
  appState = {
    file: null,          // the selected File object
    ocr: null,            // raw extracted text
    parsedReport: null,   // structured lab parameters
    analysis: null         // AI-generated analysis
  }
  ```
- **API functions** — `uploadReport()` calls `POST /api/analyze-report`;
  `buildDashboardData()` / `buildAnalysisData()` reshape the response for
  each screen; `downloadPDF()` builds a PDF entirely client-side with
  jsPDF + jspdf-autotable (no server round-trip)
- **Screen renderers** — `updateDashboard()`, `updateAnalysis()`, and small
  card-builder helpers that only replace an empty state when real data
  exists (nothing is ever hardcoded or fabricated)
- **Screen wiring** — event listeners for each screen's buttons, grouped
  and commented by screen

## Screen Flow

```
Landing
  │  Continue
  ▼
Upload  ──────────────► (validates file type/size, enables Continue)
  │  Continue → POST /api/analyze-report
  ▼
Processing  ──(animated steps, joined with the real network request)──►
  │  auto-advance on success, or back to Upload with a toast on failure
  ▼
Report Overview  ──View Detailed Analysis──► Detailed Analysis
  │  Download                                     │  Download / Back
  ▼                                                ▼
Report Ready  ◄─────────────────────────────────────
  │  Analyze Another Report
  ▼
(reset to Upload)
```

Back navigation uses a simple history stack (`screenHistory`) so the
hardware/browser back gesture-equivalent buttons return to the correct
previous screen.

## Browser Support

- Modern evergreen browsers (Chrome, Edge, Firefox, Safari — last 2 versions)
- Requires `fetch`, `FormData`, ES2017+ (`async`/`await`), and CSS custom
  properties — no polyfills are included
- Layout is mobile-first (max width ~430px, centered) but works fine at
  desktop widths
- `prefers-reduced-motion` is respected — animations are disabled when the
  OS setting is on
- jsPDF/autoTable are loaded from a public CDN, so a working internet
  connection is required to use the "Download Analysis PDF" feature

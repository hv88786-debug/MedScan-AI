// ==========================================================
// MedScan AI - Simple Express Backend (MVP)
// ==========================================================
// This server handles file uploads (PDF/JPG/JPEG/PNG) for
// medical reports. No database, no auth, no OCR - just a
// clean upload API to get the MVP running.
// ==========================================================

// ---------- 1. Load environment variables ----------
require('dotenv').config();

// ---------- 2. Import dependencies ----------
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ocrService = require('./services/ocrService'); // OCR text extraction logic
const reportParser = require('./services/reportParser'); // Lab report parameter parser
const geminiService = require('./services/geminiService'); // Gemini AI analysis

// ---------- 3. Basic setup ----------
const app = express();
const PORT = process.env.PORT || 5000;

// Safety net: tesseract.js runs OCR in a worker thread. If that worker
// hits an error outside a normal request (e.g. it can't download its
// language data because of no internet access), Node can crash the
// whole server with an uncaught exception. We log it instead of dying,
// so one failed OCR job doesn't take down the entire API.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server kept alive):', err.message);
});

// Folder where uploaded files will be stored.
// On Vercel, the filesystem is read-only except for /tmp — so when running
// there (process.env.VERCEL is set automatically by Vercel), we write to
// /tmp/uploads instead of a local "uploads" folder next to this file.
const UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, 'uploads');

// Create the "uploads" folder automatically if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('Created uploads folder:', UPLOAD_DIR);
}

// ---------- 4. Middleware ----------
app.use(cors());            // Allow requests from frontend (different origin)
app.use(express.json());    // Parse incoming JSON request bodies

// Serve the "uploads" folder as static files
// Example: http://localhost:5000/uploads/report-12345.pdf
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- 5. Multer configuration (file upload handling) ----------

// Storage engine: where and how to save uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Unique filename: fieldname-timestamp-random.ext
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `report-${uniqueSuffix}${ext}`);
  },
});

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', // covers both .jpg and .jpeg
  'image/png',
];

// File filter: only accept PDF, JPG, JPEG, PNG
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true); // accept file
  } else {
    // Reject file with a custom error we can catch later
    cb(new Error('INVALID_FILE_TYPE'), false);
  }
};

// Max file size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB in bytes

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ---------- 6. Routes ----------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MedScan AI API is running',
  });
});

// Upload endpoint
// Field name in form-data must be "report"
app.post('/api/upload', (req, res) => {
  upload.single('report')(req, res, (err) => {
    // ---- Handle Multer-specific errors (e.g. file too large) ----
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File is too large. Maximum allowed size is 10 MB.',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }

    // ---- Handle invalid file type error (thrown from fileFilter) ----
    if (err && err.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.',
      });
    }

    // ---- Handle any other unexpected error ----
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Something went wrong during file upload.',
      });
    }

    // ---- No file was provided ----
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please attach a file using the "report" field.',
      });
    }

    // ---- Success response ----
    res.status(200).json({
      success: true,
      message: 'Report uploaded successfully',
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      },
    });
  });
});

// ---------- 7. OCR Text Extraction ----------
// Mimetypes we know how to extract text from
const OCR_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

// POST /api/extract-text
// Body: { "filename": "report-123.pdf", "mimetype": "application/pdf" }
app.post('/api/extract-text', async (req, res) => {
  const { filename, mimetype } = req.body;

  // ---- 1. Validate required fields ----
  if (!filename || !mimetype) {
    return res.status(400).json({
      success: false,
      message: 'Both "filename" and "mimetype" are required.',
    });
  }

  // ---- 2. Prevent path traversal ----
  // path.basename() strips any folder parts. If the cleaned name doesn't
  // match the original, the user tried to sneak in "../" or a full path.
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || filename.includes('..')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid filename.',
    });
  }

  // Resolve the full path and double-check it stays inside UPLOAD_DIR
  const filePath = path.join(UPLOAD_DIR, safeFilename);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(UPLOAD_DIR))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid filename.',
    });
  }

  // ---- 3. Check the file actually exists in uploads/ ----
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({
      success: false,
      message: 'File not found in uploads folder.',
    });
  }

  // ---- 4. Check the mimetype is one we support for extraction ----
  if (!OCR_SUPPORTED_MIME_TYPES.includes(mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'Unsupported file type. Only PDF, JPG, JPEG, and PNG can be processed.',
    });
  }

  // ---- 5. Run extraction (PDF -> pdf-parse, image -> tesseract.js) ----
  try {
    const text = await ocrService.extractText(safeFilename, mimetype, resolvedPath);
    const trimmedText = text.trim();

    // No readable text found — say so honestly, don't invent anything
    if (trimmedText.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No readable text was found in this file.',
        data: {
          filename: safeFilename,
          mimetype,
          text: '',
          characterCount: 0,
        },
      });
    }

    // ---- Success ----
    return res.status(200).json({
      success: true,
      message: 'Text extracted successfully',
      data: {
        filename: safeFilename,
        mimetype,
        text: trimmedText,
        characterCount: trimmedText.length,
      },
    });
  } catch (err) {
    console.error('OCR extraction error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to extract text from the file.',
    });
  }
});

// GET /api/processing-status/:filename
// Returns the current in-memory status: idle | extracting | completed | failed
app.get('/api/processing-status/:filename', (req, res) => {
  // Sanitize the same way as above, just to be safe with the lookup key
  const safeFilename = path.basename(req.params.filename);

  const status = ocrService.getStatus(safeFilename);

  res.status(200).json({
    success: true,
    filename: safeFilename,
    status, // "idle" | "extracting" | "completed" | "failed"
  });
});

// ---------- 8. Medical Report Parameter Parser ----------
// Takes plain report text (e.g. the output of /api/extract-text) and
// pulls out clearly structured lab values. This is intentionally
// conservative — see services/reportParser.js for exactly what it will
// and won't attempt to parse, and why.

// POST /api/parse-report
// Body: { "text": "Hemoglobin 13.2 g/dL 12-16\n...", "filename": "report-123.pdf" }
app.post('/api/parse-report', (req, res) => {
  const { text, filename } = req.body;

  // ---- 1. Validate input ----
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: '"text" is required and must be a non-empty string.',
    });
  }

  // ---- 2. Parse (wrapped in try/catch — a parser bug should never crash the API) ----
  try {
    const result = reportParser.parseReportText(text);

    return res.status(200).json({
      success: true,
      message: 'Report parsed successfully',
      data: {
        filename: filename || null,
        parameters: result.parameters,
        totalDetected: result.totalDetected,
        normalCount: result.normalCount,
        abnormalCount: result.abnormalCount,
        unparsedLineCount: result.unparsedLineCount,
      },
    });
  } catch (err) {
    console.error('Report parsing error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to parse report text.',
    });
  }
});

// ---------- 9. Gemini AI Analysis ----------
// Takes the structured parameters from /api/parse-report and asks
// Gemini to explain them in plain language. See services/geminiService.js
// for the prompt rules (no diagnosis, no prescriptions, no invented values)
// and for exactly how errors are classified.

// POST /api/analyze
// Body: { "filename": "report-123.pdf" (optional), "parameters": [ ... ] }
app.post('/api/analyze', async (req, res) => {
  const { filename, parameters } = req.body;

  // ---- 1. Validate input ----
  if (!Array.isArray(parameters) || parameters.length === 0) {
    return res.status(400).json({
      success: false,
      message: '"parameters" is required and must be a non-empty array.',
    });
  }

  // ---- 2. Call Gemini, mapping each typed error to a clear HTTP response ----
  try {
    const analysis = await geminiService.analyzeParameters(parameters, filename);

    return res.status(200).json({
      success: true,
      message: 'Analysis completed successfully',
      data: analysis,
    });
  } catch (err) {
    console.error('Gemini analysis error:', err.code || 'UNKNOWN', '-', err.message);

    switch (err.code) {
      case 'MISSING_API_KEY':
        return res.status(500).json({
          success: false,
          message: 'Gemini API key is not configured on the server. Set GEMINI_API_KEY in .env.',
        });

      case 'TIMEOUT':
        return res.status(504).json({
          success: false,
          message: 'Gemini API request timed out. Please try again.',
        });

      case 'RATE_LIMIT':
        return res.status(429).json({
          success: false,
          message: 'Gemini API rate limit exceeded. Please try again shortly.',
        });

      case 'NETWORK_ERROR':
        return res.status(502).json({
          success: false,
          message: 'Network error while contacting the Gemini API.',
        });

      case 'INVALID_RESPONSE':
        return res.status(502).json({
          success: false,
          message: 'Gemini returned a response we could not understand. Please try again.',
        });

      case 'API_ERROR':
        return res.status(502).json({
          success: false,
          message: err.message,
        });

      default:
        return res.status(500).json({
          success: false,
          message: 'Unexpected error during analysis.',
        });
    }
  }
});

// ---------- 10. Full Pipeline: Upload → OCR → Parse → Analyze ----------
// POST /api/analyze-report
//
// This is the single endpoint the frontend needs for the MVP flow:
// Upload Report → Analyze Report → Receive Complete JSON → Display Dashboard.
//
// IMPORTANT: this route does not reimplement any logic. It calls the
// exact same multer `upload` config and the exact same three service
// functions that power /api/upload, /api/extract-text, /api/parse-report,
// and /api/analyze above. Those four endpoints are untouched and keep
// working exactly as before — this route just chains their logic
// together for a one-shot pipeline call.
//
// Rules this route follows throughout:
//   - Each step runs only if the previous one succeeded (async/await,
//     top-to-bottom, no parallel steps).
//   - The very first failure stops the pipeline immediately — we never
//     "carry on" with partial or guessed data.
//   - Every error response says exactly which step failed: "upload",
//     "ocr", "parser", or "analysis".
//   - The uploaded file is deleted before we respond, on every path —
//     success or failure. Reports are never stored permanently.

// Small helper just for this route: turns a geminiService error (which
// carries a `.code`) into an HTTP status + message. This mirrors the
// switch-case already used in /api/analyze above, but lives in its own
// function so this route doesn't have to duplicate that block inline.
function mapGeminiErrorToResponse(err) {
  switch (err.code) {
    case 'MISSING_API_KEY':
      return { status: 500, message: 'Gemini API key is not configured on the server. Set GEMINI_API_KEY in .env.' };
    case 'TIMEOUT':
      return { status: 504, message: 'Gemini API request timed out. Please try again.' };
    case 'RATE_LIMIT':
      return { status: 429, message: 'Gemini API rate limit exceeded. Please try again shortly.' };
    case 'NETWORK_ERROR':
      return { status: 502, message: 'Network error while contacting the Gemini API.' };
    case 'INVALID_RESPONSE':
      return { status: 502, message: 'Gemini returned a response we could not understand. Please try again.' };
    case 'API_ERROR':
      return { status: 502, message: err.message };
    default:
      return { status: 500, message: 'Unexpected error during analysis.' };
  }
}

// Field name in form-data must be "report" (same as /api/upload)
app.post('/api/analyze-report', (req, res) => {
  // Reuses the SAME `upload` multer instance defined in section 5 above —
  // same storage location, same filename pattern, same file-type and
  // 10 MB size limits as /api/upload.
  upload.single('report')(req, res, async (uploadErr) => {
    // =====================================================
    // STEP 1 — UPLOAD
    // =====================================================
    if (uploadErr instanceof multer.MulterError) {
      const message =
        uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum allowed size is 10 MB.'
          : `Upload error: ${uploadErr.message}`;
      return res.status(400).json({ success: false, step: 'upload', message });
    }
    if (uploadErr && uploadErr.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({
        success: false,
        step: 'upload',
        message: 'Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.',
      });
    }
    if (uploadErr) {
      return res.status(500).json({
        success: false,
        step: 'upload',
        message: 'Something went wrong during file upload.',
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        step: 'upload',
        message: 'No file uploaded. Please attach a file using the "report" field.',
      });
    }

    // The file is now saved on disk. From here on, every exit path
    // (success or failure) must delete it — nothing is stored permanently.
    const { filename, mimetype, originalname, size, path: filePath } = req.file;
    const fileInfo = { originalName: originalname, filename, mimetype, size };

    const cleanupFile = () => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (cleanupErr) {
        // Log it, but never let a cleanup failure crash the response.
        console.error('Failed to delete temporary upload:', cleanupErr.message);
      }
    };

    // =====================================================
    // STEP 2 — OCR (services/ocrService.js, same function
    // used by POST /api/extract-text)
    // =====================================================
    let extractedText;
    try {
      extractedText = await ocrService.extractText(filename, mimetype, filePath);
    } catch (ocrErr) {
      console.error('Pipeline OCR error:', ocrErr.message);
      cleanupFile();
      return res.status(500).json({
        success: false,
        step: 'ocr',
        message: 'Failed to extract text from the file.',
      });
    }
    const trimmedText = extractedText.trim();

    // =====================================================
    // STEP 3 — PARSE (services/reportParser.js, same function
    // used by POST /api/parse-report)
    // =====================================================
    let parseResult;
    try {
      // Handles an empty string safely (just reports 0 parameters found) —
      // we never invent parameters if OCR found no readable text.
      parseResult = reportParser.parseReportText(trimmedText);
    } catch (parseErr) {
      console.error('Pipeline parse error:', parseErr.message);
      cleanupFile();
      return res.status(500).json({
        success: false,
        step: 'parser',
        message: 'Failed to parse report text.',
      });
    }

    // Nothing structured to analyze — stop rather than asking Gemini
    // to "explain" an empty parameter list.
    if (parseResult.parameters.length === 0) {
      cleanupFile();
      return res.status(422).json({
        success: false,
        step: 'parser',
        message:
          'No structured lab parameters were detected in this report, so analysis could not be performed.',
      });
    }

    // =====================================================
    // STEP 4 — ANALYZE (services/geminiService.js, same
    // function used by POST /api/analyze)
    // =====================================================
    let analysis;
    try {
      analysis = await geminiService.analyzeParameters(parseResult.parameters, filename);
    } catch (analysisErr) {
      console.error(
        'Pipeline analysis error:',
        analysisErr.code || 'UNKNOWN',
        '-',
        analysisErr.message
      );
      cleanupFile();
      const { status, message } = mapGeminiErrorToResponse(analysisErr);
      return res.status(status).json({ success: false, step: 'analysis', message });
    }

    // =====================================================
    // STEP 5 — SUCCESS: assemble the final response, then
    // delete the uploaded file before sending it.
    // =====================================================
    const responseData = {
      file: fileInfo,
      ocr: {
        characterCount: trimmedText.length,
        text: trimmedText,
      },
      parsedReport: {
        parameters: parseResult.parameters,
        totalDetected: parseResult.totalDetected,
        normalCount: parseResult.normalCount,
        abnormalCount: parseResult.abnormalCount,
        unparsedLineCount: parseResult.unparsedLineCount,
      },
      analysis,
    };

    cleanupFile();

    return res.status(200).json({
      success: true,
      message: 'Report analyzed successfully',
      data: responseData,
    });
  });
});

// ---------- 11. Start server ----------
// On Vercel, the platform itself wraps this exported Express app in a
// serverless function — it must NOT call app.listen(). Locally (and on
// Render/Railway/etc.), we still want the normal long-running server.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MedScan AI backend running at http://localhost:${PORT}`);
  });
}

module.exports = app;

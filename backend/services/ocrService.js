// ==========================================================
// OCR Service — MedScan AI
// ==========================================================
// This file handles all text-extraction logic:
//   - PDF files  -> pdf-parse
//   - JPG/JPEG/PNG files -> tesseract.js (OCR)
//
// It also keeps a simple in-memory "processing status" map so
// the frontend can poll and see if extraction is still running.
// (In-memory only — resets if the server restarts. No database.)
// ==========================================================

const fs = require('fs');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

// ---------- In-memory processing status store ----------
// Shape: { "report-123.pdf": "idle" | "extracting" | "completed" | "failed" }
const processingStatus = {};

/**
 * Get the current processing status for a file.
 * Defaults to "idle" if we have no record of it yet.
 */
function getStatus(filename) {
  return processingStatus[filename] || 'idle';
}

/**
 * Update the processing status for a file.
 */
function setStatus(filename, status) {
  processingStatus[filename] = status;
}

/**
 * Extract text from a PDF file using pdf-parse.
 */
async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await pdfParse(dataBuffer);
  return result.text || '';
}

/**
 * Extract text from an image file (JPG/JPEG/PNG) using tesseract.js OCR.
 */
async function extractTextFromImage(filePath) {
  const { data } = await Tesseract.recognize(filePath, 'eng');
  return data.text || '';
}

/**
 * Main entry point: extracts text from a file based on its mimetype.
 * Updates the in-memory processing status as it goes.
 *
 * @param {string} filename - the stored filename (used as status key)
 * @param {string} mimetype - the file's mimetype
 * @param {string} filePath - absolute path to the file on disk
 * @returns {Promise<string>} extracted text (may be empty string)
 */
async function extractText(filename, mimetype, filePath) {
  setStatus(filename, 'extracting');

  try {
    let text = '';

    if (mimetype === 'application/pdf') {
      text = await extractTextFromPDF(filePath);
    } else if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
      text = await extractTextFromImage(filePath);
    } else {
      // Should not normally happen since the route validates this first,
      // but we guard here too for safety.
      throw new Error('UNSUPPORTED_FILE_TYPE');
    }

    setStatus(filename, 'completed');
    return text;
  } catch (err) {
    setStatus(filename, 'failed');
    throw err;
  }
}

module.exports = {
  extractText,
  getStatus,
};

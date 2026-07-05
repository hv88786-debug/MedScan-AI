// ==========================================================
// Gemini AI Service — MedScan AI
// ==========================================================
// Sends parsed lab parameters to Google's Gemini API and asks
// it to explain them in plain language — NOT to diagnose,
// NOT to prescribe, and NOT to invent any values.
//
// This file only talks to Gemini and returns clean, validated
// JSON. It knows nothing about Express — that keeps it easy to
// reuse (e.g. from a CLI script or a different route) and easy
// to test on its own.
//
// We call the Gemini REST API directly with the built-in
// `fetch` (Node 18+) instead of pulling in the official SDK.
// For a single JSON-in/JSON-out call like this, a plain fetch
// keeps the dependency list small and every step visible.
// ==========================================================

// ---------- Configuration ----------

// Which Gemini model to use. Flash models are fast and cheap,
// which fits a "quick explanation" use case like this one.
const GEMINI_MODEL = 'gemini-2.5-flash';

// Gemini's generateContent REST endpoint for the model above.
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// How long we'll wait for Gemini before giving up and reporting a timeout.
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

// The exact disclaimer text required in every response. We set this
// ourselves after getting Gemini's reply, rather than trusting the
// model to always include it word-for-word.
const REQUIRED_DISCLAIMER =
  'AI-generated insights are informational only and are not a medical diagnosis.';

// The only risk levels we consider valid. Anything else gets
// normalized to "Unknown" rather than trusted as-is.
const VALID_RISK_LEVELS = ['Low', 'Moderate', 'High', 'Unknown'];

// ---------- Small helper: typed errors ----------
// We attach a `.code` to every error we throw so the route handler
// (server.js) can map each failure to the right HTTP status and a
// clear message, without needing to guess from error text.
function createError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ---------- 1. Build the prompt ----------
// The system instruction sets Gemini's role and hard rules.
// The user prompt hands over ONLY the parsed parameters (never
// the raw report text) and asks for a strict JSON reply.
function buildSystemInstruction() {
  return [
    'You are a medical report explanation assistant.',
    'Your job is to explain lab report values in plain, friendly language.',
    '',
    'Hard rules you must always follow:',
    '- Never provide a diagnosis of any disease or condition.',
    '- Never prescribe or suggest specific medicines, dosages, or treatments.',
    '- Never invent, guess, or assume any parameter, value, or reference range',
    '  that was not explicitly given to you.',
    '- Only explain the exact lab values provided in the user message.',
    '- If the provided information is insufficient to say something useful,',
    '  say so plainly instead of guessing.',
    '- Always remind the user to consult a qualified doctor for medical advice.',
    '',
    'You must reply with ONLY valid JSON — no markdown, no code fences, no',
    'commentary before or after — matching exactly this structure:',
    '{',
    '  "summary": "",',
    '  "findings": [ { "title": "", "description": "" } ],',
    '  "riskLevel": "Low | Moderate | High | Unknown",',
    '  "healthInsights": [""],',
    '  "recommendations": [""],',
    '  "disclaimer": "AI-generated insights are informational only and are not a medical diagnosis."',
    '}',
  ].join('\n');
}

function buildUserPrompt(parameters, filename) {
  // We send the already-parsed parameters as JSON, not the raw report
  // text. This keeps Gemini's job to "explain these exact numbers" —
  // it never sees ambiguous text it could misread as a new value.
  const context = {
    filename: filename || null,
    parameters,
  };

  return [
    'Here are the lab report parameters to explain (as JSON):',
    JSON.stringify(context, null, 2),
    '',
    'Explain these values following all the rules above. Respond with ONLY the JSON object described.',
  ].join('\n');
}

// ---------- 2. Clean up Gemini's raw text and parse JSON ----------
// Even when asked for JSON-only, models sometimes wrap the reply in
// ```json ... ``` fences or add a stray sentence. We strip fences,
// then isolate the outermost { ... } block before parsing — this way
// small formatting slip-ups don't cause a needless failure, but we
// still never "invent" data if the JSON itself is broken.
function extractJson(rawText) {
  let cleaned = rawText.trim();

  // Remove markdown code fences if present (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw createError('INVALID_RESPONSE', 'Gemini response did not contain a JSON object.');
  }

  const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonSlice);
  } catch (err) {
    throw createError('INVALID_RESPONSE', 'Gemini response was not valid JSON.');
  }
}

// ---------- 3. Validate the parsed JSON has the shape we expect ----------
// We don't trust the model to always follow the schema perfectly, so we
// check the important fields and normalize anything questionable
// (e.g. an unexpected riskLevel value) instead of passing bad data on.
function validateAndNormalize(parsed) {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.summary !== 'string' ||
    !Array.isArray(parsed.findings) ||
    !Array.isArray(parsed.healthInsights) ||
    !Array.isArray(parsed.recommendations)
  ) {
    throw createError('INVALID_RESPONSE', 'Gemini response did not match the expected structure.');
  }

  const riskLevel = VALID_RISK_LEVELS.includes(parsed.riskLevel) ? parsed.riskLevel : 'Unknown';

  return {
    summary: parsed.summary,
    findings: parsed.findings,
    riskLevel,
    healthInsights: parsed.healthInsights,
    recommendations: parsed.recommendations,
    // Always enforce the exact required disclaimer text ourselves,
    // rather than trusting the model to reproduce it verbatim.
    disclaimer: REQUIRED_DISCLAIMER,
  };
}

// ---------- 4. Call the Gemini API ----------
async function callGemini(apiKey, systemInstruction, userPrompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2, // keep answers focused and consistent, not creative
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw createError('TIMEOUT', 'Gemini API request timed out.');
    }
    // Any other fetch failure (DNS issue, connection refused, offline, etc.)
    throw createError('NETWORK_ERROR', 'Network error while contacting the Gemini API.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw createError('RATE_LIMIT', 'Gemini API rate limit exceeded. Please try again shortly.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message || '';
    } catch {
      // ignore — response body wasn't JSON, we'll use a generic message
    }
    throw createError(
      'API_ERROR',
      `Gemini API returned an error (status ${response.status})${detail ? ': ' + detail : '.'}`
    );
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw createError('INVALID_RESPONSE', 'Gemini API response was not valid JSON.');
  }

  // If the prompt was blocked by safety filters, there will be no candidates.
  const blockReason = body?.promptFeedback?.blockReason;
  if (blockReason) {
    throw createError('INVALID_RESPONSE', `Gemini blocked the request (${blockReason}).`);
  }

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw createError('INVALID_RESPONSE', 'Gemini API response did not contain any text.');
  }

  return text;
}

// ---------- 5. Public entry point ----------
/**
 * Analyze parsed lab parameters using Gemini and return clean, validated
 * JSON matching the required response structure.
 *
 * @param {object[]} parameters - parsed parameters (from reportParser.js)
 * @param {string|null} filename - optional, just for context in the prompt
 * @returns {Promise<object>} the validated analysis object
 * @throws {Error} with a `.code` of MISSING_API_KEY | TIMEOUT | RATE_LIMIT |
 *                 NETWORK_ERROR | API_ERROR | INVALID_RESPONSE
 */
async function analyzeParameters(parameters, filename) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw createError(
      'MISSING_API_KEY',
      'GEMINI_API_KEY is not set. Add it to your .env file.'
    );
  }

  const systemInstruction = buildSystemInstruction();
  const userPrompt = buildUserPrompt(parameters, filename);

  const rawText = await callGemini(apiKey, systemInstruction, userPrompt);
  const parsedJson = extractJson(rawText);
  return validateAndNormalize(parsedJson);
}

module.exports = {
  analyzeParameters,
};

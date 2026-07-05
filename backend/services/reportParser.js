// ==========================================================
// Report Parser Service — MedScan AI
// ==========================================================
// Turns raw lab-report text (usually the output of the OCR /
// PDF text-extraction step) into a structured list of
// parameters: { name, value, unit, referenceRange, status }.
//
// This module is intentionally CONSERVATIVE:
//   - It only understands ONE parameter per line.
//   - It requires a clear "name + number" shape before it will
//     even attempt to read a unit or reference range.
//   - Any line that doesn't cleanly fit the expected shape is
//     skipped rather than guessed at. We would rather return
//     fewer, trustworthy parameters than invent incorrect ones.
//
// This keeps the module safe to plug into a future AI-analysis
// step later — that step can trust everything in `parameters`
// actually came from a real, structured line in the report.
// ==========================================================

// ----------------------------------------------------------
// THE PARSING RULE (in plain English)
// ----------------------------------------------------------
// A line is understood as:
//
//   <name>  <value>  [unit]  [reference range]
//
// Examples this DOES understand:
//   "Hemoglobin 13.2 g/dL 12-16"
//   "Glucose: 105 mg/dL (70 - 100)"
//   "WBC 7.4 x10^3/uL 4.0-11.0"
//   "Cholesterol 180 mg/dL < 200"
//   "HDL 45 mg/dL > 40"
//
// Examples this SKIPS on purpose (too ambiguous to trust):
//   "BP 120/80 mmHg"              -> two numbers in one value, no safe way to split
//   "Date: 04-07-2026"            -> looks numeric but isn't a lab value
//   "Patient advised to fast."    -> no numeric value at all
//   "Please repeat test in 3 mo." -> number present but no name+unit+range shape
// ----------------------------------------------------------

// The main line-matching regex. Named groups make the logic below readable.
//
//   name     - letters/digits/spaces/punctuation, stops right before the value
//   value    - the numeric result (integer or decimal, optional sign)
//   unit     - anything that isn't a space, parenthesis, <, >, or hyphen
//              (hyphen is excluded so it can't accidentally eat a "12-16" range)
//   rangeRaw - the whole trailing reference-range chunk, one of:
//                (a) "<" or ">" followed by a number   e.g. "< 200", "(>40)"
//                (b) "min - max"                        e.g. "12-16", "(70 - 100)"
const LINE_REGEX =
  /^(?<name>[A-Za-z][A-Za-z0-9()/,.\s]*?)\s*:?\s+(?<value>[+-]?\d+(?:\.\d+)?)\s*(?<unit>[^\s()<>-]*)\s*(?<rangeRaw>\(?\s*(?:(?<cmp><|>)\s*(?<cmpval>\d+(?:\.\d+)?)|(?<min>\d+(?:\.\d+)?)\s*-\s*(?<max>\d+(?:\.\d+)?))\s*\)?)?\s*$/;

/**
 * Work out the status ("Normal" | "Low" | "High" | "Unknown") for one
 * parsed parameter, based on whatever reference-range info we found.
 *
 * ----------------------------------------------------------------
 * IMPORTANT — documented assumption for "<" and ">" ranges:
 * ----------------------------------------------------------------
 * A single-sided range like "< 200" or "> 40" doesn't tell us the
 * "safe" direction on its own — we have to assume a convention.
 * We use the common lab-report convention:
 *   "< X"  -> this is an UPPER limit. value <  X  => Normal
 *                                      value >= X  => High
 *   "> X"  -> this is a LOWER limit.  value >  X  => Normal
 *                                      value <= X  => Low
 * This matches everyday examples like "Cholesterol < 200" (high is bad)
 * and "HDL > 40" (low is bad). It will NOT be correct for every possible
 * parameter, which is exactly why this logic lives in one clearly
 * commented place — easy to find, review, or override later.
 */
function computeStatus({ value, min, max, cmp, cmpval }) {
  if (min !== undefined && max !== undefined) {
    if (value < min) return 'Low';
    if (value > max) return 'High';
    return 'Normal';
  }

  if (cmp !== undefined && cmpval !== undefined) {
    if (cmp === '<') return value < cmpval ? 'Normal' : 'High';
    if (cmp === '>') return value > cmpval ? 'Normal' : 'Low';
  }

  // No usable reference range -> we simply don't know. Never guess.
  return 'Unknown';
}

/**
 * Try to parse a single line into a parameter object.
 * Returns null if the line should be skipped (blank, or doesn't match
 * the conservative shape described above).
 */
function parseLine(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed) return null; // blank line — nothing to report, not an error

  const match = trimmed.match(LINE_REGEX);
  if (!match) return { parsed: false };

  const groups = match.groups;
  const name = groups.name.trim().replace(/[:\s]+$/, '');
  const value = parseFloat(groups.value);

  // Defensive guard: regex should already guarantee these, but never
  // trust blindly — a broken name or NaN value means skip, not guess.
  if (!name || Number.isNaN(value)) {
    return { parsed: false };
  }

  const unit = groups.unit ? groups.unit.trim() : '';
  const min = groups.min !== undefined ? parseFloat(groups.min) : undefined;
  const max = groups.max !== undefined ? parseFloat(groups.max) : undefined;
  const cmp = groups.cmp;
  const cmpval = groups.cmpval !== undefined ? parseFloat(groups.cmpval) : undefined;

  const status = computeStatus({ value, min, max, cmp, cmpval });

  // minRange / maxRange: fill in whichever side we actually know.
  // For a plain "min-max" range both are known. For "< X" we only know
  // the upper bound; for "> X" we only know the lower bound.
  let minRange = null;
  let maxRange = null;
  if (min !== undefined && max !== undefined) {
    minRange = min;
    maxRange = max;
  } else if (cmp === '<') {
    maxRange = cmpval;
  } else if (cmp === '>') {
    minRange = cmpval;
  }

  return {
    parsed: true,
    parameter: {
      name,
      value,
      unit: unit || null,
      referenceRange: groups.rangeRaw ? groups.rangeRaw.trim() : null,
      minRange,
      maxRange,
      status,
      originalLine: rawLine,
    },
  };
}

/**
 * Parse a full block of report text (multiple lines) into structured
 * parameters plus some summary counts.
 *
 * @param {string} text - raw report text (from OCR or PDF extraction)
 * @returns {{
 *   parameters: object[],
 *   totalDetected: number,
 *   normalCount: number,
 *   abnormalCount: number,
 *   unparsedLineCount: number
 * }}
 */
function parseReportText(text) {
  const lines = text.split(/\r?\n/);

  const parameters = [];
  let unparsedLineCount = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue; // blank lines are just skipped, not "unparsed"

    const result = parseLine(rawLine);
    if (result && result.parsed) {
      parameters.push(result.parameter);
    } else {
      unparsedLineCount += 1; // had content, but didn't match our safe shape
    }
  }

  const normalCount = parameters.filter((p) => p.status === 'Normal').length;
  const abnormalCount = parameters.filter(
    (p) => p.status === 'Low' || p.status === 'High'
  ).length;

  return {
    parameters,
    totalDetected: parameters.length,
    normalCount,
    abnormalCount,
    unparsedLineCount,
  };
}

module.exports = {
  parseReportText,
  parseLine, // exported mainly for the dev-only test file / unit testing
};

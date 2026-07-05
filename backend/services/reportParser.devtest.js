// ==========================================================
// DEV-ONLY manual test script for reportParser.js
// ==========================================================
// This is NOT wired into the server or any test framework.
// It's a quick, human-readable sanity check you can run with:
//
//   node services/reportParser.devtest.js
//
// Feel free to add more sample lines below as you find real
// report formats that should (or shouldn't) be parsed.
// ==========================================================

const { parseReportText } = require('./reportParser');

const sampleReportText = `
Hemoglobin 13.2 g/dL 12-16
Glucose: 105 mg/dL (70 - 100)
WBC 7.4 x10^3/uL 4.0-11.0
Cholesterol 180 mg/dL < 200
HDL 45 mg/dL > 40
LDL 210 mg/dL < 130
Platelet Count 150 x10^3/uL 150-450
Vitamin B12 550 pg/mL 200-900
BP 120/80 mmHg
Date: 04-07-2026
Patient advised to fast before the next test.
Some random note with a number 42 but no clear units or range
`;

const result = parseReportText(sampleReportText);

console.log('----- PARSED PARAMETERS -----');
console.table(
  result.parameters.map((p) => ({
    name: p.name,
    value: p.value,
    unit: p.unit,
    referenceRange: p.referenceRange,
    minRange: p.minRange,
    maxRange: p.maxRange,
    status: p.status,
  }))
);

console.log('\n----- SUMMARY -----');
console.log('Total detected:   ', result.totalDetected);
console.log('Normal count:     ', result.normalCount);
console.log('Abnormal count:   ', result.abnormalCount);
console.log('Unparsed lines:   ', result.unparsedLineCount);

// ----------------------------------------------------------
// Expected behavior for reference (read, don't assert-blindly):
// - Hemoglobin, Glucose, WBC, Platelet Count, Vitamin B12 -> parsed with min/max range
// - Cholesterol, HDL, LDL -> parsed using the documented "<"/">" convention
// - "BP 120/80 mmHg"        -> SKIPPED (two numbers in one value, unsafe to split)
// - "Date: 04-07-2026"      -> SKIPPED (not a lab value, looks numeric but isn't)
// - "Patient advised..."    -> SKIPPED (no numeric value)
// - "Some random note..."   -> SKIPPED (number present, but no name+unit+range shape)
// ----------------------------------------------------------

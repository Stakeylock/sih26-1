#!/usr/bin/env node
/**
 * Generates the watermarked synthetic sample PDFs served from public/samples/.
 *
 * Hand-rolled PDF 1.4 bytes: standard-14 Helvetica (a system font), uncompressed
 * content streams so the bytes are deterministic and the text stays inspectable.
 * No dependencies, no network, no external assets. Same inputs produce identical
 * bytes on every run (no timestamps, no mtimes, sorted manifest).
 *
 * Usage:
 *   node scripts/generate-sample-pdfs.mjs [--out <dir>] [--manifest <file>]
 *
 * Every page carries the heading "SYNTHETIC SAMPLE — NOT AN OFFICIAL DOCUMENT",
 * type-specific synthetic content, and a repeated diagonal SAMPLE watermark.
 *
 * Keep EXPIRED_FIRE_ON / VALID_FIRE_ON identical to the seeded records in
 * src/data/demo.ts so the sample PDF and the case record never disagree.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const OUT = resolve(flag('--out', 'public/samples'));
const MANIFEST = resolve(flag('--manifest', 'src/data/sample-pdfs.json'));

// Fixed validity dates: must match expiredFireOn / the valid fire certificate in src/data/demo.ts.
const EXPIRED_FIRE_ON = '2026-10-15';
const VALID_FIRE_ON = '2027-08-23';

// Mirrors the seed() document plan in src/data/demo.ts: 12 cases across three
// templates, plus the five extra documents pushed onto demo-app-0 and demo-app-4.
const TEMPLATE_DOCUMENTS = [
  ['Affidavit', 'Fire Safety Certificate'],
  ['Board Resolution', 'University NOC', 'Trust Deed Amendment'],
  ['Building Plan', 'Faculty List', 'Lab Equipment Inventory'],
];
const refNo = index => `DEMO-2026-${1001 + index}`;
const fileName = type => type.toLowerCase().replaceAll(' ', '_') + '.pdf';

const samples = [];
for (let app = 0; app < 12; app += 1) {
  TEMPLATE_DOCUMENTS[app % 3].forEach((docType, position) => {
    const anchor = app === 0 && position === 1;
    samples.push({
      id: `demo-doc-demo-app-${app}-${position}`,
      docType,
      file: fileName(docType),
      caseRef: refNo(app),
      expiresOn: anchor ? EXPIRED_FIRE_ON : undefined,
      issuer: anchor ? 'Synthetic Fire Department' : undefined,
      number: anchor ? 'FIRE-DEMO-001' : undefined,
    });
  });
}
samples.push(
  { id: 'demo-doc-demo-app-0-2', docType: 'Faculty List', file: 'faculty_list.pdf', caseRef: refNo(0) },
  { id: 'demo-doc-demo-app-0-3', docType: 'Land Document', file: 'land_document.pdf', caseRef: refNo(0) },
  { id: 'demo-doc-demo-app-0-4', docType: 'Undertaking', file: 'undertaking.pdf', caseRef: refNo(0) },
  { id: 'demo-doc-demo-app-0-5', docType: 'Fire Safety Certificate', file: 'fire_safety_certificate_valid.pdf', caseRef: refNo(0), expiresOn: VALID_FIRE_ON, issuer: 'Synthetic Fire Department', number: 'FIRE-DEMO-002' },
  { id: 'demo-doc-demo-app-4-extra-0', docType: 'Fire Safety Certificate', file: 'fire_safety_certificate.pdf', caseRef: refNo(4), expiresOn: EXPIRED_FIRE_ON, issuer: 'Synthetic Fire Department', number: 'FIRE-DEMO-001' },
);

const HEADING = 'SYNTHETIC SAMPLE \u2014 NOT AN OFFICIAL DOCUMENT';

/** Escape a string for a PDF literal, mapping the em dash to WinAnsi 0x97. */
function pdfString(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\u2014/g, '\u0097');
}

const ROSTER_DESIGNATIONS = [
  'Professor (Mechanical)',
  'Associate Professor (Computer Science)',
  'Assistant Professor (Electronics)',
  'Professor (Civil)',
];

/** Type-specific synthetic body lines for one sample. */
function bodyLines(sample) {
  const { docType } = sample;
  if (docType === 'Fire Safety Certificate') {
    return [
      'Fire safety certificate (synthetic content)',
      `Certificate number: ${sample.number ?? 'not recorded on the case record'}`,
      `Synthetic issuing authority: ${sample.issuer ?? 'not recorded on the case record'}`,
      `Validity end date on the case record: ${sample.expiresOn ?? 'not recorded'}`,
      'This generated sample certifies nothing; the case record, not this file, drives review.',
    ];
  }
  if (docType === 'Faculty List') {
    return [
      'Faculty roster (synthetic content - 10 rows)',
      'No.  Synthetic name                     Designation                          Experience',
      ...Array.from({ length: 10 }, (_, index) => {
        const number = index + 1;
        const suffix = String(number).padStart(2, '0');
        const designation = ROSTER_DESIGNATIONS[index % ROSTER_DESIGNATIONS.length];
        return `${String(number).padEnd(5)}Synthetic Faculty Member ${suffix}${' '.repeat(Math.max(1, 33 - `Synthetic Faculty Member ${suffix}`.length))}${designation}${' '.repeat(Math.max(1, 39 - designation.length))}${6 + ((number * 3) % 9)} years`;
      }),
    ];
  }
  if (docType === 'Building Plan') {
    return [
      'Building plan fields (synthetic content)',
      'Plot area: 2.10 acres  |  Built-up area: 1,850 sq m  |  Ground floors: 3, plus one basement',
      'Setbacks: front 6.0 m, sides 4.0 m, rear 8.0 m (synthetic measurements)',
      'Drawing reference: SYN-BP-2026-014  |  Stage: as proposed',
    ];
  }
  if (docType === 'Land Document') {
    return [
      'Land parcel and lease terms (synthetic content)',
      'Land parcel: survey number 42/1B, extent 1.80 acres (synthetic cadastral reference)',
      'Lease term: 30 years from 2026-04-01, renewal only on recorded terms (synthetic)',
      'Land use: non-agricultural, as declared in the synthetic demo record',
    ];
  }
  const slug = docType.toLowerCase().replaceAll(' ', '-');
  return [
    `${docType} (synthetic content)`,
    `Document type: ${docType}`,
    `Belongs to demo case ${sample.caseRef}; replaces no real filing and carries no seal.`,
    `Reference: SYN-${slug}-2026`,
  ];
}

/** Full uncompressed content stream for one page. */
function streamFor(sample) {
  const ops = [];
  const put = (x, y, size, bold, gray, text) => {
    ops.push(`${gray} g BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfString(text)}) Tj ET\n`);
  };
  // Repeated diagonal light-gray SAMPLE watermark, drawn first so it sits behind the text.
  for (const y of [110, 290, 470, 650]) {
    for (const x of [36, 216, 396]) {
      ops.push(`0.88 g BT /F2 46 Tf 0.866 0.5 -0.5 0.866 ${x} ${y} Tm (${pdfString('SAMPLE')}) Tj ET\n`);
    }
  }
  put(56, 790, 15, true, 0, HEADING);
  put(56, 771, 8.5, false, 0.35, 'Watermarked synthetic sample generated locally by scripts/generate-sample-pdfs.mjs');
  ops.push(`0.75 G 0.75 w 56 763 m 539 763 l S\n`);

  let y = 738;
  const meta = [
    `Case reference: ${sample.caseRef} (synthetic demo case)`,
    `Document type: ${sample.docType}`,
    `File: ${sample.file}`,
  ];
  for (const line of meta) {
    put(56, y, 10, false, 0.15, line);
    y -= 16;
  }

  y -= 16;
  const body = bodyLines(sample);
  put(56, y, 10.5, true, 0, body[0]);
  y -= 17;
  for (const line of body.slice(1)) {
    put(56, y, 9.5, false, 0.2, line);
    y -= 15;
  }

  ops.push(`0.75 G 0.75 w 56 74 m 539 74 l S\n`);
  put(56, 58, 7.5, false, 0.45, 'Generated locally - deterministic bytes - SHA-256 recorded in src/data/sample-pdfs.json');
  put(56, 46, 7.5, false, 0.45, 'SYNTHETIC SAMPLE \u2014 not an official document. No real person, institution, seal or authority appears in this file.');
  return ops.join('');
}

/** Assemble one single-page PDF 1.4 file with a correct xref table. */
function buildPdf(content) {
  const parts = [];
  const offsets = [0];
  const header = Buffer.from('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n', 'latin1');
  parts.push(header);
  let position = header.length;

  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  bodies.forEach((body, index) => {
    const object = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
    offsets.push(position);
    parts.push(object);
    position += object.length;
  });

  const stream = Buffer.from(content, 'latin1');
  offsets.push(position);
  const contentHead = Buffer.from(`6 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1');
  parts.push(contentHead, stream, Buffer.from('endstream\nendobj\n', 'latin1'));
  position += contentHead.length + stream.length + 'endstream\nendobj\n'.length;

  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (let object = 1; object <= 6; object += 1) {
    xref += `${String(offsets[object]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

mkdirSync(OUT, { recursive: true });
const manifestSamples = {};
const sorted = [...samples].sort((left, right) => (left.id < right.id ? -1 : 1));
for (const sample of sorted) {
  const bytes = buildPdf(streamFor(sample));
  const name = `${sample.id}.pdf`;
  writeFileSync(join(OUT, name), bytes);
  manifestSamples[name] = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}
// Drop stale samples so the directory always matches the manifest.
for (const file of readdirSync(OUT)) {
  if (file.endsWith('.pdf') && !(file in manifestSamples)) rmSync(join(OUT, file));
}

mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(
  MANIFEST,
  `${JSON.stringify({ generator: 'scripts/generate-sample-pdfs.mjs', samples: manifestSamples }, null, 2)}\n`,
);
console.log(`Generated ${sorted.length} sample PDFs in ${OUT}; manifest written to ${MANIFEST}.`);

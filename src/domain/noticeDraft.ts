import { APH_CLAUSES, APH_EDITION, APH_SOURCE_URL, APH_TITLE, aphClauseForDocument, type APHClause } from './aph';
import { assessSnapshot, indiaDate, type AnalysisSnapshot } from './intelligence';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'with', 'shall', 'must', 'any', 'all',
  'not', 'no', 'if', 'then', 'than', 'which', 'who', 'will', 'may', 'can', 'been', 'being', 'their',
]);

const TOKEN_PATTERN = /[a-z0-9]+/g;
const K1 = 1.2;
const B = 0.75;

interface IndexedClause {
  clause: APHClause;
  tokens: string[];
  frequency: Map<string, number>;
}

function tokenize(text: string) {
  return (text.toLowerCase().match(TOKEN_PATTERN) ?? []).filter(token => token.length > 1 && !STOPWORDS.has(token));
}

const INDEX: IndexedClause[] = APH_CLAUSES.map(clause => {
  const tokens = tokenize(`${clause.clause_title} ${clause.chapter_title} ${clause.norm_category.replaceAll('_', ' ')} ${clause.content_text}`);
  const frequency = new Map<string, number>();
  for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  return { clause, tokens, frequency };
});

const DOCUMENT_FREQUENCY = new Map<string, number>();
for (const entry of INDEX) {
  for (const token of new Set(entry.tokens)) DOCUMENT_FREQUENCY.set(token, (DOCUMENT_FREQUENCY.get(token) ?? 0) + 1);
}
const AVERAGE_LENGTH = INDEX.reduce((sum, entry) => sum + entry.tokens.length, 0) / Math.max(1, INDEX.length);

function bm25(query: Set<string>, entry: IndexedClause) {
  let score = 0;
  for (const token of query) {
    const frequency = entry.frequency.get(token) ?? 0;
    if (!frequency) continue;
    const documentFrequency = DOCUMENT_FREQUENCY.get(token) ?? 0;
    const inverseDocumentFrequency = Math.log(1 + (INDEX.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
    score += inverseDocumentFrequency * (frequency * (K1 + 1)) / (frequency + K1 * (1 - B + B * entry.tokens.length / AVERAGE_LENGTH));
  }
  return score;
}

function detailSummary(detail: Record<string, unknown>) {
  const parts = Object.entries(detail).slice(0, 3).map(([key, value]) => {
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    return `${key}=${String(rendered).slice(0, 80)}`;
  });
  return parts.length ? parts.join(', ') : 'no detail fields recorded';
}

function sortedById<T extends { id: string }>(items: T[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

export interface NoticeCitation {
  clause: APHClause;
  reason: string;
  score: number;
}

export interface NoticeDraft {
  title: string;
  body: string;
  citations: NoticeCitation[];
  disclaimer: string;
  generatedAt: string;
  sourceHash: string;
  synthetic: true;
}

export function draftNotice(snapshot: AnalysisSnapshot): NoticeDraft {
  const facts = snapshot.facts;
  const application = facts.application;
  const today = indiaDate(snapshot.captured_at);
  const attention = assessSnapshot(snapshot);
  const factorIds = (key: string) => new Set(attention.factors.find(factor => factor.key === key)?.ids ?? []);
  const openDeficiencies = sortedById(facts.deficiencies.filter(item => factorIds('corrections').has(item.id)));
  const missingTypes = [...factorIds('evidence')].sort((left, right) => left.localeCompare(right));
  const waitingClaims = sortedById(facts.claims.filter(item => factorIds('claims').has(item.id)));
  const confirmedSignals = sortedById(facts.signals.filter(item => factorIds('integrity').has(item.id)));
  const overdueObligations = sortedById(facts.obligations.filter(item => factorIds('obligations').has(item.id)));
  const expiredDocuments = sortedById(facts.documents.filter(document => document.expires_on && document.expires_on < today));
  const rejectedDocuments = sortedById(facts.documents.filter(document => document.scan_status === 'rejected'));
  const pendingDocuments = sortedById(facts.documents.filter(document => document.scan_status === 'pending'));

  const queryParts = [
    ...openDeficiencies.flatMap(item => [item.clause, item.observation, item.remedy]),
    ...missingTypes,
    ...expiredDocuments.flatMap(item => [item.doc_type, item.file_name]),
    ...rejectedDocuments.flatMap(item => [item.doc_type, item.file_name]),
    ...pendingDocuments.flatMap(item => [item.doc_type, item.file_name]),
    ...confirmedSignals.flatMap(item => [item.signal_type, detailSummary(item.detail)]),
    ...waitingClaims.flatMap(item => [item.clause_snapshot, item.statement_snapshot]),
    ...overdueObligations.flatMap(item => [item.title, item.statutory_norm ?? '', (item.required_evidence ?? []).join(' ')]),
  ];
  const query = new Set(tokenize(queryParts.join(' ')));

  const scores = new Map<string, number>();
  const directReasons = new Map<string, Set<string>>();
  for (const entry of INDEX) {
    const score = bm25(query, entry);
    if (score > 0) scores.set(entry.clause.clause_number, score);
  }
  for (const type of missingTypes) {
    const clause = aphClauseForDocument(type);
    if (!clause) continue;
    scores.set(clause.clause_number, (scores.get(clause.clause_number) ?? 0) + 8);
    const reasons = directReasons.get(clause.clause_number) ?? new Set<string>();
    reasons.add(type);
    directReasons.set(clause.clause_number, reasons);
  }

  const citations = [...scores.entries()]
    .map(([clauseNumber, score]) => {
      const clause = APH_CLAUSES.find(candidate => candidate.clause_number === clauseNumber);
      if (!clause) return null;
      const direct = directReasons.get(clauseNumber);
      return {
        clause,
        reason: direct ? `Required document category: ${[...direct].sort((left, right) => left.localeCompare(right)).join(', ')}` : 'Text match against the captured issue record',
        score,
      };
    })
    .filter((citation): citation is NoticeCitation => citation !== null)
    .sort((left, right) => right.score - left.score || left.clause.clause_number.localeCompare(right.clause.clause_number))
    .slice(0, 4);

  const issues: string[] = [];
  for (const item of openDeficiencies) {
    issues.push(`Correction ${item.id} (clause ${item.clause}) is recorded as ${item.status}. Observation: ${item.observation} Recorded remedy: ${item.remedy} Response due: ${item.due_at}.`);
  }
  for (const type of missingTypes) {
    issues.push(`Required document category "${type}" has no eligible reviewed document in the captured record.`);
  }
  for (const document of expiredDocuments) {
    issues.push(`Document ${document.file_name} (${document.doc_type}) records expiry ${document.expires_on}, before the captured date ${today}.`);
  }
  for (const document of rejectedDocuments) {
    issues.push(`Document ${document.file_name} (${document.doc_type}) has scan status rejected.`);
  }
  for (const document of pendingDocuments) {
    issues.push(`Document ${document.file_name} (${document.doc_type}) has scan status pending and is not treated as reviewed evidence.`);
  }
  for (const signal of confirmedSignals) {
    issues.push(`Integrity signal ${signal.signal_type} is confirmed (${signal.severity}). Recorded detail: ${detailSummary(signal.detail)}.`);
  }
  for (const claim of waitingClaims) {
    issues.push(`Mandatory claim ${claim.clause_snapshot} — ${claim.statement_snapshot} — has no current review basis in the captured record (status ${claim.status}).`);
  }
  for (const obligation of overdueObligations) {
    issues.push(`Continuing obligation ${obligation.title} was due ${obligation.due_date} and is recorded as ${obligation.status}.`);
  }

  const actions: string[] = [];
  if (openDeficiencies.length) actions.push('Resolve or re-check each recorded correction through the workflow; a resolution without a re-check remains open.');
  if (missingTypes.length) actions.push('Obtain and review the missing required document categories, or record why a category does not apply.');
  if (expiredDocuments.length || rejectedDocuments.length) actions.push('Obtain a current, reviewed document or record a validity review outcome; quarantined and expired files are not current evidence.');
  if (confirmedSignals.length) actions.push('Inspect the confirmed integrity signal and its linked evidence; record a disposition only through a permitted review action.');
  if (overdueObligations.length) actions.push('Record the current status of each overdue obligation or an evidence-backed extension.');
  if (waitingClaims.length) actions.push('Review the mandatory claims whose recorded basis is not current, and link current evidence where the verification method requires it.');
  if (!actions.length) actions.push('No specific action is requested by this draft; the captured record does not identify an open item.');

  const displayedIssues = issues.length > 12 ? [...issues.slice(0, 12), `Additional recorded issues: ${issues.length - 12}.`] : issues;
  const citationLines = citations.length
    ? citations.map((citation, index) => `${index + 1}. Clause ${citation.clause.clause_number} — ${citation.clause.clause_title} (chapter ${citation.clause.chapter_number}, page ${citation.clause.page_number}). Seed excerpt: "${citation.clause.content_text.slice(0, 220)}${citation.clause.content_text.length > 220 ? '…' : ''}"`)
    : ['No seeded handbook clause matched the captured issue terms.'];

  const disclaimer = 'Synthetic demonstration draft. The handbook references are seeded excerpts, not an official AICTE citation. A permitted human reviewer must verify the captured facts and decide whether any action is appropriate. This draft does not issue a notice, determine non-compliance, or change the application.';
  const body = [
    `DRAFT FOR HUMAN REVIEW — ${application.ref_no}`,
    `Captured source: ${snapshot.source_hash}`,
    `Captured at: ${snapshot.captured_at} (IST date ${today})`,
    `Handbook seed: ${APH_TITLE}, edition ${APH_EDITION}. ${APH_SOURCE_URL}`,
    '',
    'Recorded issues',
    ...(displayedIssues.length ? displayedIssues.map((issue, index) => `${index + 1}. ${issue}`) : ['1. No open issue was identified in the captured record.']),
    '',
    'Relevant handbook references',
    ...citationLines,
    '',
    'Suggested review actions',
    ...actions.map((action, index) => `${index + 1}. ${action}`),
    '',
    disclaimer,
  ].join('\n');

  return {
    title: `Draft notice — ${application.ref_no}`,
    body,
    citations,
    disclaimer,
    generatedAt: snapshot.captured_at,
    sourceHash: snapshot.source_hash,
    synthetic: true,
  };
}

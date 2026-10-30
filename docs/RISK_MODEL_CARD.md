# Risk Model Card: Clauseway Escalation Risk Advisory (v1)

## 1. Model Overview

| Property | Value |
| --- | --- |
| **Model ID / Engine** | `clauseway-risk-model-v1` |
| **Model Type** | Gradient Boosted Decision Trees (LightGBM 4.7.0) |
| **Schema Version** | 1 (`src/data/risk-model.json`) |
| **Trained Date** | 2026-10-29 |
| **Inference Runtime** | In-browser deterministic tree traversal (`src/domain/riskModel.ts`) with zero external API calls |
| **Reproducibility Seed** | `20261029` (`scripts/train-risk-model.py`) |
| **Parity Test Fixture** | 180 rows verified in `tests/risk-model.test.ts` |

---

## 2. Intended Use and Advisory Boundaries

> [!IMPORTANT]
> **Advisory Only — Not an Approval Engine.**
> This model scores operational escalation risk to help case coordinators and officers triage review queues. It **does not predict, automate, recommend, or decide statutory approval or rejection outcomes**. All approval, rejection, and deficiency actions are reserved exclusively for human officers holding verified jurisdiction under [`docs/RBAC.md`](RBAC.md).

### Permitted Uses
- Ordering review queues to prioritize cases with urgent or compound risk indicators (e.g. approaching deadlines with unresolved claims).
- Explaining risk drivers via tree feature contributions (local Shapley-like additive attribution).
- Identifying cases with missing or stale evidence bases before scheduling committee visits.

### Prohibited Uses
- Automated case decisions or eligibility determinations.
- Overriding officer scrutiny or committee findings.
- Presentation as an official AICTE compliance assessment or regulatory prediction.

---

## 3. Training and Validation Data

The training data is generated from a synthetic latent-risk generator simulating institutional application lifecycles under AICTE Approval Process Handbook (APH 2024-27) parameters.

| Split | Sample Count | Percentage |
| --- | --- | --- |
| **Training set** | 4,800 | 80% |
| **Validation set** | 1,200 | 20% |
| **Total** | 6,000 | 100% |

### Target Label
A binary indicator (`0` or `1`) representing a **synthetic 14-day escalation or regulatory breach event** (e.g. deadline expiration without resolution, critical document expiration during scrutiny, or unaddressed deficiency escalation).

---

## 4. Feature Catalog (17 Features)

All 17 features are extracted deterministically from application snapshots and claim states:

| # | Feature Key | Label | Unit | Description |
|---|---|---|---|---|
| 1 | `waiting_claim_ratio` | Mandatory claims without a current review | ratio [0..1] | Share of mandatory claims whose recorded review basis is not current. |
| 2 | `open_deficiencies` | Open or unchecked corrections | count [0..8] | Open, escalated, or resolved-without-recheck corrections. |
| 3 | `missing_required_documents` | Required document categories without current validity | count [0..8] | Template-required document types with no eligible reviewed document. |
| 4 | `deadline_days` | Days until application deadline | days [-365..365] | Days remaining until statutory SLA due date; clamped to 365 when no deadline is set; negative values are past due. |
| 5 | `deadline_recorded` | Application deadline recorded | flag {0, 1} | 1 when the captured application has a recorded deadline; 0 otherwise. |
| 6 | `overdue_obligations` | Continuing obligations overdue | count | Unfulfilled obligations whose due date is before the evaluation date. |
| 7 | `confirmed_signals` | Confirmed integrity signals | count | Tamper or fraud signals with a confirmed disposition. |
| 8 | `scope_review_pending` | Course scope review pending | flag {0, 1} | 1 when requested course intake revision has no current acknowledgement. |
| 9 | `pending_independent_reviews` | Independent reviews needing current basis | count | Mandatory case reviews that are incomplete or bound to stale evidence. |
| 10 | `expired_documents` | Documents past stated expiry | count | Uploaded documents whose validity period has lapsed. |
| 11 | `rejected_scans` | Rejected document scans | count | Documents rejected by antivirus or MIME verification. |
| 12 | `pending_scans` | Pending document scans | count | Documents currently awaiting antivirus scanning. |
| 13 | `application_age_days` | Application age | days [0..1200] | Elapsed days since application draft creation. |
| 14 | `stage_index` | Workflow stage index | index [0..4] | 0=submission, 1=scrutiny, 2=expert visit, 3=final decision, 4=outcome. |
| 15 | `evc_required` | Expert visit required | flag {0, 1} | 1 when workflow requires an Expert Visit Committee. |
| 16 | `documents_count` | Captured documents | count | Total documents attached to the case dossier. |
| 17 | `claims_count` | Captured claims | count | Total statutory claims declared in the application. |

---

## 5. Quantitative Evaluation

Evaluated against the held-out validation set of 1,200 synthetic applications:

| Metric | Measured Value | Baseline Reference |
| --- | --- | --- |
| **ROC-AUC** | **0.796983** | Random baseline: 0.500 |
| **Log Loss** | **0.548474** | Null prevalence log loss: 0.693 |
| **Expected Value (Logits)** | **-0.113631** | Corresponds to ~47.2% baseline base rate |

Inference outputs are mapped to three human-readable risk bands:
- **Low**: probability < 0.35
- **Watch**: probability 0.35 to 0.65
- **High**: probability > 0.65

---

## 6. Required UI Copy and Advisory Disclosures

Per [`docs/UI_COPY_GUIDE.md`](UI_COPY_GUIDE.md), any surface rendering risk scores or feature attributions must include the standard disclosure:
> *"Advisory only; ranks reviewer attention and does not predict or replace human regulatory decisions."*

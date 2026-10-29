"""Train the synthetic breach-risk advisory model and export deterministic artifacts.

Dependencies: Python 3.11+, numpy, lightgbm, scikit-learn.
The label is synthetic. This model is an advisory demonstration, not a validated
prediction of any real institution's outcome. Run from the repository root:

    python scripts/train-risk-model.py

Outputs:
    src/data/risk-model.json
    tests/fixtures/risk-model-parity.json
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import lightgbm as lgb
from sklearn.metrics import log_loss, roc_auc_score

SEED = 20261029
TRAIN_ROWS = 4800
VALIDATION_ROWS = 1200
PARITY_ROWS = 180
ENGINE = "clauseway-risk-model-v1"
TRAINED_AT = "2026-10-29T00:00:00Z"

FEATURES = [
    {"key": "waiting_claim_ratio", "label": "Mandatory claims without a current review", "unit": "ratio", "description": "Share of mandatory claims whose recorded review basis is not current."},
    {"key": "open_deficiencies", "label": "Open or unchecked corrections", "unit": "count", "description": "Open, escalated, or resolved-without-recheck corrections."},
    {"key": "missing_required_documents", "label": "Required document categories without current reviewed validity", "unit": "count", "description": "Template-required document types with no eligible reviewed document."},
    {"key": "deadline_days", "label": "Days until the recorded application deadline", "unit": "days", "description": "Clamped to 365 when no deadline is recorded; negative values are past due."},
    {"key": "deadline_recorded", "label": "Application deadline recorded", "unit": "flag", "description": "1 when the captured application has a deadline; 0 otherwise."},
    {"key": "overdue_obligations", "label": "Continuing obligations overdue", "unit": "count", "description": "Unfulfilled obligations whose due date is before the captured date."},
    {"key": "confirmed_signals", "label": "Confirmed integrity signals", "unit": "count", "description": "Integrity signals with a confirmed disposition."},
    {"key": "scope_review_pending", "label": "Course scope review pending", "unit": "flag", "description": "1 when the requested scope revision has no current acknowledgement."},
    {"key": "pending_independent_reviews", "label": "Independent reviews needing a current basis", "unit": "count", "description": "Mandatory case reviews that are incomplete or bound to stale evidence."},
    {"key": "expired_documents", "label": "Documents past their stated expiry", "unit": "count", "description": "Captured documents with an expiry date before the captured date."},
    {"key": "rejected_scans", "label": "Rejected document scans", "unit": "count", "description": "Documents whose scan status is rejected."},
    {"key": "pending_scans", "label": "Pending document scans", "unit": "count", "description": "Documents whose scan status is pending."},
    {"key": "application_age_days", "label": "Application age", "unit": "days", "description": "Days from application creation to the captured date, clamped to 0..1200."},
    {"key": "stage_index", "label": "Workflow stage index", "unit": "index", "description": "0 submission, 1 scrutiny, 2 expert visit, 3 final decision, 4 outcome."},
    {"key": "evc_required", "label": "Expert visit required", "unit": "flag", "description": "1 when the application requires an expert visit."},
    {"key": "documents_count", "label": "Captured documents", "unit": "count", "description": "Number of documents attached to the captured case."},
    {"key": "claims_count", "label": "Captured claims", "unit": "count", "description": "Number of requirement claims in the captured case."},
]
FEATURE_KEYS = [feature["key"] for feature in FEATURES]


def sigmoid(value: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-value))


def synthetic_rows(count: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    waiting = np.clip(rng.beta(1.6, 2.4, count) * rng.binomial(1, 0.82, count), 0, 1)
    deficiencies = np.clip(rng.poisson(0.65, count), 0, 8)
    missing = np.clip(rng.poisson(0.55, count), 0, 8)
    deadline_recorded = rng.binomial(1, 0.82, count)
    deadline_days = np.where(
        deadline_recorded == 1,
        np.clip(rng.normal(18, 34, count), -120, 240),
        365,
    )
    obligations = np.clip(rng.poisson(0.45, count), 0, 8)
    signals = np.clip(rng.binomial(1, 0.09, count) * rng.integers(1, 4, count), 0, 4)
    scope = rng.binomial(1, 0.14, count)
    reviews = np.clip(rng.poisson(0.35, count), 0, 5)
    expired = np.clip(rng.poisson(0.45, count), 0, 8)
    rejected = np.clip(rng.poisson(0.16, count), 0, 4)
    pending = np.clip(rng.poisson(0.32, count), 0, 6)
    age = np.clip(rng.gamma(2.0, 55.0, count), 0, 1200)
    stage = rng.choice([0, 1, 2, 3, 4], count, p=[0.08, 0.46, 0.24, 0.12, 0.10])
    evc = rng.binomial(1, 0.42, count)
    documents = np.clip(rng.poisson(7.5, count) + 2, 0, 24)
    claims = np.clip(rng.poisson(10.0, count) + 4, 1, 30)

    matrix = np.column_stack([
        waiting, deficiencies, missing, deadline_days, deadline_recorded,
        obligations, signals, scope, reviews, expired, rejected, pending,
        age, stage, evc, documents, claims,
    ]).astype(np.float64)

    due_pressure = np.where(deadline_recorded == 1, np.clip((14.0 - deadline_days) / 14.0, 0, 3), 0)
    logit = (
        -3.7
        + 3.1 * waiting
        + 0.34 * deficiencies
        + 0.52 * missing
        + 0.72 * due_pressure
        + 0.30 * obligations
        + 0.95 * signals
        + 0.62 * scope
        + 0.24 * reviews
        + 0.33 * expired
        + 0.42 * rejected
        + 0.14 * pending
        + 0.0038 * age
        + 0.22 * stage
        + 0.38 * evc
        + rng.normal(0, 0.38, count)
    )
    probability = sigmoid(logit)
    labels = (rng.random(count) < probability).astype(np.int32)
    return matrix, labels


class Node:
    __slots__ = ("feature", "threshold", "count", "value", "left", "right")

    def __init__(self, feature: int, threshold: float, count: float, value: float, left: "Node | None" = None, right: "Node | None" = None):
        self.feature = feature
        self.threshold = threshold
        self.count = count
        self.value = value
        self.left = left
        self.right = right


class Element:
    __slots__ = ("feature", "zero", "one", "weight")

    def __init__(self, feature: int = 0, zero: float = 0.0, one: float = 0.0, weight: float = 0.0):
        self.feature = feature
        self.zero = zero
        self.one = one
        self.weight = weight


def parse_tree(raw: dict) -> Node:
    if "leaf_value" in raw:
        return Node(-1, 0.0, float(raw["leaf_count"]), float(raw["leaf_value"]))
    return Node(
        int(raw["split_feature"]),
        float(raw["threshold"]),
        float(raw["internal_count"]),
        0.0,
        parse_tree(raw["left_child"]),
        parse_tree(raw["right_child"]),
    )


def extend_path(path: list[Element], start: int, depth: int, zero: float, one: float, feature: int) -> None:
    element = path[start + depth]
    element.feature = feature
    element.zero = zero
    element.one = one
    element.weight = 1.0 if depth == 0 else 0.0
    for index in range(depth - 1, -1, -1):
        path[start + index + 1].weight += one * path[start + index].weight * (index + 1.0) / (depth + 1.0)
        path[start + index].weight = zero * path[start + index].weight * (depth - index) / (depth + 1.0)


def unwind_path(path: list[Element], start: int, depth: int, path_index: int) -> None:
    one = path[start + path_index].one
    zero = path[start + path_index].zero
    next_one = path[start + depth].weight
    for index in range(depth - 1, -1, -1):
        if one != 0.0:
            previous = path[start + index].weight
            path[start + index].weight = next_one * (depth + 1.0) / ((index + 1.0) * one)
            next_one = previous - path[start + index].weight * zero * (depth - index) / (depth + 1.0)
        else:
            path[start + index].weight = (path[start + index].weight * (depth + 1.0)) / (zero * (depth - index))
    for index in range(path_index, depth):
        path[start + index].feature = path[start + index + 1].feature
        path[start + index].zero = path[start + index + 1].zero
        path[start + index].one = path[start + index + 1].one


def unwound_path_sum(path: list[Element], start: int, depth: int, path_index: int) -> float:
    one = path[start + path_index].one
    zero = path[start + path_index].zero
    next_one = path[start + depth].weight
    total = 0.0
    for index in range(depth - 1, -1, -1):
        if one != 0.0:
            share = next_one * (depth + 1.0) / ((index + 1.0) * one)
            total += share
            next_one = path[start + index].weight - share * zero * (depth - index) / (depth + 1.0)
        else:
            total += (path[start + index].weight / zero) / ((depth - index) / (depth + 1.0))
    return total


def tree_shap(node: Node, values: np.ndarray, phi: np.ndarray, path: list[Element], start: int, depth: int, parent_zero: float, parent_one: float, parent_feature: int) -> None:
    unique_start = start + depth
    if depth > 0:
        for index in range(depth):
            source = path[start + index]
            target = path[unique_start + index]
            target.feature = source.feature
            target.zero = source.zero
            target.one = source.one
            target.weight = source.weight
    extend_path(path, unique_start, depth, parent_zero, parent_one, parent_feature)
    if node.left is None:
        for index in range(1, depth + 1):
            element = path[unique_start + index]
            weight = unwound_path_sum(path, unique_start, depth, index)
            phi[element.feature] += weight * (element.one - element.zero) * node.value
        return
    if values[node.feature] <= node.threshold:
        hot, cold = node.left, node.right
    else:
        hot, cold = node.right, node.left
    hot_zero = hot.count / node.count
    cold_zero = cold.count / node.count
    incoming_zero = 1.0
    incoming_one = 1.0
    path_index = 0
    while path_index <= depth:
        if path[unique_start + path_index].feature == node.feature:
            break
        path_index += 1
    if path_index != depth + 1:
        incoming_zero = path[unique_start + path_index].zero
        incoming_one = path[unique_start + path_index].one
        unwind_path(path, unique_start, depth, path_index)
        depth -= 1
    tree_shap(hot, values, phi, path, unique_start, depth + 1, hot_zero * incoming_zero, incoming_one, node.feature)
    tree_shap(cold, values, phi, path, unique_start, depth + 1, cold_zero * incoming_zero, 0.0, node.feature)


def expected_value(node: Node) -> float:
    if node.left is None:
        return node.value
    return (node.left.count * expected_value(node.left) + node.right.count * expected_value(node.right)) / node.count


def explain(trees: list[Node], values: np.ndarray) -> np.ndarray:
    phi = np.zeros(len(FEATURE_KEYS) + 1)
    path = [Element() for _ in range(256)]
    for tree in trees:
        phi[-1] += expected_value(tree)
        tree_shap(tree, values, phi, path, 0, 0, 1.0, 1.0, -1)
    return phi


def serialize_tree(node: Node) -> list[dict]:
    rows: list[dict] = []

    def visit(current: Node) -> int:
        index = len(rows)
        rows.append({})
        if current.left is None:
            rows[index] = {"feature": -1, "threshold": 0.0, "left": -1, "right": -1, "count": current.count, "value": current.value}
        else:
            rows[index] = {"feature": current.feature, "threshold": current.threshold, "left": -1, "right": -1, "count": current.count, "value": 0.0}
            left = visit(current.left)
            right = visit(current.right)
            rows[index]["left"] = left
            rows[index]["right"] = right
        return index

    visit(node)
    return rows


def main() -> None:
    rng = np.random.default_rng(SEED)
    train_x, train_y = synthetic_rows(TRAIN_ROWS, rng)
    validation_x, validation_y = synthetic_rows(VALIDATION_ROWS, rng)

    model = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=40,
        learning_rate=0.12,
        num_leaves=15,
        max_depth=4,
        min_child_samples=30,
        subsample=1.0,
        colsample_bytree=1.0,
        reg_lambda=1.0,
        random_state=SEED,
        deterministic=True,
        force_row_wise=True,
        n_jobs=1,
        verbose=-1,
    )
    model.fit(train_x, train_y)
    booster = model.booster_
    validation_probability = booster.predict(validation_x)
    auc = float(roc_auc_score(validation_y, validation_probability))
    loss = float(log_loss(validation_y, validation_probability))

    dump = booster.dump_model()
    trees = [parse_tree(item["tree_structure"]) for item in dump["tree_info"]]
    expected = sum(expected_value(tree) for tree in trees)

    edge_rows = [
        np.zeros(len(FEATURE_KEYS)),
        np.full(len(FEATURE_KEYS), 1.0),
        np.array([1, 8, 8, -120, 1, 8, 4, 1, 5, 8, 4, 6, 1200, 4, 1, 24, 30], dtype=float),
        np.array([0, 0, 0, 365, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], dtype=float),
    ]
    parity_features = np.vstack([validation_x[:PARITY_ROWS], np.asarray(edge_rows)])
    parity_contributions = booster.predict(parity_features, pred_contrib=True)
    parity_raw = booster.predict(parity_features, raw_score=True)

    max_contribution_error = 0.0
    for values, expected_row in zip(parity_features, parity_contributions):
        mine = explain(trees, values)
        max_contribution_error = max(max_contribution_error, float(np.max(np.abs(mine - expected_row))))
    if max_contribution_error > 1e-9:
        raise SystemExit(f"TreeSHAP parity failed: max abs error {max_contribution_error}")

    if abs(expected - float(parity_contributions[0, -1])) > 1e-12:
        raise SystemExit("Exported expected value does not match LightGBM pred_contrib bias")

    root = Path(__file__).resolve().parents[1]
    model_payload = {
        "schema": 1,
        "engine": ENGINE,
        "trained_at": TRAINED_AT,
        "training": {
            "rows": TRAIN_ROWS,
            "validation_rows": VALIDATION_ROWS,
            "seed": SEED,
            "label": "Synthetic 14-day escalation or breach event generated from a documented latent-risk process.",
            "auc": round(auc, 6),
            "log_loss": round(loss, 6),
            "lightgbm_version": lgb.__version__,
        },
        "expected_value": expected,
        "features": FEATURES,
        "trees": [{"nodes": serialize_tree(tree)} for tree in trees],
    }
    parity_payload = {
        "schema": 1,
        "engine": ENGINE,
        "expected_value": expected,
        "feature_keys": FEATURE_KEYS,
        "rows": [
            {
                "name": f"validation-{index}",
                "features": [float(value) for value in values],
                "raw_score": float(raw),
                "probability": float(probability),
                "contributions": [float(value) for value in contributions],
            }
            for index, (values, raw, probability, contributions) in enumerate(zip(parity_features, parity_raw, booster.predict(parity_features), parity_contributions))
        ],
    }

    model_path = root / "src" / "data" / "risk-model.json"
    parity_path = root / "tests" / "fixtures" / "risk-model-parity.json"
    parity_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(model_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    parity_path.write_text(json.dumps(parity_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {model_path.relative_to(root)} ({model_path.stat().st_size} bytes)")
    print(f"wrote {parity_path.relative_to(root)} ({parity_path.stat().st_size} bytes)")
    print(f"validation AUC {auc:.4f}, log loss {loss:.4f}, trees {len(trees)}, max TreeSHAP error {max_contribution_error:.3e}")


if __name__ == "__main__":
    main()

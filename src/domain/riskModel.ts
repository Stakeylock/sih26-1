import modelJson from '../data/risk-model.json';

export interface RiskFeatureDefinition {
  key: string;
  label: string;
  unit: string;
  description: string;
}

export interface RiskTreeNode {
  feature: number;
  threshold: number;
  left: number;
  right: number;
  count: number;
  value: number;
}

export interface RiskTree {
  nodes: RiskTreeNode[];
}

export interface RiskTrainingSummary {
  rows: number;
  validation_rows: number;
  seed: number;
  label: string;
  auc: number;
  log_loss: number;
  lightgbm_version: string;
}

export interface RiskModel {
  schema: number;
  engine: string;
  trained_at: string;
  training: RiskTrainingSummary;
  expected_value: number;
  features: RiskFeatureDefinition[];
  trees: RiskTree[];
}

export type RiskBand = 'low' | 'watch' | 'high';

export interface RiskContribution {
  key: string;
  label: string;
  unit: string;
  value: number;
  contribution: number;
}

export interface RiskExplanation {
  raw: number;
  probability: number;
  expectedValue: number;
  contributions: RiskContribution[];
}

interface PathElement {
  feature: number;
  zero: number;
  one: number;
  weight: number;
}

export const RISK_MODEL = modelJson as RiskModel;

const PATH_CAPACITY = 256;

export function riskSigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

export function riskBand(probability: number): RiskBand {
  if (probability >= 0.6) return 'high';
  if (probability >= 0.35) return 'watch';
  return 'low';
}

function leafValue(tree: RiskTree, values: number[]) {
  let index = 0;
  for (;;) {
    const node = tree.nodes[index];
    if (node.left < 0) return node.value;
    index = values[node.feature] <= node.threshold ? node.left : node.right;
  }
}

export function predictRaw(features: number[], model: RiskModel = RISK_MODEL) {
  if (features.length !== model.features.length) throw new Error('Risk feature count does not match the model.');
  let raw = 0;
  for (const tree of model.trees) raw += leafValue(tree, features);
  return raw;
}

export function predictProbability(features: number[], model: RiskModel = RISK_MODEL) {
  return riskSigmoid(predictRaw(features, model));
}

function treeExpectedValue(tree: RiskTree, index: number): number {
  const node = tree.nodes[index];
  if (node.left < 0) return node.value;
  return (treeExpectedValue(tree, node.left) * tree.nodes[node.left].count + treeExpectedValue(tree, node.right) * tree.nodes[node.right].count) / node.count;
}

function createPath(): PathElement[] {
  return Array.from({ length: PATH_CAPACITY }, () => ({ feature: 0, zero: 0, one: 0, weight: 0 }));
}

function extendPath(path: PathElement[], start: number, depth: number, zero: number, one: number, feature: number) {
  const element = path[start + depth];
  element.feature = feature;
  element.zero = zero;
  element.one = one;
  element.weight = depth === 0 ? 1 : 0;
  for (let index = depth - 1; index >= 0; index -= 1) {
    path[start + index + 1].weight += one * path[start + index].weight * (index + 1) / (depth + 1);
    path[start + index].weight = zero * path[start + index].weight * (depth - index) / (depth + 1);
  }
}

function unwindPath(path: PathElement[], start: number, depth: number, pathIndex: number) {
  const one = path[start + pathIndex].one;
  const zero = path[start + pathIndex].zero;
  let nextOne = path[start + depth].weight;
  for (let index = depth - 1; index >= 0; index -= 1) {
    if (one !== 0) {
      const previous = path[start + index].weight;
      path[start + index].weight = nextOne * (depth + 1) / ((index + 1) * one);
      nextOne = previous - path[start + index].weight * zero * (depth - index) / (depth + 1);
    } else {
      path[start + index].weight = path[start + index].weight * (depth + 1) / (zero * (depth - index));
    }
  }
  for (let index = pathIndex; index < depth; index += 1) {
    path[start + index].feature = path[start + index + 1].feature;
    path[start + index].zero = path[start + index + 1].zero;
    path[start + index].one = path[start + index + 1].one;
  }
}

function unwoundPathSum(path: PathElement[], start: number, depth: number, pathIndex: number) {
  const one = path[start + pathIndex].one;
  const zero = path[start + pathIndex].zero;
  let nextOne = path[start + depth].weight;
  let total = 0;
  for (let index = depth - 1; index >= 0; index -= 1) {
    if (one !== 0) {
      const share = nextOne * (depth + 1) / ((index + 1) * one);
      total += share;
      nextOne = path[start + index].weight - share * zero * (depth - index) / (depth + 1);
    } else {
      total += path[start + index].weight / zero / ((depth - index) / (depth + 1));
    }
  }
  return total;
}

function treeShap(tree: RiskTree, nodeIndex: number, values: number[], phi: number[], path: PathElement[], start: number, depth: number, parentZero: number, parentOne: number, parentFeature: number) {
  const uniqueStart = start + depth;
  if (depth > 0) {
    for (let index = 0; index < depth; index += 1) {
      const source = path[start + index];
      const target = path[uniqueStart + index];
      target.feature = source.feature;
      target.zero = source.zero;
      target.one = source.one;
      target.weight = source.weight;
    }
  }
  extendPath(path, uniqueStart, depth, parentZero, parentOne, parentFeature);
  const current = tree.nodes[nodeIndex];
  if (current.left < 0) {
    for (let index = 1; index <= depth; index += 1) {
      const element = path[uniqueStart + index];
      const weight = unwoundPathSum(path, uniqueStart, depth, index);
      phi[element.feature] += weight * (element.one - element.zero) * current.value;
    }
    return;
  }
  const hotIndex = values[current.feature] <= current.threshold ? current.left : current.right;
  const coldIndex = values[current.feature] <= current.threshold ? current.right : current.left;
  const hot = tree.nodes[hotIndex];
  const cold = tree.nodes[coldIndex];
  const hotZero = hot.count / current.count;
  const coldZero = cold.count / current.count;
  let incomingZero = 1;
  let incomingOne = 1;
  let pathIndex = 0;
  while (pathIndex <= depth && path[uniqueStart + pathIndex].feature !== current.feature) pathIndex += 1;
  if (pathIndex !== depth + 1) {
    incomingZero = path[uniqueStart + pathIndex].zero;
    incomingOne = path[uniqueStart + pathIndex].one;
    unwindPath(path, uniqueStart, depth, pathIndex);
    depth -= 1;
  }
  treeShap(tree, hotIndex, values, phi, path, uniqueStart, depth + 1, hotZero * incomingZero, incomingOne, current.feature);
  treeShap(tree, coldIndex, values, phi, path, uniqueStart, depth + 1, coldZero * incomingZero, 0, current.feature);
}

export function explainRisk(features: number[], model: RiskModel = RISK_MODEL): RiskExplanation {
  if (features.length !== model.features.length) throw new Error('Risk feature count does not match the model.');
  const phi = Array.from({ length: model.features.length + 1 }, () => 0);
  const path = createPath();
  for (const tree of model.trees) {
    phi[phi.length - 1] += treeExpectedValue(tree, 0);
    treeShap(tree, 0, features, phi, path, 0, 0, 1, 1, -1);
  }
  const expectedValue = phi[phi.length - 1];
  if (Math.abs(expectedValue - model.expected_value) > 1e-9) throw new Error('Risk model expected value is inconsistent with its trees.');
  const raw = predictRaw(features, model);
  const contributions = model.features.map((feature, index) => ({
    key: feature.key,
    label: feature.label,
    unit: feature.unit,
    value: features[index],
    contribution: phi[index],
  })).sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution) || left.key.localeCompare(right.key));
  return {
    raw,
    probability: riskSigmoid(raw),
    expectedValue,
    contributions,
  };
}

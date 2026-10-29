import { describe, expect, it } from 'vitest';
import { explainRisk, predictProbability, riskBand, RISK_MODEL } from '../src/domain/riskModel';
import fixture from './fixtures/risk-model-parity.json';

describe('risk model parity', () => {
  it('matches the exported LightGBM raw scores, probabilities and TreeSHAP contributions', () => {
    for (const row of fixture.rows) {
      const expectedByKey = new Map<string, number>();
      for (const [index, key] of fixture.feature_keys.entries()) {
        expectedByKey.set(key, row.contributions[index]);
      }

      const explanation = explainRisk(row.features);
      expect(explanation.raw).toBeCloseTo(row.raw_score, 9);
      expect(explanation.probability).toBeCloseTo(row.probability, 9);
      expect(explanation.expectedValue).toBeCloseTo(fixture.expected_value, 9);
      expect(predictProbability(row.features)).toBeCloseTo(row.probability, 9);

      const reconstruction = explanation.expectedValue + explanation.contributions.reduce((sum, item) => sum + item.contribution, 0);
      expect(reconstruction).toBeCloseTo(row.raw_score, 9);

      const observed = [...explanation.contributions];
      for (let index = 1; index < observed.length; index += 1) {
        expect(Math.abs(observed[index].contribution)).toBeLessThanOrEqual(Math.abs(observed[index - 1].contribution));
      }
      for (const contribution of observed) {
        const expected = expectedByKey.get(contribution.key);
        expect(expected).toBeDefined();
        expect(contribution.contribution).toBeCloseTo(expected!, 9);
        expect(contribution.value).toBe(row.features[fixture.feature_keys.indexOf(contribution.key)]);
      }
      expect(explanation.contributions.map(item => item.key).sort()).toEqual([...fixture.feature_keys].sort());
    }
  });

  it('uses the configured bands and rejects the wrong feature count', () => {
    expect(riskBand(0.6)).toBe('high');
    expect(riskBand(0.35)).toBe('watch');
    expect(riskBand(0.34)).toBe('low');
    expect(() => explainRisk(Array(RISK_MODEL.features.length + 1).fill(0))).toThrow(/feature count/);
    expect(() => explainRisk(Array(RISK_MODEL.features.length - 1).fill(0))).toThrow(/feature count/);
  });
});

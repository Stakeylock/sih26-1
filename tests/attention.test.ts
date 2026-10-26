import { describe, expect, it } from 'vitest';
import { seed } from '../src/data/demo';
import { attentionFlags, attentionReasons } from '../src/ui/caseAttention';

const workspace = seed();
const attached = (applicationId: string) => workspace.documents.filter(document => document.application_id === applicationId);

describe('overview attention reasons', () => {
  it('does not report attached documents as missing', () => {
    const app = workspace.applications.find(application => application.id === 'demo-app-4')!;
    expect(attentionReasons(app, attached(app.id), workspace.claims, workspace.deficiencies)).toEqual([]);
  });

  it('reports attached documents when they are genuinely absent', () => {
    const app = workspace.applications.find(application => application.id === 'demo-app-4')!;
    const reasons = attentionReasons(app, [], workspace.claims, workspace.deficiencies);
    expect(reasons).toContain('Missing 3 required inputs: Board Resolution (clean scan required), University NOC (clean scan required) and 1 more.');
  });

  it('reports the open deficiency and claims awaiting verification', () => {
    const app = workspace.applications.find(application => application.id === 'demo-app-0')!;
    const reasons = attentionReasons(app, attached(app.id), workspace.claims, workspace.deficiencies);
    expect(reasons).toContain('APH safety: The Fire Safety Certificate expired before the scrutiny date.');
    expect(reasons).toContain('2 of 9 claims awaiting verification.');
  });

  it('returns deterministic owner, next-action, and escalation metadata', () => {
    const app = workspace.applications.find(application => application.id === 'demo-app-0')!;
    const flags = attentionFlags(app, attached(app.id), workspace.claims, workspace.deficiencies);
    expect(flags[0]).toMatchObject({ owner: 'Institution', next: expect.stringContaining('Submit'), nextEscalationAt: expect.any(String) });
    expect(flags.map(flag => flag.priority)).toEqual([...flags].map(flag => flag.priority).sort((a, b) => a - b));
  });
});

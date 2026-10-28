// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildVoiceCallPlan, classifyVoiceResponse, parsePromisedDate, voiceCallDisclaimer, voicePresets } from '../src/domain/voiceCall';
import { createDemoRepository } from '../src/data/demo';

const STORAGE = 'clauseway-isolated-demo-v12';
const NOW = new Date('2026-10-28T00:00:00Z');

describe('voice reminder classification', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  afterEach(() => { localStorage.removeItem(STORAGE); });

  it('maps each preset transcript to its intended outcome', () => {
    const intents = Object.fromEntries(voicePresets.map(item => [item.id, classifyVoiceResponse(item.transcript)]));
    expect(intents).toEqual({
      submitted: 'SUBMITTED',
      'will-submit': 'WILL_SUBMIT',
      'more-time': 'NEEDS_MORE_TIME',
      'wrong-person': 'WRONG_PERSON',
      human: 'REQUESTS_HUMAN',
    });
  });

  it('prioritises a human request over any commitment in the same transcript', () => {
    expect(classifyVoiceResponse('I already submitted it, but I want to speak to a supervisor.')).toBe('REQUESTS_HUMAN');
  });

  it('prioritises a wrong contact over a stated submission', () => {
    expect(classifyVoiceResponse('You have the wrong number; I am not associated with that institution, my colleague submitted it.')).toBe('WRONG_PERSON');
  });

  it('returns an unclear outcome for an empty or noncommittal response', () => {
    expect(classifyVoiceResponse('   ')).toBe('UNCLEAR_RESPONSE');
    expect(classifyVoiceResponse('Hello, who is this?')).toBe('UNCLEAR_RESPONSE');
  });

  it('reads an explicit date and a relative day promise', () => {
    expect(parsePromisedDate('We will upload it on 2026-11-05.', NOW)).toBe('2026-11-05');
    expect(parsePromisedDate('Our registrar will upload the revised list in 3 days.', NOW)).toBe('2026-10-31');
    expect(parsePromisedDate('We will upload it on 2026-02-31.', NOW)).toBeNull();
    expect(parsePromisedDate('We will upload it soon.', NOW)).toBeNull();
  });

  it('maps intents to notification kinds without granting outcomes', () => {
    expect(buildVoiceCallPlan('We already submitted it.', NOW).notificationKind).toBe('INFO');
    expect(buildVoiceCallPlan('We will upload it in 3 days.', NOW).notificationKind).toBe('REMINDER');
    expect(buildVoiceCallPlan('We need more time.', NOW).notificationKind).toBe('REMINDER');
    expect(buildVoiceCallPlan('This is the wrong number.', NOW).notificationKind).toBe('ESCALATION');
    expect(buildVoiceCallPlan('Please connect me to a human officer.', NOW).notificationKind).toBe('ESCALATION');
    expect(buildVoiceCallPlan('Who is this?', NOW).notificationKind).toBe('REMINDER');
  });

  it('keeps the simulation disclaimer and promised date in the plan', () => {
    const plan = buildVoiceCallPlan('Our registrar will upload the revised faculty list in 3 days.', NOW);
    expect(plan.promisedDate).toBe('2026-10-31');
    expect(plan.followUp).toContain('2026-10-31');
    expect(plan.disclaimer).toBe(voiceCallDisclaimer);
    expect(plan.detail).toContain('stays open until the upload is recorded');
  });

  it('records a voice follow-up as a simulated notification without changing the case', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const workspace = await repo.workspace();
    const app = workspace.applications[0];
    if (!app) throw new Error('No application in seed.');
    const before = { status: app.status, version: app.version };
    const plan = buildVoiceCallPlan('We already submitted the fire safety certificate.', NOW);
    const result = await repo.dispatchNotification({
      applicationId: app.id,
      channel: ['voice'],
      kind: plan.notificationKind,
      subject: `Simulated voice reminder: ${plan.label}`,
      body: `${app.ref_no}. ${plan.detail} ${plan.followUp} Transcript: "We already submitted the fire safety certificate."`,
    });
    expect(result.gateway.voiceGateway).toBe('SIMULATED');
    const attempt = result.attempts.find(item => item.channel === 'voice');
    expect(attempt?.status).toBe('simulated');
    const after = await repo.workspace();
    const notification = after.notifications.find(item => item.id === result.notificationId);
    expect(notification?.channel).toBe('voice');
    expect(notification?.deliveryStatus).toBe('simulated');
    const updated = after.applications.find(item => item.id === app.id);
    expect({ status: updated?.status, version: updated?.version }).toEqual(before);
    const event = after.events.find(item => item.action === 'notification_dispatched' && item.payload.notification_id === result.notificationId);
    expect(event?.payload.channel).toBe('voice');
  });
});

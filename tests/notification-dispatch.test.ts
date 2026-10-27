// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDemoRepository } from '../src/data/demo';
import type { DispatchNotificationParams } from '../src/domain/notification';

const STORAGE = 'clauseway-isolated-demo-v12';

describe('notification dispatch', () => {
  beforeEach(() => { localStorage.removeItem(STORAGE); });
  afterEach(() => { localStorage.removeItem(STORAGE); });
  async function seedApp(repo: Awaited<ReturnType<typeof createDemoRepository>>) {
    const workspace = await repo.workspace();
    const app = workspace.applications[0];
    if (!app) throw new Error('No application in seed.');
    return { app, workspace };
  }

  async function dispatch(repo: Awaited<ReturnType<typeof createDemoRepository>>, params: Partial<DispatchNotificationParams> = {}) {
    const { app } = await seedApp(repo);
    return await repo.dispatchNotification({
      applicationId: app.id,
      kind: 'REMINDER',
      subject: 'Synthetic test notification',
      body: 'This is a test notification dispatched from the demo workspace.',
      ...params,
    });
  }

  it('dispatches an in-app notification and records the audit event', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const result = await dispatch(repo);
    expect(result.notificationId).toBeDefined();
    expect(result.gateway.emailGateway).toBe('ETHEREAL_SANDBOX');
    expect(result.gateway.smsGateway).toBe('SIMULATED');
    const attempt = result.attempts.find(a => a.channel === 'in_app');
    expect(attempt?.status).toBe('delivered');
    const workspace = await repo.workspace();
    const notification = workspace.notifications.find(n => n.id === result.notificationId);
    expect(notification).toBeDefined();
    expect(notification?.channel).toBe('in_app');
    expect(notification?.deliveryStatus).toBe('delivered');
    const event = workspace.events.find(e => e.action === 'notification_dispatched');
    expect(event).toBeDefined();
    expect(event?.payload.notification_id).toBe(result.notificationId);
  });

  it('reports simulated when no email gateway is configured', async () => {
    const repo = await createDemoRepository('national_admin');
    const result = await dispatch(repo, { channel: ['email'] });
    const attempt = result.attempts.find(a => a.channel === 'email');
    expect(attempt?.status).toBe('simulated');
    expect(attempt?.detail).toContain('No email gateway configured');
  });

  it('dispatches to email and sms channels independently', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const result = await dispatch(repo, { channel: ['in_app', 'email', 'sms'] });
    const byChannel = Object.fromEntries(result.attempts.map(a => [a.channel, a.status]));
    expect(byChannel['in_app']).toBe('delivered');
    expect(byChannel['email']).toBe('simulated');
    expect(byChannel['sms']).toBe('simulated');
  });

  it('rejects an invalid kind', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    await expect(repo.dispatchNotification({ applicationId: (await seedApp(repo)).app.id, kind: 'BOGUS' as any, subject: 'x', body: 'y' })).rejects.toThrow();
  });

  it('rejects a subject that is too short', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    await expect(repo.dispatchNotification({ applicationId: (await seedApp(repo)).app.id, kind: 'REMINDER', subject: 'ab', body: 'valid body here' })).rejects.toThrow();
  });

  it('rejects a body that is too short', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    await expect(repo.dispatchNotification({ applicationId: (await seedApp(repo)).app.id, kind: 'REMINDER', subject: 'valid subject', body: 'ab' })).rejects.toThrow();
  });

  it('records the actor who dispatched', async () => {
    const repo = await createDemoRepository('scrutiny_officer');
    const result = await dispatch(repo);
    const workspace = await repo.workspace();
    const event = workspace.events.find(e => e.action === 'notification_dispatched');
    expect(event?.actor_role).toBe('scrutiny_officer');
    expect(event?.actor_id).toBeDefined();
  });
});

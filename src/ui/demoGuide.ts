import type { Role, Workspace } from '../domain/model';
import type { Deficiency, Claim } from '../domain/integrity';

export interface DemoGuideStep {
  id: 'correction' | 'scrutiny' | 'inspection' | 'decision' | 'obligation' | 'audit';
  title: string;
  role: Role;
  roleLabel: string;
  route: string;
  routeLabel: string;
  armed: boolean;
  armedBecause: string | null;
  unmetNote: string | null;
}

const roleText: Record<Role, string> = {
  institution: 'Institution',
  scrutiny_officer: 'Scrutiny officer',
  evc_coordinator: 'EVC coordinator',
  regional_officer: 'Regional officer',
  national_admin: 'National administrator',
};

const routeLabelText: Record<DemoGuideStep['id'], string> = {
  correction: 'Case dossier',
  scrutiny: 'Case dossier',
  inspection: 'Verification visits',
  decision: 'Case dossier',
  obligation: 'Obligation register',
  audit: 'Audit logs',
};

const titles: Record<DemoGuideStep['id'], string> = {
  correction: 'Answer an open correction as the institution',
  scrutiny: 'Record the pending claim reviews at scrutiny',
  inspection: 'Plan a synthetic expert visit panel',
  decision: 'Decide the case waiting at final decision',
  obligation: 'Inspect the overdue continuing obligation',
  audit: 'Inspect the audit chain and tamper replay',
};

const overdueToday = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00`).getTime() < new Date().setHours(0, 0, 0, 0);

const claimNeedsReview = (claim: Claim) => claim.status === 'unverified' || claim.status === 'deficient';

const openDeficiency = (workspace: Workspace): { deficiency: Deficiency; ref: string | null; appId: string } | null => {
  const deficiency = workspace.deficiencies.find(item => item.status === 'open' || item.status === 'escalated');
  if (!deficiency) return null;
  const app = workspace.applications.find(item => item.id === deficiency.application_id);
  return { deficiency, ref: app?.ref_no ?? null, appId: deficiency.application_id };
};

const inspectableApplication = (workspace: Workspace) =>
  workspace.applications.find(app => app.status === 'submitted' || app.status === 'resubmitted' || app.status === 'under_scrutiny' && workspace.claims.some(claim => claim.application_id === app.id && claimNeedsReview(claim)));

const pendingDecisionApplication = (workspace: Workspace) => workspace.applications.find(app => app.status === 'pending_decision');

const overdueObligation = (workspace: Workspace) =>
  workspace.obligations.find(item => (item.status === 'open' || item.status === 'escalation') && overdueToday(item.due_date));

export function guideSteps(workspace: Workspace): DemoGuideStep[] {
  const correction = openDeficiency(workspace);
  const scrutiny = inspectableApplication(workspace);
  const scrutinyCount = scrutiny ? workspace.claims.filter(claim => claim.application_id === scrutiny.id && claimNeedsReview(claim)).length : 0;
  const upcomingVisit = [...workspace.visits].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)).find(item => !item.completed_at);
  const visitApp = upcomingVisit ? workspace.applications.find(item => item.id === upcomingVisit.application_id) : undefined;
  const decision = pendingDecisionApplication(workspace);
  const obligation = overdueObligation(workspace);
  const obligationApp = obligation ? workspace.applications.find(item => item.id === obligation.application_id) : undefined;

  return [
    {
      id: 'correction',
      title: titles.correction,
      role: 'institution',
      roleLabel: roleText.institution,
      route: correction ? `case/${correction.appId}` : '',
      routeLabel: routeLabelText.correction,
      armed: Boolean(correction),
      armedBecause: correction?.ref ? `${correction.ref} carries an open correction awaiting the institution.` : null,
      unmetNote: correction?.ref ? null : 'No open correction exists in the loaded workspace.'},
    {
      id: 'scrutiny',
      title: titles.scrutiny,
      role: 'scrutiny_officer',
      roleLabel: roleText.scrutiny_officer,
      route: scrutiny ? `case/${scrutiny.id}` : '',
      routeLabel: routeLabelText.scrutiny,
      armed: Boolean(scrutiny),
      armedBecause: scrutiny ? `${scrutiny.ref_no} has ${scrutinyCount} claims that need a recorded human review.` : null,
      unmetNote: scrutiny ? null : 'Every visible case at scrutiny has recorded reviews.'},
    {
      id: 'inspection',
      title: titles.inspection,
      role: 'evc_coordinator',
      roleLabel: roleText.evc_coordinator,
      route: upcomingVisit ? 'visits' : '',
      routeLabel: routeLabelText.inspection,
      armed: Boolean(upcomingVisit),
      armedBecause: upcomingVisit ? `${visitApp?.ref_no ?? 'The case'} has a scheduled expert visit awaiting panel planning.` : null,
      unmetNote: upcomingVisit ? null : 'No planned expert visit is open in the loaded workspace.'},
    {
      id: 'decision',
      title: titles.decision,
      role: 'regional_officer',
      roleLabel: roleText.regional_officer,
      route: decision ? `case/${decision.id}` : '',
      routeLabel: routeLabelText.decision,
      armed: Boolean(decision),
      armedBecause: decision ? `${decision.ref_no} waits at final decision with the human authority recorded.` : null,
      unmetNote: decision ? null : 'No case is waiting at the final decision stage.'},
    {
      id: 'obligation',
      title: titles.obligation,
      role: 'national_admin',
      roleLabel: roleText.national_admin,
      route: 'compliance',
      routeLabel: routeLabelText.obligation,
      armed: Boolean(obligation),
      armedBecause: obligation ? `${obligationApp?.ref_no ?? 'A case'} — a continuing obligation is overdue by ${Math.round((new Date().setHours(0,0,0,0) - new Date(`${obligation.due_date.slice(0,10)}T00:00:00`).getTime()) / 86400000)} day(s).` : null,
      unmetNote: obligation ? null : 'No continuing obligation is overdue in the loaded workspace.'},
    {
      id: 'audit',
      title: titles.audit,
      role: 'national_admin',
      roleLabel: roleText.national_admin,
      route: 'audit',
      routeLabel: routeLabelText.audit,
      armed: workspace.events.length > 0,
      armedBecause: workspace.events.length ? `${workspace.events.length} recorded events carry sequence and hash links.` : null,
      unmetNote: workspace.events.length ? null : 'No recorded events exist in this workspace yet.'},
  ];
}

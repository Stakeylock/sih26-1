import type { Repository, Role } from '../domain/model';
export async function repository(role: Role): Promise<Repository> {
  if (import.meta.env.VITE_APP_MODE === 'demo') return (await import('./demo')).createDemoRepository(role);
  if (import.meta.env.VITE_APP_MODE !== 'connected') throw new Error('Set VITE_APP_MODE to demo or connected.');
  return (await import('./supabase')).createSupabaseRepository();
}

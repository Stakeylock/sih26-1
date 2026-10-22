import type { Application, AuditEvent, ChecklistItem, DocumentRecord, Institution, Notification, Obligation, Template, Visit, Role } from '../domain/model';
// Matches the checked-in baseline + hardening migration. Mutations use RPC only.
type Table<T> = { Row: {[K in keyof T]: T[K]}; Insert: {[K in keyof T]?: T[K]}; Update: {[K in keyof T]?: T[K]}; Relationships: [] };
type Fn<A, R> = { Args: A; Returns: R };
export interface Database {
  public: {
    Tables: {
      applications: Table<Application>; application_events: Table<AuditEvent>; application_documents: Table<DocumentRecord>;
      checklist_items: Table<ChecklistItem>; evc_visits: Table<Visit>; institutions: Table<Institution>;
      notifications: Table<Notification>; obligations: Table<Obligation>; workflow_templates: Table<Template>;
      profiles: Table<{id: string; full_name: string; email: string}>;
      user_roles: Table<{user_id: string; role: Role; region: string | null; active: boolean}>;
    };
    Views: Record<string, never>;
    Functions: {
      fp_create_institution: Fn<{_name: string; _ref: string; _region: string; _state: string}, undefined>;
      fp_create_application: Fn<{_type: string; _title: string}, string>;
      fp_save_draft: Fn<{_id: string; _title: string; _form: Record<string, string>; _version: number}, undefined>;
      fp_transition: Fn<{_id: string; _action: string; _reason: string; _payload: Record<string, unknown>; _expected_version: number; _request_id: string}, {id: string; status: string; version: number}>;
      fp_checklist: Fn<{_id: string; _item: string; _passed: boolean; _note: string}, undefined>;
      fp_reserve_document: Fn<{_id: string; _type: string; _name: string; _mime: string; _size: number}, string>;
      fp_mark_read: Fn<{_id: string}, undefined>; fp_fulfil: Fn<{_id: string; _reason: string}, undefined>;
    };
    Enums: Record<string, never>; CompositeTypes: Record<string, never>;
  };
}

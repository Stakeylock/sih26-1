-- OQ-03: the nine self-disclosure requirements were seeded with placeholder clause
-- labels ("APH identity", "APH year", ...) that cite no handbook clause. Each value
-- below was verified against docs/reference/APH_2024-27.txt:
--   INSTITUTION_IDENTITY  AFFIDAVIT-2 preamble and declarations 1 and 3
--   ACADEMIC_YEAR         Definitions 27 ("EoA ... for that Academic Year")
--   SANCTIONED_INTAKE     2.25(b) (EoA letter carries the Approved Intake)
--   FACULTY_STRENGTH      6.14 (faculty requirements and cadre ratio)
--   STUDENT_FACULTY_RATIO 6.14 + Annexure-5 (Faculty:Student ratio table)
--   LAND_OWNERSHIP        6.17(a) (clear title or a 30-year lease)
--   BUILT_UP_AREA         6.17 (built-up norms per Annexure-3)
--   FIRE_SAFETY           6.17(i) (valid Fire Safety Certificate)
--   UNDERTAKING           ANNEXURE-10 (the applicant institute's undertaking)
--
-- Existing application_claims deliberately keep their recorded clause_snapshot:
-- a snapshot is a historical record of what the requirement said at the time.
update public.requirements
set clause = case code
  when 'INSTITUTION_IDENTITY'  then 'APH Affidavit 2'
  when 'ACADEMIC_YEAR'         then 'APH Definitions 27'
  when 'SANCTIONED_INTAKE'     then 'APH 2.25(b)'
  when 'FACULTY_STRENGTH'      then 'APH 6.14'
  when 'STUDENT_FACULTY_RATIO' then 'APH 6.14 + Annexure-5'
  when 'LAND_OWNERSHIP'        then 'APH 6.17(a)'
  when 'BUILT_UP_AREA'         then 'APH 6.17'
  when 'FIRE_SAFETY'           then 'APH 6.17(i)'
  when 'UNDERTAKING'           then 'APH Annexure-10'
  else clause
end
where app_type = 'extension_self_disclosure' and active;

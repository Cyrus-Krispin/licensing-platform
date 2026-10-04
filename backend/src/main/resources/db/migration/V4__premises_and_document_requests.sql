ALTER TABLE application_draft ADD COLUMN premises_address VARCHAR(500);
ALTER TABLE application_draft ADD COLUMN premises_name VARCHAR(200);
ALTER TABLE application_draft ADD COLUMN unit_applicable BOOLEAN;
ALTER TABLE application_draft ADD COLUMN unit_number VARCHAR(40);
ALTER TABLE application_draft ADD COLUMN tenure VARCHAR(10)
    CHECK (tenure IN ('OWNED', 'RENTED'));

CREATE TABLE document_request (
 id UUID PRIMARY KEY,
 application_id UUID NOT NULL REFERENCES application_draft(id) ON DELETE CASCADE,
 request_type VARCHAR(40) NOT NULL,
 applicability VARCHAR(20) NOT NULL,
 reason VARCHAR(300) NOT NULL,
 UNIQUE (application_id, request_type),
 CHECK (request_type IN (
   'BUSINESS_REGISTRATION', 'PREMISES_LAYOUT', 'FOOD_USE_PERMISSION',
   'LEASE_EVIDENCE', 'OWNERSHIP_EVIDENCE', 'REPRESENTATIVE_AUTHORIZATION'
 )),
 CHECK (applicability IN ('APPLICABLE', 'NOT_APPLICABLE', 'NEEDS_INPUT'))
);

-- Backfill every T05 draft without replacing an identity on later starts/toggles.
INSERT INTO document_request (id, application_id, request_type, applicability, reason)
SELECT GEN_RANDOM_UUID(), d.id, t.request_type,
       CASE
         WHEN t.request_type IN ('BUSINESS_REGISTRATION', 'PREMISES_LAYOUT', 'FOOD_USE_PERMISSION') THEN 'APPLICABLE'
         WHEN t.request_type = 'LEASE_EVIDENCE' AND d.tenure IS NULL THEN 'NEEDS_INPUT'
         WHEN t.request_type = 'LEASE_EVIDENCE' AND d.tenure = 'RENTED' THEN 'APPLICABLE'
         WHEN t.request_type = 'OWNERSHIP_EVIDENCE' AND d.tenure IS NULL THEN 'NEEDS_INPUT'
         WHEN t.request_type = 'OWNERSHIP_EVIDENCE' AND d.tenure = 'OWNED' THEN 'APPLICABLE'
         WHEN t.request_type = 'REPRESENTATIVE_AUTHORIZATION' AND d.applicant_role IS NULL THEN 'NEEDS_INPUT'
         WHEN t.request_type = 'REPRESENTATIVE_AUTHORIZATION' AND d.applicant_role = 'REPRESENTATIVE' THEN 'APPLICABLE'
         ELSE 'NOT_APPLICABLE'
       END,
       CASE t.request_type
         WHEN 'BUSINESS_REGISTRATION' THEN 'Required for every application.'
         WHEN 'PREMISES_LAYOUT' THEN 'Required for every application.'
         WHEN 'FOOD_USE_PERMISSION' THEN 'Required for every application.'
         WHEN 'LEASE_EVIDENCE' THEN CASE WHEN d.tenure IS NULL THEN 'Set the premises tenure to determine whether lease evidence is required.' WHEN d.tenure = 'RENTED' THEN 'Required because the premises are rented.' ELSE 'Not required because the premises are owned.' END
         WHEN 'OWNERSHIP_EVIDENCE' THEN CASE WHEN d.tenure IS NULL THEN 'Set the premises tenure to determine whether ownership evidence is required.' WHEN d.tenure = 'OWNED' THEN 'Required because the premises are owned.' ELSE 'Not required because the premises are rented.' END
         ELSE CASE WHEN d.applicant_role IS NULL THEN 'Set the applicant role to determine whether representative authorization is required.' WHEN d.applicant_role = 'REPRESENTATIVE' THEN 'Required because the applicant is a representative.' ELSE 'Not required because the applicant is not a representative.' END
       END
FROM application_draft d
CROSS JOIN (
 SELECT 'BUSINESS_REGISTRATION' request_type UNION ALL
 SELECT 'PREMISES_LAYOUT' UNION ALL SELECT 'FOOD_USE_PERMISSION' UNION ALL
 SELECT 'LEASE_EVIDENCE' UNION ALL SELECT 'OWNERSHIP_EVIDENCE' UNION ALL
 SELECT 'REPRESENTATIVE_AUTHORIZATION'
) t
WHERE NOT EXISTS (
 SELECT 1 FROM document_request existing
 WHERE existing.application_id = d.id AND existing.request_type = t.request_type
);

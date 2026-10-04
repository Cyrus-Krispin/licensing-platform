ALTER TABLE application_draft ADD COLUMN business_type VARCHAR(20)
    CHECK (business_type IN ('CAFE', 'RESTAURANT'));
ALTER TABLE application_draft ADD COLUMN preparation_activities VARCHAR(1000) NOT NULL DEFAULT '[]';
ALTER TABLE application_draft ADD COLUMN service_modes VARCHAR(1000) NOT NULL DEFAULT '[]';
ALTER TABLE application_draft ADD COLUMN operating_hours VARCHAR(4000) NOT NULL DEFAULT '{}';
ALTER TABLE application_draft ADD COLUMN proposed_opening_date VARCHAR(10);

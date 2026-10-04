CREATE TABLE application_draft (
 id UUID PRIMARY KEY,
 owner_username VARCHAR(100) NOT NULL REFERENCES app_user(username),
 status VARCHAR(20) NOT NULL CHECK (status = 'DRAFT'),
 revision BIGINT NOT NULL DEFAULT 0,
 legal_name VARCHAR(200), trading_name VARCHAR(200), registration_number VARCHAR(40),
 business_structure VARCHAR(30), applicant_name VARCHAR(120), applicant_role VARCHAR(30),
 applicant_email VARCHAR(254), applicant_phone VARCHAR(32),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL, updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX application_draft_owner_idx ON application_draft(owner_username, updated_at DESC);

CREATE TABLE draft_create_retry (
 owner_username VARCHAR(100) NOT NULL REFERENCES app_user(username),
 idempotency_key VARCHAR(100) NOT NULL,
 payload_hash VARCHAR(64) NOT NULL,
 application_id UUID NOT NULL REFERENCES application_draft(id),
 PRIMARY KEY (owner_username, idempotency_key)
);

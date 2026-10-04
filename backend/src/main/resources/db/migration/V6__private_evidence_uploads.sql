CREATE TABLE evidence_upload (
 id UUID PRIMARY KEY,
 application_id UUID NOT NULL REFERENCES application_draft(id),
 request_id UUID NOT NULL REFERENCES document_request(id),
 storage_key VARCHAR(100) NOT NULL UNIQUE,
 original_filename VARCHAR(255) NOT NULL,
 content_type VARCHAR(30) NOT NULL,
 byte_size BIGINT NOT NULL CHECK (byte_size BETWEEN 1 AND 10000000),
 sha256 CHAR(64) NOT NULL,
 created_by VARCHAR(100) NOT NULL REFERENCES app_user(username),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png'))
);

ALTER TABLE document_request ADD COLUMN current_upload_id UUID REFERENCES evidence_upload(id);

CREATE TABLE evidence_upload_retry (
 actor_username VARCHAR(100) NOT NULL REFERENCES app_user(username),
 application_id UUID NOT NULL REFERENCES application_draft(id),
 request_id UUID NOT NULL REFERENCES document_request(id),
 idempotency_key VARCHAR(100) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 upload_id UUID NOT NULL REFERENCES evidence_upload(id),
 resulting_revision BIGINT NOT NULL,
 PRIMARY KEY (actor_username, application_id, request_id, idempotency_key)
);
CREATE INDEX evidence_upload_application_idx ON evidence_upload(application_id);

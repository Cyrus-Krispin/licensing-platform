CREATE TABLE simulated_check (
 upload_id UUID PRIMARY KEY REFERENCES evidence_upload(id) ON DELETE CASCADE,
 state VARCHAR(12) NOT NULL CHECK (state IN ('QUEUED','CHECKING','COMPLETE','ERROR')),
 attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
 claim_id UUID,
 queued_at TIMESTAMP WITH TIME ZONE NOT NULL,
 checking_at TIMESTAMP WITH TIME ZONE,
 completed_at TIMESTAMP WITH TIME ZONE,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 CHECK ((state = 'CHECKING' AND claim_id IS NOT NULL) OR state <> 'CHECKING')
);

-- Safe adoption of every immutable upload retained from T08.
INSERT INTO simulated_check(upload_id,state,queued_at,updated_at)
SELECT id,'QUEUED',created_at,created_at FROM evidence_upload;

CREATE INDEX simulated_check_work_idx ON simulated_check(state, updated_at);

CREATE TABLE simulated_check_retry (
 actor_username VARCHAR(100) NOT NULL REFERENCES app_user(username),
 application_id UUID NOT NULL REFERENCES application_draft(id),
 upload_id UUID NOT NULL REFERENCES evidence_upload(id) ON DELETE CASCADE,
 idempotency_key VARCHAR(100) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 resulting_attempt INTEGER NOT NULL,
 PRIMARY KEY(actor_username,application_id,upload_id,idempotency_key)
);

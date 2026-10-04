-- Deleting an unpublished reissue must restore the unresolved original request.
ALTER TABLE feedback_issue ADD COLUMN predecessor_id UUID REFERENCES feedback_issue(id);

-- Evidence records are append-only. Any attempt to update or delete a row is
-- rejected at the database level so that verification evidence cannot be
-- rewritten after the fact, even by application code with a bug.
CREATE OR REPLACE FUNCTION pact_reject_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'evidence_records is append-only (attempted %)', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS evidence_records_append_only ON "evidence_records";
CREATE TRIGGER evidence_records_append_only
  BEFORE UPDATE OR DELETE ON "evidence_records"
  FOR EACH ROW EXECUTE FUNCTION pact_reject_evidence_mutation();

-- Policy decisions and payment events are also immutable once written.
DROP TRIGGER IF EXISTS policy_decisions_append_only ON "policy_decisions";
CREATE TRIGGER policy_decisions_append_only
  BEFORE UPDATE OR DELETE ON "policy_decisions"
  FOR EACH ROW EXECUTE FUNCTION pact_reject_evidence_mutation();

DROP TRIGGER IF EXISTS payment_events_append_only ON "payment_events";
CREATE TRIGGER payment_events_append_only
  BEFORE UPDATE OR DELETE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION pact_reject_evidence_mutation();

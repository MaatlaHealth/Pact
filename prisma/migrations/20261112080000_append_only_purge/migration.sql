-- Append-only records can never be updated. They can be deleted only as part of
-- an explicit purge (for example deleting a whole workspace), signalled by a
-- transaction-local setting: SET LOCAL pact.allow_purge = 'on'.
CREATE OR REPLACE FUNCTION pact_reject_evidence_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('pact.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (attempted %)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

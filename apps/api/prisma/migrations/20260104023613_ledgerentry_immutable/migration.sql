-- Make LedgerEntry append-only / immutable (block UPDATE + DELETE)

CREATE OR REPLACE FUNCTION ledgerentry_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is immutable (append-only): updates/deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledgerentry_immutable ON "LedgerEntry";

CREATE TRIGGER trg_ledgerentry_immutable
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION ledgerentry_immutable();

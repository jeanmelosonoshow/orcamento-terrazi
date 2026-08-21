BEGIN;

ALTER TABLE vendedor_orcamento
    ADD COLUMN IF NOT EXISTS id_vendedor BIGINT;

CREATE INDEX IF NOT EXISTS idx_vendedor_orcamento_vendedor
    ON vendedor_orcamento (id_vendedor, id_orcamento)
    WHERE id_vendedor IS NOT NULL;

COMMIT;

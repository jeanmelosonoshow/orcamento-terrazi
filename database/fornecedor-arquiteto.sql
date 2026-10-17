BEGIN;

ALTER TABLE arquiteto ADD COLUMN IF NOT EXISTS firebird_idfornecedor BIGINT;
ALTER TABLE arquiteto ADD COLUMN IF NOT EXISTS fornecedor_sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE arquiteto ADD COLUMN IF NOT EXISTS fornecedor_sync_erro TEXT;
ALTER TABLE arquiteto ADD COLUMN IF NOT EXISTS fornecedor_sync_atualizado_em TIMESTAMPTZ;

ALTER TABLE arquiteto DROP CONSTRAINT IF EXISTS ck_arquiteto_fornecedor_sync_status;
ALTER TABLE arquiteto ADD CONSTRAINT ck_arquiteto_fornecedor_sync_status CHECK (
    fornecedor_sync_status IN ('PENDENTE', 'PROCESSANDO', 'SINCRONIZADO', 'ERRO')
);

ALTER TABLE pagamento_orcamento_arquiteto
    ADD COLUMN IF NOT EXISTS firebird_idfornecedor BIGINT;

CREATE TABLE IF NOT EXISTS fila_sincronizacao_fornecedor_arquiteto (
    id BIGSERIAL PRIMARY KEY,
    arquiteto_id BIGINT NOT NULL REFERENCES arquiteto(id),
    nome_fornecedor VARCHAR(60) NOT NULL,
    telefone_fornecedor VARCHAR(50),
    cpf_fornecedor VARCHAR(11) NOT NULL,
    status_fila VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    firebird_idfornecedor BIGINT,
    fornecedor_criado BOOLEAN,
    tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
    proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bloqueado_ate TIMESTAMPTZ,
    erro_ultima_tentativa TEXT,
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_conclusao TIMESTAMPTZ,
    CONSTRAINT uq_fila_fornecedor_arquiteto UNIQUE (arquiteto_id),
    CONSTRAINT ck_fila_fornecedor_arquiteto_cpf CHECK (cpf_fornecedor ~ '^[0-9]{11}$'),
    CONSTRAINT ck_fila_fornecedor_arquiteto_status CHECK (
        status_fila IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO')
    )
);

CREATE INDEX IF NOT EXISTS ix_fila_fornecedor_arquiteto_pendente
    ON fila_sincronizacao_fornecedor_arquiteto (status_fila, proxima_tentativa_em)
    WHERE status_fila IN ('PENDENTE', 'ERRO');
CREATE INDEX IF NOT EXISTS ix_pagamento_arquiteto_fornecedor
    ON pagamento_orcamento_arquiteto (firebird_idfornecedor);

INSERT INTO fila_sincronizacao_fornecedor_arquiteto (
    arquiteto_id, nome_fornecedor, telefone_fornecedor, cpf_fornecedor,
    status_fila, proxima_tentativa_em
)
SELECT a.id,
       LEFT(BTRIM(a.nome), 60),
       NULLIF(LEFT(REGEXP_REPLACE(COALESCE(a.telefone, ''), '[^0-9]', '', 'g'), 50), ''),
       REGEXP_REPLACE(a.cpf, '[^0-9]', '', 'g'),
       'PENDENTE',
       CURRENT_TIMESTAMP
  FROM arquiteto a
 WHERE a.ativo = TRUE
   AND REGEXP_REPLACE(a.cpf, '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
ON CONFLICT (arquiteto_id) DO NOTHING;

COMMIT;

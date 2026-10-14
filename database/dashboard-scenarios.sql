CREATE TABLE IF NOT EXISTS crm_dashboard_cenario (
    contexto VARCHAR(40) PRIMARY KEY,
    configuracao JSONB NOT NULL DEFAULT '[]'::jsonb,
    altura_canvas INTEGER NOT NULL DEFAULT 620,
    versao BIGINT NOT NULL DEFAULT 1,
    atualizado_por VARCHAR(50),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT crm_dashboard_cenario_contexto_check
        CHECK (contexto IN ('visao-geral', 'clientes', 'funil', 'arquitetos', 'reativacao')),
    CONSTRAINT crm_dashboard_cenario_altura_check
        CHECK (altura_canvas BETWEEN 620 AND 4000)
);

CREATE TABLE IF NOT EXISTS crm_dashboard_cenario_historico (
    id BIGSERIAL PRIMARY KEY,
    contexto VARCHAR(40) NOT NULL,
    configuracao JSONB NOT NULL,
    altura_canvas INTEGER NOT NULL,
    versao BIGINT NOT NULL,
    atualizado_por VARCHAR(50),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_dashboard_cenario_historico_contexto_idx
    ON crm_dashboard_cenario_historico (contexto, versao DESC);

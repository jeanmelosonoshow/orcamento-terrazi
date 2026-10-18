BEGIN;

CREATE TABLE IF NOT EXISTS lote_pagamento_arquiteto (
    id BIGSERIAL PRIMARY KEY,
    numero_lote VARCHAR(40) NOT NULL UNIQUE,
    data_prevista_pagamento DATE NOT NULL,
    quantidade_itens INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_itens >= 0),
    valor_total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
    status_lote VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_SINCRONIZACAO',
    idfuncionario_geracao BIGINT NOT NULL,
    data_geracao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_conclusao TIMESTAMPTZ,
    CONSTRAINT ck_lote_pagamento_arquiteto_status CHECK (
        status_lote IN ('AGUARDANDO_SINCRONIZACAO', 'PROCESSANDO', 'CONCLUIDO', 'ERRO')
    )
);

CREATE TABLE IF NOT EXISTS pagamento_orcamento_arquiteto (
    id BIGSERIAL PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id),
    arquiteto_id BIGINT NOT NULL REFERENCES arquiteto(id),
    nome_arquiteto VARCHAR(180) NOT NULL,
    cpf_arquiteto VARCHAR(11) NOT NULL,
    registro_cau_arquiteto VARCHAR(30) NOT NULL,
    telefone_arquiteto VARCHAR(15),
    email_arquiteto VARCHAR(254),
    idfilial_saida VARCHAR(2) NOT NULL,
    numero_saida INTEGER NOT NULL,
    valor_venda NUMERIC(15,2) NOT NULL CHECK (valor_venda >= 0),
    percentual_comissao NUMERIC(7,4) NOT NULL CHECK (percentual_comissao BETWEEN 0 AND 100),
    valor_comissao NUMERIC(15,2) NOT NULL CHECK (valor_comissao >= 0),
    status_pagamento VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    data_prevista_pagamento DATE,
    lote_pagamento_id BIGINT REFERENCES lote_pagamento_arquiteto(id),
    idfuncionario_criacao BIGINT,
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idfuncionario_autorizacao BIGINT,
    data_autorizacao TIMESTAMPTZ,
    idfuncionario_negacao BIGINT,
    data_negacao TIMESTAMPTZ,
    motivo_negacao VARCHAR(500),
    idfuncionario_geracao BIGINT,
    data_geracao TIMESTAMPTZ,
    data_pagamento_efetuado TIMESTAMPTZ,
    firebird_idfilial VARCHAR(2),
    firebird_idfornecedor BIGINT,
    firebird_numero_pagar VARCHAR(15),
    firebird_ordem INTEGER,
    firebird_idcentrocusto INTEGER,
    firebird_status CHAR(1),
    chave_idempotencia UUID NOT NULL DEFAULT gen_random_uuid(),
    versao INTEGER NOT NULL DEFAULT 1 CHECK (versao > 0),
    data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pagamento_arquiteto_saida UNIQUE (idfilial_saida, numero_saida),
    CONSTRAINT uq_pagamento_arquiteto_idempotencia UNIQUE (chave_idempotencia),
    CONSTRAINT ck_pagamento_arquiteto_status CHECK (
        status_pagamento IN ('PENDENTE', 'AUTORIZADO', 'NEGADO', 'PAGAMENTO_GERADO', 'PAGAMENTO_EFETUADO')
    ),
    CONSTRAINT ck_pagamento_arquiteto_etapas CHECK (
        (status_pagamento = 'PENDENTE')
        OR (status_pagamento = 'AUTORIZADO' AND data_autorizacao IS NOT NULL AND idfuncionario_autorizacao IS NOT NULL)
        OR (status_pagamento = 'NEGADO' AND data_negacao IS NOT NULL AND idfuncionario_negacao IS NOT NULL)
        OR (status_pagamento = 'PAGAMENTO_GERADO' AND data_geracao IS NOT NULL AND idfuncionario_geracao IS NOT NULL AND data_prevista_pagamento IS NOT NULL AND lote_pagamento_id IS NOT NULL AND firebird_numero_pagar IS NOT NULL)
        OR (status_pagamento = 'PAGAMENTO_EFETUADO' AND data_pagamento_efetuado IS NOT NULL AND firebird_numero_pagar IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_pagamento_arquiteto_status
    ON pagamento_orcamento_arquiteto (status_pagamento, data_criacao);
CREATE INDEX IF NOT EXISTS ix_pagamento_arquiteto_arquiteto
    ON pagamento_orcamento_arquiteto (arquiteto_id, status_pagamento);
CREATE INDEX IF NOT EXISTS ix_pagamento_arquiteto_lote
    ON pagamento_orcamento_arquiteto (lote_pagamento_id);

ALTER TABLE pagamento_orcamento_arquiteto
    ADD COLUMN IF NOT EXISTS idfuncionario_negacao BIGINT,
    ADD COLUMN IF NOT EXISTS data_negacao TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motivo_negacao VARCHAR(500),
    ADD COLUMN IF NOT EXISTS firebird_idfornecedor BIGINT,
    ADD COLUMN IF NOT EXISTS firebird_ordem INTEGER,
    ADD COLUMN IF NOT EXISTS firebird_idcentrocusto INTEGER,
    ADD COLUMN IF NOT EXISTS firebird_status CHAR(1);

ALTER TABLE pagamento_orcamento_arquiteto
    ALTER COLUMN firebird_numero_pagar TYPE VARCHAR(15)
    USING CASE WHEN firebird_numero_pagar IS NULL THEN NULL ELSE firebird_numero_pagar::text END;

ALTER TABLE pagamento_orcamento_arquiteto
    DROP CONSTRAINT IF EXISTS ck_pagamento_arquiteto_status,
    ADD CONSTRAINT ck_pagamento_arquiteto_status CHECK (
        status_pagamento IN ('PENDENTE', 'AUTORIZADO', 'NEGADO', 'PAGAMENTO_GERADO', 'PAGAMENTO_EFETUADO')
    ),
    DROP CONSTRAINT IF EXISTS ck_pagamento_arquiteto_etapas,
    ADD CONSTRAINT ck_pagamento_arquiteto_etapas CHECK (
        (status_pagamento = 'PENDENTE')
        OR (status_pagamento = 'AUTORIZADO' AND data_autorizacao IS NOT NULL AND idfuncionario_autorizacao IS NOT NULL)
        OR (status_pagamento = 'NEGADO' AND data_negacao IS NOT NULL AND idfuncionario_negacao IS NOT NULL)
        OR (status_pagamento = 'PAGAMENTO_GERADO' AND data_geracao IS NOT NULL AND idfuncionario_geracao IS NOT NULL AND data_prevista_pagamento IS NOT NULL AND lote_pagamento_id IS NOT NULL AND firebird_numero_pagar IS NOT NULL)
        OR (status_pagamento = 'PAGAMENTO_EFETUADO' AND data_pagamento_efetuado IS NOT NULL AND firebird_numero_pagar IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS historico_pagamento_arquiteto (
    id BIGSERIAL PRIMARY KEY,
    pagamento_id BIGINT NOT NULL REFERENCES pagamento_orcamento_arquiteto(id),
    status_anterior VARCHAR(30),
    status_novo VARCHAR(30) NOT NULL,
    idfuncionario BIGINT,
    data_evento TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacao TEXT,
    dados_evento JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_historico_pagamento_arquiteto
    ON historico_pagamento_arquiteto (pagamento_id, data_evento, id);

CREATE TABLE IF NOT EXISTS fila_sincronizacao_pagamento_arquiteto (
    id BIGSERIAL PRIMARY KEY,
    pagamento_id BIGINT NOT NULL REFERENCES pagamento_orcamento_arquiteto(id),
    lote_pagamento_id BIGINT NOT NULL REFERENCES lote_pagamento_arquiteto(id),
    operacao VARCHAR(30) NOT NULL DEFAULT 'CRIAR_PAGAR',
    status_fila VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
    proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bloqueado_ate TIMESTAMPTZ,
    erro_ultima_tentativa TEXT,
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_conclusao TIMESTAMPTZ,
    CONSTRAINT uq_fila_pagamento_operacao UNIQUE (pagamento_id, operacao),
    CONSTRAINT ck_fila_pagamento_status CHECK (
        status_fila IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO')
    ),
    CONSTRAINT ck_fila_pagamento_operacao CHECK (operacao IN ('CRIAR_PAGAR', 'CONSULTAR_BAIXA'))
);
CREATE INDEX IF NOT EXISTS ix_fila_pagamento_pendente
    ON fila_sincronizacao_pagamento_arquiteto (status_fila, proxima_tentativa_em)
    WHERE status_fila IN ('PENDENTE', 'ERRO');

CREATE OR REPLACE FUNCTION fn_validar_transicao_pagamento_arquiteto()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status_pagamento = NEW.status_pagamento THEN
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status_pagamento = 'PENDENTE' AND NEW.status_pagamento = 'AUTORIZADO')
        OR (OLD.status_pagamento = 'PENDENTE' AND NEW.status_pagamento = 'NEGADO')
        OR (OLD.status_pagamento = 'AUTORIZADO' AND NEW.status_pagamento = 'PAGAMENTO_GERADO')
        OR (OLD.status_pagamento = 'PAGAMENTO_GERADO' AND NEW.status_pagamento = 'AUTORIZADO')
        OR (OLD.status_pagamento = 'PAGAMENTO_GERADO' AND NEW.status_pagamento = 'PAGAMENTO_EFETUADO')
    ) THEN
        RAISE EXCEPTION 'Transicao de pagamento invalida: % -> %', OLD.status_pagamento, NEW.status_pagamento;
    END IF;
    NEW.versao = OLD.versao + 1;
    NEW.data_ultima_atualizacao = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_transicao_pagamento_arquiteto ON pagamento_orcamento_arquiteto;
CREATE TRIGGER trg_validar_transicao_pagamento_arquiteto
BEFORE UPDATE OF status_pagamento ON pagamento_orcamento_arquiteto
FOR EACH ROW EXECUTE FUNCTION fn_validar_transicao_pagamento_arquiteto();

CREATE OR REPLACE FUNCTION fn_registrar_historico_pagamento_arquiteto()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_funcionario BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status_pagamento = NEW.status_pagamento THEN
        RETURN NEW;
    END IF;
    v_funcionario := CASE NEW.status_pagamento
        WHEN 'PENDENTE' THEN NEW.idfuncionario_criacao
        WHEN 'AUTORIZADO' THEN NEW.idfuncionario_autorizacao
        WHEN 'NEGADO' THEN NEW.idfuncionario_negacao
        WHEN 'PAGAMENTO_GERADO' THEN NEW.idfuncionario_geracao
        ELSE NULL
    END;
    INSERT INTO historico_pagamento_arquiteto (
        pagamento_id, status_anterior, status_novo, idfuncionario, dados_evento
    ) VALUES (
        NEW.id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.status_pagamento ELSE NULL END,
        NEW.status_pagamento,
        v_funcionario,
        jsonb_build_object(
            'versao', NEW.versao,
            'lotePagamentoId', NEW.lote_pagamento_id,
            'dataPrevistaPagamento', NEW.data_prevista_pagamento,
            'firebirdNumeroPagar', NEW.firebird_numero_pagar
        )
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_historico_pagamento_arquiteto ON pagamento_orcamento_arquiteto;
CREATE TRIGGER trg_registrar_historico_pagamento_arquiteto
AFTER INSERT OR UPDATE OF status_pagamento ON pagamento_orcamento_arquiteto
FOR EACH ROW EXECUTE FUNCTION fn_registrar_historico_pagamento_arquiteto();

COMMIT;

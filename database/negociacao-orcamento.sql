BEGIN;

-- O status do orcamento usa valores canonicos em caixa alta.
UPDATE orcamentos
   SET status = CASE UPPER(BTRIM(COALESCE(status, 'PENDENTE')))
       WHEN 'VENDIDO' THEN 'GEROU VENDA'
       WHEN 'FECHADO' THEN 'GEROU VENDA'
       WHEN 'RECUSADO' THEN 'CANCELADO'
       WHEN 'EXPIRADO' THEN 'EXPIRADO'
       WHEN 'GEROU VENDA' THEN 'GEROU VENDA'
       WHEN 'CANCELADO' THEN 'CANCELADO'
       ELSE 'PENDENTE'
   END;

UPDATE orcamentos
   SET status = 'EXPIRADO'
 WHERE status = 'PENDENTE'
   AND data_validade < CURRENT_DATE;

ALTER TABLE orcamentos ALTER COLUMN status SET DEFAULT 'PENDENTE';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_orcamentos_status'
    ) THEN
        ALTER TABLE orcamentos
            ADD CONSTRAINT ck_orcamentos_status CHECK (
                status IN ('PENDENTE', 'EXPIRADO', 'GEROU VENDA', 'CANCELADO')
            );
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS status_negociacao (
    id BIGSERIAL PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    status_negociacao VARCHAR(30) NOT NULL,
    valor_anterior NUMERIC(12, 2),
    valor_atual NUMERIC(12, 2),
    motivo_recusa VARCHAR(50),
    motivo_recusa_descricao VARCHAR(120),
    observacao TEXT,
    idfuncionario BIGINT,
    idvendedor BIGINT,
    origem VARCHAR(30) NOT NULL DEFAULT 'SISTEMA',
    data_status TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vigente BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_status_negociacao_status CHECK (
        status_negociacao IN (
            'ORCAMENTO CRIADO', 'ENVIADO AO CLIENTE', 'EM NEGOCIACAO',
            'EXPIRADO', 'GEROU VENDA', 'RECUSADO'
        )
    ),
    CONSTRAINT ck_status_negociacao_valores CHECK (
        valor_anterior IS NULL OR valor_anterior >= 0
    ),
    CONSTRAINT ck_status_negociacao_valor_atual CHECK (
        valor_atual IS NULL OR valor_atual >= 0
    )
);

ALTER TABLE status_negociacao ADD COLUMN IF NOT EXISTS motivo_recusa VARCHAR(50);
ALTER TABLE status_negociacao ADD COLUMN IF NOT EXISTS motivo_recusa_descricao VARCHAR(120);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_status_negociacao_motivo_recusa'
    ) THEN
        ALTER TABLE status_negociacao
            ADD CONSTRAINT ck_status_negociacao_motivo_recusa CHECK (
                status_negociacao <> 'RECUSADO'
                OR motivo_recusa IS NOT NULL
                OR origem = 'MIGRACAO'
            );
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_negociacao_vigente
    ON status_negociacao (orcamento_id)
    WHERE vigente;
CREATE INDEX IF NOT EXISTS idx_status_negociacao_orcamento_data
    ON status_negociacao (orcamento_id, data_status DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_status_negociacao_status_data
    ON status_negociacao (status_negociacao, data_status DESC);
CREATE INDEX IF NOT EXISTS idx_status_negociacao_funcionario
    ON status_negociacao (idfuncionario, data_status DESC)
    WHERE idfuncionario IS NOT NULL;

CREATE TABLE IF NOT EXISTS controle_contato_orcamento (
    orcamento_id INTEGER PRIMARY KEY REFERENCES orcamentos(id) ON DELETE CASCADE,
    status_contato VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    tipo_contato VARCHAR(30),
    observacao TEXT,
    data_primeiro_contato TIMESTAMPTZ,
    data_ultimo_contato TIMESTAMPTZ,
    data_finalizacao TIMESTAMPTZ,
    idfuncionario BIGINT NOT NULL,
    idvendedor BIGINT,
    qtde_contato INTEGER NOT NULL DEFAULT 1,
    data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_contato_orcamento_status CHECK (
        status_contato IN ('PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO')
    ),
    CONSTRAINT ck_contato_orcamento_tipo CHECK (
        tipo_contato IS NULL OR tipo_contato IN ('WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM')
    ),
    CONSTRAINT ck_contato_orcamento_quantidade CHECK (qtde_contato >= 1)
);

CREATE INDEX IF NOT EXISTS idx_contato_orcamento_status
    ON controle_contato_orcamento (status_contato, data_ultima_atualizacao DESC);
CREATE INDEX IF NOT EXISTS idx_contato_orcamento_tipo
    ON controle_contato_orcamento (tipo_contato, data_ultima_atualizacao DESC);
CREATE INDEX IF NOT EXISTS idx_contato_orcamento_funcionario
    ON controle_contato_orcamento (idfuncionario, data_ultima_atualizacao DESC);

-- Registra a etapa inicial dos orcamentos que ja existiam antes desta migracao.
INSERT INTO status_negociacao (
    orcamento_id, status_negociacao, valor_atual, origem, data_status, vigente
)
SELECT o.id, 'ORCAMENTO CRIADO', o.valor_total, 'MIGRACAO', o.data_criacao,
       o.status = 'PENDENTE'
  FROM orcamentos o
 WHERE NOT EXISTS (
       SELECT 1 FROM status_negociacao n WHERE n.orcamento_id = o.id
 );

-- Preserva tambem o desfecho atual dos registros antigos.
UPDATE status_negociacao n
   SET vigente = FALSE
  FROM orcamentos o
 WHERE n.orcamento_id = o.id
   AND n.vigente
   AND o.status IN ('EXPIRADO', 'GEROU VENDA', 'CANCELADO');

INSERT INTO status_negociacao (
    orcamento_id, status_negociacao, valor_atual, origem, data_status, vigente
)
SELECT o.id,
       CASE o.status
           WHEN 'EXPIRADO' THEN 'EXPIRADO'
           WHEN 'GEROU VENDA' THEN 'GEROU VENDA'
           WHEN 'CANCELADO' THEN 'RECUSADO'
       END,
       o.valor_total,
       'MIGRACAO',
       CURRENT_TIMESTAMP,
       FALSE
  FROM orcamentos o
 WHERE o.status IN ('EXPIRADO', 'GEROU VENDA', 'CANCELADO')
   AND NOT EXISTS (
       SELECT 1
         FROM status_negociacao n
        WHERE n.orcamento_id = o.id
          AND n.status_negociacao = CASE o.status
              WHEN 'EXPIRADO' THEN 'EXPIRADO'
              WHEN 'GEROU VENDA' THEN 'GEROU VENDA'
              WHEN 'CANCELADO' THEN 'RECUSADO'
          END
   );

WITH ultimos_desfechos AS (
    SELECT DISTINCT ON (n.orcamento_id) n.id
      FROM status_negociacao n
      JOIN orcamentos o ON o.id = n.orcamento_id
     WHERE o.status IN ('EXPIRADO', 'GEROU VENDA', 'CANCELADO')
       AND n.status_negociacao = CASE o.status
           WHEN 'EXPIRADO' THEN 'EXPIRADO'
           WHEN 'GEROU VENDA' THEN 'GEROU VENDA'
           WHEN 'CANCELADO' THEN 'RECUSADO'
       END
     ORDER BY n.orcamento_id, n.data_status DESC, n.id DESC
)
UPDATE status_negociacao n
   SET vigente = TRUE
  FROM ultimos_desfechos u
 WHERE n.id = u.id;

CREATE OR REPLACE FUNCTION fn_contexto_bigint(p_nome TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_valor TEXT;
BEGIN
    v_valor := NULLIF(current_setting(p_nome, TRUE), '');
    IF v_valor IS NULL OR v_valor !~ '^[0-9]+$' THEN
        RETURN NULL;
    END IF;
    RETURN v_valor::BIGINT;
END;
$$;

CREATE OR REPLACE FUNCTION fn_status_negociacao_preparar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_valor_atual NUMERIC(12, 2);
BEGIN
    NEW.status_negociacao := UPPER(BTRIM(NEW.status_negociacao));
    NEW.origem := UPPER(BTRIM(COALESCE(NULLIF(NEW.origem, ''), 'SISTEMA')));
    NEW.motivo_recusa := NULLIF(UPPER(BTRIM(COALESCE(NEW.motivo_recusa, ''))), '');
    NEW.motivo_recusa_descricao := NULLIF(BTRIM(COALESCE(NEW.motivo_recusa_descricao, '')), '');
    NEW.observacao := NULLIF(BTRIM(COALESCE(NEW.observacao, '')), '');
    NEW.data_status := COALESCE(NEW.data_status, CURRENT_TIMESTAMP);

    SELECT valor_total INTO v_valor_atual
      FROM orcamentos
     WHERE id = NEW.orcamento_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orcamento % nao encontrado.', NEW.orcamento_id USING ERRCODE = '23503';
    END IF;

    NEW.valor_atual := COALESCE(NEW.valor_atual, v_valor_atual);
    NEW.idfuncionario := COALESCE(NEW.idfuncionario, fn_contexto_bigint('app.idfuncionario'));
    NEW.idvendedor := COALESCE(NEW.idvendedor, fn_contexto_bigint('app.idvendedor'));

    IF NEW.status_negociacao <> 'RECUSADO' THEN
        NEW.motivo_recusa := NULL;
        NEW.motivo_recusa_descricao := NULL;
    END IF;

    IF NEW.vigente THEN
        UPDATE status_negociacao
           SET vigente = FALSE
         WHERE orcamento_id = NEW.orcamento_id
           AND vigente
           AND id IS DISTINCT FROM NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_status_negociacao_preparar ON status_negociacao;
CREATE TRIGGER trg_status_negociacao_preparar
BEFORE INSERT ON status_negociacao
FOR EACH ROW
EXECUTE FUNCTION fn_status_negociacao_preparar();

CREATE OR REPLACE FUNCTION fn_status_negociacao_sincronizar_orcamento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status_orcamento VARCHAR(50);
BEGIN
    IF NOT NEW.vigente THEN
        RETURN NEW;
    END IF;

    v_status_orcamento := CASE NEW.status_negociacao
        WHEN 'EXPIRADO' THEN 'EXPIRADO'
        WHEN 'GEROU VENDA' THEN 'GEROU VENDA'
        WHEN 'RECUSADO' THEN 'CANCELADO'
        ELSE 'PENDENTE'
    END;

    UPDATE orcamentos
       SET status = v_status_orcamento
     WHERE id = NEW.orcamento_id
       AND status IS DISTINCT FROM v_status_orcamento;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_status_negociacao_sincronizar ON status_negociacao;
CREATE TRIGGER trg_status_negociacao_sincronizar
AFTER INSERT ON status_negociacao
FOR EACH ROW
EXECUTE FUNCTION fn_status_negociacao_sincronizar_orcamento();

CREATE OR REPLACE FUNCTION fn_orcamento_registrar_negociacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status_negociacao VARCHAR(30);
    v_status_atual VARCHAR(30);
    v_origem VARCHAR(30);
BEGIN
    v_origem := COALESCE(NULLIF(UPPER(current_setting('app.origem', TRUE)), ''), 'SISTEMA');

    IF TG_OP = 'INSERT' THEN
        INSERT INTO status_negociacao (
            orcamento_id, status_negociacao, valor_atual, idfuncionario, idvendedor, origem
        ) VALUES (
            NEW.id, 'ORCAMENTO CRIADO', NEW.valor_total,
            fn_contexto_bigint('app.idfuncionario'), fn_contexto_bigint('app.idvendedor'), v_origem
        );
        RETURN NEW;
    END IF;

    SELECT status_negociacao
      INTO v_status_atual
      FROM status_negociacao
     WHERE orcamento_id = NEW.id AND vigente
     ORDER BY data_status DESC, id DESC
     LIMIT 1;

    IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
        v_status_negociacao := 'EM NEGOCIACAO';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        v_status_negociacao := CASE NEW.status
            WHEN 'EXPIRADO' THEN 'EXPIRADO'
            WHEN 'GEROU VENDA' THEN 'GEROU VENDA'
            WHEN 'CANCELADO' THEN 'RECUSADO'
            ELSE NULL
        END;
    END IF;

    IF v_status_negociacao IS NOT NULL
       AND (
           v_status_atual IS DISTINCT FROM v_status_negociacao
           OR NEW.valor_total IS DISTINCT FROM OLD.valor_total
       ) THEN
        INSERT INTO status_negociacao (
            orcamento_id, status_negociacao, valor_anterior, valor_atual,
            idfuncionario, idvendedor, origem
        ) VALUES (
            NEW.id, v_status_negociacao,
            CASE WHEN NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN OLD.valor_total END,
            NEW.valor_total,
            fn_contexto_bigint('app.idfuncionario'), fn_contexto_bigint('app.idvendedor'), v_origem
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_registrar_negociacao ON orcamentos;
CREATE TRIGGER trg_orcamento_registrar_negociacao
AFTER INSERT OR UPDATE OF status, valor_total ON orcamentos
FOR EACH ROW
EXECUTE FUNCTION fn_orcamento_registrar_negociacao();

CREATE OR REPLACE FUNCTION fn_expirar_orcamentos()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_atualizados INTEGER;
BEGIN
    PERFORM set_config('app.origem', 'EXPIRACAO AUTOMATICA', TRUE);
    UPDATE orcamentos
       SET status = 'EXPIRADO'
     WHERE status = 'PENDENTE'
       AND data_validade < CURRENT_DATE;
    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
    RETURN v_atualizados;
END;
$$;

CREATE OR REPLACE FUNCTION fn_contato_orcamento_validar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.status_contato := UPPER(BTRIM(NEW.status_contato));
    NEW.tipo_contato := NULLIF(UPPER(BTRIM(COALESCE(NEW.tipo_contato, ''))), '');
    NEW.observacao := NULLIF(BTRIM(COALESCE(NEW.observacao, '')), '');
    NEW.data_ultima_atualizacao := CURRENT_TIMESTAMP;
    NEW.qtde_contato := GREATEST(COALESCE(NEW.qtde_contato, 1), 1);

    IF TG_OP = 'UPDATE' AND OLD.status_contato = 'FINALIZADO' THEN
        RAISE EXCEPTION 'Contato do orcamento finalizado nao pode ser alterado.' USING ERRCODE = '23514';
    END IF;

    NEW.data_primeiro_contato := COALESCE(NEW.data_primeiro_contato, CURRENT_TIMESTAMP);
    IF NEW.status_contato IN ('PENDENTE', 'AGUARDANDO RETORNO') THEN
        NEW.data_ultimo_contato := CURRENT_TIMESTAMP;
        NEW.data_finalizacao := NULL;
    ELSE
        NEW.data_ultimo_contato := COALESCE(NEW.data_ultimo_contato, CURRENT_TIMESTAMP);
        NEW.data_finalizacao := COALESCE(NEW.data_finalizacao, CURRENT_TIMESTAMP);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contato_orcamento_validar ON controle_contato_orcamento;
CREATE TRIGGER trg_contato_orcamento_validar
BEFORE INSERT OR UPDATE ON controle_contato_orcamento
FOR EACH ROW
EXECUTE FUNCTION fn_contato_orcamento_validar();

COMMIT;

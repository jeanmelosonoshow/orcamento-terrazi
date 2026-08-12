BEGIN;

CREATE TABLE IF NOT EXISTS controle_contato (
    doctocliente VARCHAR(40) PRIMARY KEY,
    nome_cliente VARCHAR(180) NOT NULL,
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
    CONSTRAINT ck_controle_contato_status CHECK (
        status_contato IN ('PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO')
    ),
    CONSTRAINT ck_controle_contato_tipo CHECK (
        tipo_contato IS NULL OR tipo_contato IN ('WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM')
    ),
    CONSTRAINT ck_controle_contato_quantidade CHECK (qtde_contato >= 1)
);

CREATE INDEX IF NOT EXISTS idx_controle_contato_status
    ON controle_contato (status_contato);
CREATE INDEX IF NOT EXISTS idx_controle_contato_tipo
    ON controle_contato (tipo_contato);
CREATE INDEX IF NOT EXISTS idx_controle_contato_atualizacao
    ON controle_contato (data_ultima_atualizacao DESC);
CREATE INDEX IF NOT EXISTS idx_controle_contato_funcionario
    ON controle_contato (idfuncionario, data_ultima_atualizacao DESC);
CREATE INDEX IF NOT EXISTS idx_controle_contato_vendedor
    ON controle_contato (idvendedor, data_ultima_atualizacao DESC)
    WHERE idvendedor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_controle_contato_finalizado_reabertura
    ON controle_contato (data_finalizacao)
    WHERE status_contato = 'FINALIZADO';

CREATE TABLE IF NOT EXISTS controle_contato_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    media_recompra_dias INTEGER NOT NULL DEFAULT 90 CHECK (media_recompra_dias > 0),
    data_ultima_tentativa_recompra TIMESTAMPTZ,
    data_ultima_execucao_reabertura TIMESTAMPTZ,
    erro_ultima_sincronizacao TEXT,
    data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE controle_contato_config
    ADD COLUMN IF NOT EXISTS data_ultima_tentativa_recompra TIMESTAMPTZ;
ALTER TABLE controle_contato_config
    ADD COLUMN IF NOT EXISTS data_ultima_execucao_reabertura TIMESTAMPTZ;
ALTER TABLE controle_contato_config
    ADD COLUMN IF NOT EXISTS erro_ultima_sincronizacao TEXT;

INSERT INTO controle_contato_config (id, media_recompra_dias)
VALUES (1, 90)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_controle_contato_validar_gravacao()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.doctocliente := BTRIM(NEW.doctocliente);
    NEW.nome_cliente := BTRIM(NEW.nome_cliente);
    NEW.status_contato := UPPER(BTRIM(NEW.status_contato));
    NEW.tipo_contato := NULLIF(UPPER(BTRIM(COALESCE(NEW.tipo_contato, ''))), '');
    NEW.data_ultima_atualizacao := CURRENT_TIMESTAMP;

    IF TG_OP = 'UPDATE'
       AND OLD.status_contato = 'FINALIZADO'
       AND NOT (
           NEW.status_contato = 'PENDENTE'
           AND COALESCE(NEW.qtde_contato, 0) = COALESCE(OLD.qtde_contato, 0) + 1
           AND NEW.data_finalizacao IS NULL
       ) THEN
        RAISE EXCEPTION 'Contato finalizado nao pode ser alterado.' USING ERRCODE = '23514';
    END IF;

    IF NEW.data_primeiro_contato IS NULL THEN
        NEW.data_primeiro_contato := CURRENT_TIMESTAMP;
    END IF;

    IF NEW.status_contato IN ('PENDENTE', 'AGUARDANDO RETORNO') THEN
        NEW.data_ultimo_contato := CURRENT_TIMESTAMP;
        NEW.data_finalizacao := NULL;
    ELSIF NEW.status_contato = 'FINALIZADO' THEN
        NEW.data_finalizacao := COALESCE(NEW.data_finalizacao, CURRENT_TIMESTAMP);
        NEW.data_ultimo_contato := COALESCE(NEW.data_ultimo_contato, CURRENT_TIMESTAMP);
    END IF;

    NEW.qtde_contato := GREATEST(COALESCE(NEW.qtde_contato, 1), 1);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_controle_contato_validar_gravacao ON controle_contato;
CREATE TRIGGER trg_controle_contato_validar_gravacao
BEFORE INSERT OR UPDATE ON controle_contato
FOR EACH ROW
EXECUTE FUNCTION fn_controle_contato_validar_gravacao();

CREATE OR REPLACE FUNCTION fn_reabrir_contatos_por_recompra(p_media_recompra_dias INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_dias INTEGER;
    v_atualizados INTEGER;
BEGIN
    SELECT COALESCE(p_media_recompra_dias, media_recompra_dias)
      INTO v_dias
      FROM controle_contato_config
     WHERE id = 1;

    IF COALESCE(v_dias, 0) <= 0 THEN
        RAISE EXCEPTION 'Media de recompra invalida.';
    END IF;

    UPDATE controle_contato
       SET status_contato = 'PENDENTE',
           data_finalizacao = NULL,
           data_ultimo_contato = CURRENT_TIMESTAMP,
           qtde_contato = qtde_contato + 1,
           data_ultima_atualizacao = CURRENT_TIMESTAMP
     WHERE status_contato = 'FINALIZADO'
       AND data_finalizacao < CURRENT_TIMESTAMP - make_interval(days => v_dias);

    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
    RETURN v_atualizados;
END;
$$;

CREATE OR REPLACE FUNCTION fn_reservar_manutencao_contatos()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_reservada BOOLEAN := FALSE;
BEGIN
    UPDATE controle_contato_config
       SET data_ultima_tentativa_recompra = CURRENT_TIMESTAMP,
           data_ultima_atualizacao = CURRENT_TIMESTAMP
     WHERE id = 1
       AND (
           data_ultima_execucao_reabertura IS NULL
           OR (data_ultima_execucao_reabertura AT TIME ZONE 'America/Sao_Paulo')::DATE
              < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE
       )
       AND (
           data_ultima_tentativa_recompra IS NULL
           OR data_ultima_tentativa_recompra < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
       )
    RETURNING TRUE INTO v_reservada;

    RETURN COALESCE(v_reservada, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION fn_registrar_falha_manutencao_contatos(p_erro TEXT)
RETURNS VOID
LANGUAGE SQL
AS $$
    UPDATE controle_contato_config
       SET erro_ultima_sincronizacao = LEFT(COALESCE(p_erro, 'Falha nao informada.'), 1000),
           data_ultima_atualizacao = CURRENT_TIMESTAMP
     WHERE id = 1;
$$;

DROP FUNCTION IF EXISTS fn_executar_manutencao_contatos();
CREATE OR REPLACE FUNCTION fn_executar_manutencao_contatos(p_media_recompra_dias INTEGER DEFAULT NULL)
RETURNS TABLE (executada BOOLEAN, contatos_reabertos INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_dias INTEGER;
    v_atualizados INTEGER := 0;
BEGIN
    IF p_media_recompra_dias IS NOT NULL AND p_media_recompra_dias <= 0 THEN
        RAISE EXCEPTION 'Media de recompra invalida.';
    END IF;

    UPDATE controle_contato_config
       SET media_recompra_dias = COALESCE(p_media_recompra_dias, media_recompra_dias),
           data_ultima_execucao_reabertura = CURRENT_TIMESTAMP,
           erro_ultima_sincronizacao = NULL,
           data_ultima_atualizacao = CURRENT_TIMESTAMP
     WHERE id = 1
       AND (
           data_ultima_execucao_reabertura IS NULL
           OR (data_ultima_execucao_reabertura AT TIME ZONE 'America/Sao_Paulo')::DATE
              < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE
       )
    RETURNING media_recompra_dias INTO v_dias;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0;
        RETURN;
    END IF;

    v_atualizados := fn_reabrir_contatos_por_recompra(v_dias);
    RETURN QUERY SELECT TRUE, v_atualizados;
END;
$$;

COMMIT;

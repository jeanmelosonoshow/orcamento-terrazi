BEGIN;

CREATE TABLE IF NOT EXISTS arquiteto (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(180) NOT NULL,
    cpf VARCHAR(11) NOT NULL,
    registro_cau VARCHAR(30) NOT NULL,
    telefone VARCHAR(15) NOT NULL,
    telefone_alternativo VARCHAR(15),
    email VARCHAR(254) NOT NULL,
    data_cadastro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idfilial_cadastro VARCHAR(2) NOT NULL,
    idfuncionario_cadastro INTEGER NOT NULL,
    data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_arquiteto_cpf CHECK (cpf ~ '^[0-9]{11}$'),
    CONSTRAINT ck_arquiteto_telefone CHECK (telefone ~ '^[0-9]{10,11}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_arquiteto_cpf ON arquiteto (cpf);
CREATE UNIQUE INDEX IF NOT EXISTS ux_arquiteto_cau ON arquiteto (UPPER(registro_cau));
CREATE INDEX IF NOT EXISTS ix_arquiteto_nome ON arquiteto (UPPER(nome));
CREATE INDEX IF NOT EXISTS ix_arquiteto_filial_ativo ON arquiteto (idfilial_cadastro, ativo);

CREATE TABLE IF NOT EXISTS arquiteto_orcamento (
    id BIGSERIAL PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    arquiteto_id BIGINT NOT NULL REFERENCES arquiteto(id),
    nome_arquiteto VARCHAR(180) NOT NULL,
    cpf_arquiteto VARCHAR(11) NOT NULL,
    registro_cau_arquiteto VARCHAR(30) NOT NULL,
    telefone_arquiteto VARCHAR(15),
    email_arquiteto VARCHAR(254),
    idfuncionario_vinculo INTEGER NOT NULL,
    idfilial_vinculo VARCHAR(2) NOT NULL,
    data_vinculo TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_arquiteto_orcamento UNIQUE (orcamento_id)
);

CREATE INDEX IF NOT EXISTS ix_arquiteto_orcamento_arquiteto ON arquiteto_orcamento (arquiteto_id);
CREATE INDEX IF NOT EXISTS ix_arquiteto_orcamento_data ON arquiteto_orcamento (data_vinculo DESC);

CREATE OR REPLACE FUNCTION fn_proteger_arquiteto_orcamento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'O vinculo do arquiteto com o orcamento nao pode ser removido.';
    END IF;
    IF COALESCE(current_setting('app.permitir_troca_arquiteto', TRUE), '') <> 'true' THEN
        RAISE EXCEPTION 'O vinculo do arquiteto com o orcamento somente pode ser alterado por usuario autorizado.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_arquiteto_orcamento ON arquiteto_orcamento;
CREATE TRIGGER trg_proteger_arquiteto_orcamento
BEFORE UPDATE OR DELETE ON arquiteto_orcamento
FOR EACH ROW EXECUTE FUNCTION fn_proteger_arquiteto_orcamento();

COMMIT;

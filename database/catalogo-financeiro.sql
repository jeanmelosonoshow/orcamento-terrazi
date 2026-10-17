BEGIN;

CREATE TABLE IF NOT EXISTS catalogo_operacao_financeira (
    operacao VARCHAR(80) PRIMARY KEY,
    definicao JSONB NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    versao INTEGER NOT NULL DEFAULT 1 CHECK (versao > 0),
    idfuncionario_criacao INTEGER,
    idfuncionario_ultima_atualizacao INTEGER,
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_catalogo_operacao_nome CHECK (operacao ~ '^[A-Z][A-Z0-9_]{2,79}$'),
    CONSTRAINT ck_catalogo_operacao_definicao CHECK (jsonb_typeof(definicao) = 'object')
);

CREATE TABLE IF NOT EXISTS versao_catalogo_financeiro (
    id BIGSERIAL PRIMARY KEY,
    versao BIGINT NOT NULL UNIQUE CHECK (versao > 0),
    manifesto JSONB NOT NULL,
    hash_sha256 CHAR(64) NOT NULL,
    assinatura_base64 TEXT NOT NULL,
    idfuncionario_publicacao INTEGER NOT NULL,
    data_publicacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_versao_catalogo_manifesto CHECK (jsonb_typeof(manifesto) = 'object'),
    CONSTRAINT ck_versao_catalogo_hash CHECK (hash_sha256 ~ '^[0-9a-f]{64}$')
);

INSERT INTO catalogo_operacao_financeira (operacao, definicao, ativo)
VALUES (
    'ENSURE_ARCHITECT_SUPPLIER',
    '{
      "kind": "ensure",
      "table": "FORNECEDOR",
      "identity": {"column": "IDFORNECEDOR", "strategy": "max_plus_one"},
      "idempotency": {"template": "FORNECEDOR:CPF:{cpf}"},
      "match": [
        {"column": "CGC", "source": "cpf", "type": "cpf", "variants": ["digits", "cpf_formatted"]}
      ],
      "fields": [
        {"column": "NOMEFORNECEDOR", "source": "name", "type": "text", "maxLength": 60, "required": true},
        {"column": "NOMEFANTASIA", "source": "name", "type": "text", "maxLength": 60, "required": true},
        {"column": "TELEFONES", "source": "phone", "type": "digits", "maxLength": 50, "required": false},
        {"column": "CGC", "source": "cpf", "type": "cpf", "required": true},
        {"column": "ATIVO", "constant": "T", "type": "text", "maxLength": 1}
      ],
      "result": {"idColumn": "IDFORNECEDOR"}
    }'::jsonb,
    TRUE
)
ON CONFLICT (operacao) DO NOTHING;

COMMIT;

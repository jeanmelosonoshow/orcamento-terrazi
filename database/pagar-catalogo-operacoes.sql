BEGIN;

INSERT INTO catalogo_operacao_financeira (operacao, definicao, ativo)
VALUES
('LOOKUP_BRANCH_COST_CENTER', $json$
{
  "kind": "lookup",
  "table": "FILIAL",
  "idempotency": {"template": "FILIAL:CENTROCUSTO:{idfilial}"},
  "match": [{"column": "IDFILIAL", "source": "idfilial", "type": "text", "maxLength": 2}],
  "result": {"idColumn": "IDCENTROCUSTO"}
}
$json$::jsonb, TRUE),
('CREATE_ARCHITECT_PAYABLE', $json$
{
  "kind": "ensure",
  "table": "PAGAR",
  "identity": {"column": "ORDEM", "strategy": "generator", "generator": "GEN_CD_PAGAR_ORDEM"},
  "idempotency": {"template": "PAGAR:ARQUITETO:{numeroDuplicata}"},
  "match": [
    {"column": "IDFILIAL", "constant": "CD", "type": "text", "maxLength": 2},
    {"column": "NUMERODUPLICATA", "source": "numeroDuplicata", "type": "text", "maxLength": 15}
  ],
  "fields": [
    {"column": "IDFILIAL", "constant": "CD", "type": "text", "maxLength": 2},
    {"column": "NUMERODUPLICATA", "source": "numeroDuplicata", "type": "text", "maxLength": 15},
    {"column": "DATAEMISSAO", "source": "dataInsercao", "type": "text", "maxLength": 19},
    {"column": "IDPORTADOR", "constant": 20, "type": "integer"},
    {"column": "IDFORNECEDOR", "source": "fornecedorId", "type": "integer"},
    {"column": "VALORDUPLICATA", "source": "valorComissao", "type": "decimal"},
    {"column": "DATEENTRADA", "source": "dataInsercao", "type": "text", "maxLength": 19},
    {"column": "VENCIMENTO", "source": "dataVencimento", "type": "date"},
    {"column": "NUMERONOTA", "source": "numeroSaida", "type": "integer"},
    {"column": "TIPO", "constant": "DP", "type": "text", "maxLength": 2},
    {"column": "STATUS", "constant": "0", "type": "text", "maxLength": 1},
    {"column": "TN", "constant": "F", "type": "text", "maxLength": 1},
    {"column": "OBSERVACAO", "source": "observacao", "type": "text", "maxLength": 500},
    {"column": "CONTROLECREDITO", "constant": "F", "type": "text", "maxLength": 1},
    {"column": "FATU", "constant": "CDT", "type": "text", "maxLength": 3},
    {"column": "ATU", "constant": "T", "type": "text", "maxLength": 1},
    {"column": "ESTIMATIVO", "constant": "F", "type": "text", "maxLength": 1},
    {"column": "GRUPO", "constant": "1", "type": "text", "maxLength": 1},
    {"column": "IDCENTROCUSTO", "source": "centroCustoId", "type": "integer"},
    {"column": "CONFERIDO", "constant": "T", "type": "text", "maxLength": 1},
    {"column": "IDFONTE", "constant": 390, "type": "integer"},
    {"column": "IDCONTA", "constant": "1.01.00.37", "type": "text", "maxLength": 10},
    {"column": "GERADOPORENTRADA", "constant": "F", "type": "text", "maxLength": 1},
    {"column": "IDFUNCIONARIO", "source": "idfuncionario", "type": "integer"},
    {"column": "INTBAN_STATUS", "constant": "N", "type": "text", "maxLength": 1},
    {"column": "MOVIMENTOWEB", "constant": "F", "type": "text", "maxLength": 1},
    {"column": "CONFERIDONF", "constant": "F", "type": "text", "maxLength": 1}
  ],
  "result": {"idColumn": "ORDEM"}
}
$json$::jsonb, TRUE)
ON CONFLICT (operacao) DO UPDATE SET
    definicao = EXCLUDED.definicao,
    ativo = EXCLUDED.ativo,
    versao = catalogo_operacao_financeira.versao + 1,
    data_ultima_atualizacao = CURRENT_TIMESTAMP;

COMMIT;

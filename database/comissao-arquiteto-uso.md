# Comissao de arquitetos

## Instalacao no PostgreSQL de homologacao

1. Execute novamente `database/arquitetos.sql` para adicionar o percentual de comissao.
2. Execute `database/comissao-arquiteto.sql` para criar pagamentos, lotes, historico e fila de sincronizacao.
3. Confirme as tabelas com `to_regclass` antes de publicar a interface operacional.

## Permissao

Os funcionarios autorizados ficam em `api/crm-permissions.json`, no campo
`architectCommissionManagerFuncionarioIds`. A permissao e assinada na sessao; portanto o usuario
deve sair e entrar novamente depois de qualquer alteracao nessa lista.

Somente esses usuarios recebem `percentualComissao` nas respostas da API e podem enviar esse campo
em inclusoes ou alteracoes. Para os demais usuarios, o percentual nao e enviado ao navegador.

## Regras consolidadas

- O percentual pertence ao cadastro do arquiteto.
- A base de calculo e o `Valor Venda`.
- Cada venda e identificada por filial e numero da saida e pode gerar somente uma comissao.
- A comissao somente pode nascer para venda cuja entrega esteja concluida.
- O valor e a fotografia dos dados do arquiteto ficam congelados no pagamento.
- As transicoes permitidas sao `PENDENTE`, `AUTORIZADO`, `PAGAMENTO_GERADO` e `PAGAMENTO_EFETUADO`.
- Um lote usa uma unica data prevista de pagamento.
- `PAGAMENTO_GERADO` somente pode ser gravado depois que o titulo existir no Firebird.
- A fila usa chave de idempotencia para impedir titulo duplicado.

## Integracao Firebird pendente

O Gateway atual aceita apenas consultas de leitura. A criacao na tabela `PAGAR` exigira uma rota
financeira separada e restrita, com operacao e campos permitidos. Nao deve ser habilitado `INSERT`
generico na rota de BI.

Antes dessa etapa, documente os campos obrigatorios da `PAGAR`, o gerador do numero, as chaves do
titulo, os dados do arquiteto usados como favorecido e os campos que comprovam a baixa financeira.

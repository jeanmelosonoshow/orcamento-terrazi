# Comissao de arquitetos

## Instalacao no PostgreSQL de homologacao

1. Execute novamente `database/arquitetos.sql` para adicionar o percentual de comissao.
2. Execute `database/comissao-arquiteto.sql` para criar pagamentos, lotes, historico e fila de sincronizacao.
3. Execute `database/fornecedor-arquiteto.sql` para criar a fila de fornecedores e incluir nela os
   arquitetos ativos ja cadastrados.
4. Execute `database/catalogo-financeiro.sql` e publique a primeira versao conforme
   `database/catalogo-financeiro-uso.md`.
5. Confirme as tabelas com `to_regclass` antes de publicar a interface operacional.

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

## Fluxo operacional disponivel antes do Firebird

- No relatorio `ORCAMENTO COM VENDA GERADA`, uma venda entregue sem registro financeiro aparece
  virtualmente como `PENDENTE`; nenhuma linha desnecessaria e criada nessa consulta.
- Ao confirmar `Autorizar`, o pagamento e criado diretamente como `AUTORIZADO`, com percentual,
  valor da venda e dados do arquiteto congelados para auditoria.
- Pagamentos autorizados podem ser selecionados em lote. Uma unica data prevista e solicitada para
  todos os itens e passa a ser o vencimento previsto do lote.
- A preparacao cria o bordero reimprimivel, mas conserva o pagamento como `AUTORIZADO`. Na interface
  ele aparece como `AGUARDANDO GERACAO`.
- Antes da fila `CRIAR_PAGAR`, o sistema procura o CPF do arquiteto em `FORNECEDOR.CGC`. Se ja existir,
  reutiliza o `IDFORNECEDOR`; se nao existir, o Gateway inclui apenas `IDFORNECEDOR`, `NOMEFORNECEDOR`,
  `NOMEFANTASIA`, `TELEFONES`, `CGC` e `ATIVO='T'`.
- A fila `CRIAR_PAGAR` so nasce depois que o `IDFORNECEDOR` foi confirmado no Firebird.
- A etapa somente muda para `PAGAMENTO_GERADO` quando a futura integracao confirmar que cada titulo
  foi realmente inserido no Firebird.

Os controles usam o renderizador de celulas ja existente no painel. Assim, botoes e formularios
configurados pelo usuario, filtros, tabela simples, tabela dinamica, paginacao e exportacoes continuam
usando as mesmas regras; a camada de comissao e aplicada somente ao relatorio alvo.

## Integracao segura com o Firebird

O Gateway mantem a rota generica de BI somente para leitura. O fornecedor usa uma rota financeira
fixa e autenticada, com credencial de escrita separada e protegida pelo DPAPI da maquina. Nao existe
`INSERT` generico exposto pelo Gateway.

Na homologacao, o proprio Gateway chama periodicamente a rota protegida
`/api/sincronizar-fornecedores-arquiteto`. Isso e necessario porque o Cron da Vercel executa somente
em deployments de producao. A URL da homologacao e o `SUPPLIER_SYNC_SECRET` ficam na configuracao do Gateway;
o segredo e armazenado no mesmo cofre DPAPI das demais credenciais.

Para a proxima etapa, documente os campos obrigatorios da `PAGAR`, o gerador do numero, as chaves do
titulo, os dados do arquiteto usados como favorecido e os campos que comprovam a baixa financeira.

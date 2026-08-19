# Negociacao e contato dos orcamentos

Este recurso controla a etapa comercial de cada orcamento e os contatos feitos
com o cliente sobre aquele orcamento. O historico e a tela de BI usam as mesmas
regras e gravam nas mesmas tabelas.

## 1. Instalacao no Neon

No SQL Editor do branch correto, execute todo o arquivo:

`database/negociacao-orcamento.sql`

O script pode ser executado novamente. Ele cria:

- `status_negociacao`: historico de todas as etapas;
- `orcamento_saida`: um ou mais pedidos gerados por cada orcamento;
- `controle_contato_orcamento`: contato atual vinculado ao `orcamento_id`;
- indices para status, data, orcamento e funcionario;
- gatilhos para manter `orcamentos.status` e a negociacao sincronizados;
- `fn_expirar_orcamentos()`, que grava a expiracao de verdade.

Os motivos exibidos ao recusar ficam em:

`config/budget-rejection-reasons.json`

Cada item possui `id`, `label`, `description`, `active` e `order`. Para retirar um
motivo sem apagar seu historico, use `"active": false`. Nao reutilize um `id`
antigo para representar outro motivo.

Depois da instalacao, valide:

```sql
SELECT to_regclass('public.status_negociacao') AS status_negociacao,
       to_regclass('public.orcamento_saida') AS orcamento_saida,
       to_regclass('public.controle_contato_orcamento') AS contatos;

SELECT status_negociacao, COUNT(*)
  FROM status_negociacao
 GROUP BY status_negociacao
 ORDER BY status_negociacao;

SELECT fn_expirar_orcamentos();

SELECT orcamento_id, idfilialsaida, numerosaida, data_vinculo
  FROM orcamento_saida
 ORDER BY data_vinculo DESC;
```

## 2. Regras automaticas

| Acao | `orcamentos.status` | Etapa vigente |
|---|---|---|
| Criar orcamento | `PENDENTE` | `ORCAMENTO CRIADO` |
| Marcar enviado | `PENDENTE` | `ENVIADO AO CLIENTE` |
| Iniciar negociacao | `PENDENTE` | `EM NEGOCIACAO` |
| Alterar o valor total | `PENDENTE` | `EM NEGOCIACAO` e guarda os dois valores |
| Vencer a validade | `EXPIRADO` | `EXPIRADO` |
| Gerar venda | `GEROU VENDA` | `GEROU VENDA` |
| Recusar | `CANCELADO` | `RECUSADO` |

Ao recusar, o motivo pre-cadastrado e obrigatorio. A observacao da etapa continua
livre e opcional. O banco grava o `id` do motivo e uma copia da descricao exibida
naquele momento; assim, futuras alteracoes no JSON nao mudam o historico antigo.

Ao selecionar **Gerou venda**, o formulario exige pelo menos um pedido, composto
pela filial e pelo numero da saida. O botao **Adicionar pedido** permite informar
varios pedidos na mesma confirmacao. Eles sao gravados em `orcamento_saida`,
vinculados ao orcamento e a movimentacao `GEROU VENDA`. Depois da conclusao,
novos pedidos ainda podem ser vinculados sem duplicar a etapa da negociacao.

As mudancas terminais funcionam nos dois sentidos. Atualizar o status principal
gera a etapa correspondente; inserir a etapa atualiza o status principal.

## 3. Expiracao automatica

A listagem e a tela de negociacao executam a manutencao antes de consultar os
orcamentos. Assim, isso tambem funciona em deploy de Preview.

O `vercel.json` agenda uma conferencia diaria para Production. Crie na Vercel a
variavel `CRON_SECRET` com uma senha aleatoria de pelo menos 16 caracteres. O
agendamento da Vercel nao roda em Preview, mas a manutencao acionada pelas telas
continua funcionando.

## 4. Historico de orcamentos

Cada card da pagina `Historico de Orcamentos` possui o botao **NEGOCIACAO**.
Ele abre a gestao da etapa, mostra todo o historico e permite registrar o contato
relativo ao orcamento.

Selecionar `CANCELADO` no atalho antigo tambem abre essa janela com `RECUSADO`
pre-selecionado, para impedir cancelamentos sem motivo.

## 5. Botao nos relatorios do Funil

A acao e apropriada para Tabela e Tabela dinamica, pois precisa identificar um
orcamento por linha. A consulta deve retornar o ID com um destes aliases:

- `ID_ORCAMENTO`
- `ORCAMENTO_ID`
- `IDORCAMENTO`

Exemplo em uma consulta PostgreSQL:

```sql
SELECT
    /* action:negotiation | label:Negociar | icon:fa-comments | color:#123C7C | position:after */
    O.ID AS ID_ORCAMENTO,
    O.CLIENTE_NOME,
    O.VALOR_TOTAL,
    N.STATUS_NEGOCIACAO,
    N.DATA_STATUS
FROM ORCAMENTOS O
JOIN STATUS_NEGOCIACAO N
  ON N.ORCAMENTO_ID = O.ID
 AND N.VIGENTE = TRUE;
```

Tambem e aceito `action:negociacao`. As mesmas opcoes de `label`, `icon`, `css`,
`color` e `position` das outras diretivas podem ser usadas.

A coluna logo abaixo da diretiva pode ser escrita tanto como
`O.ID AS ID_ORCAMENTO` quanto como `O.ID_ORCAMENTO`, sem a palavra `AS`.

Ao salvar pela janela, apenas o card que originou a acao e reprocessado. Se a
acao estiver em um relatorio de detalhe, o detalhe aberto tambem e atualizado.

## 6. Consultas para o funil

Distribuicao do status atual, indicada para o modo **Percentual do total**:

```sql
SELECT STATUS_NEGOCIACAO AS ETAPA, COUNT(*) AS TOTAL
  FROM STATUS_NEGOCIACAO
 WHERE VIGENTE
 GROUP BY STATUS_NEGOCIACAO;
```

Etapas atingidas, indicada para o modo **Conversao por etapas**:

```sql
SELECT 'ORCAMENTO CRIADO' AS ETAPA, 1 AS ORDEM,
       COUNT(DISTINCT ORCAMENTO_ID) AS TOTAL
  FROM STATUS_NEGOCIACAO
UNION ALL
SELECT 'ENVIADO AO CLIENTE', 2, COUNT(DISTINCT ORCAMENTO_ID)
  FROM STATUS_NEGOCIACAO WHERE STATUS_NEGOCIACAO = 'ENVIADO AO CLIENTE'
UNION ALL
SELECT 'EM NEGOCIACAO', 3, COUNT(DISTINCT ORCAMENTO_ID)
  FROM STATUS_NEGOCIACAO WHERE STATUS_NEGOCIACAO = 'EM NEGOCIACAO'
UNION ALL
SELECT 'GEROU VENDA', 4, COUNT(DISTINCT ORCAMENTO_ID)
  FROM STATUS_NEGOCIACAO WHERE STATUS_NEGOCIACAO = 'GEROU VENDA'
ORDER BY ORDEM;
```

Nesse segundo modelo, um mesmo orcamento pode participar de varias etapas porque
o calculo usa o historico, e nao apenas a etapa vigente.

## 7. Contato do orcamento

O formulario grava:

- status: `PENDENTE`, `AGUARDANDO RETORNO` ou `FINALIZADO`;
- canal: `WHATSAPP`, `LIGACAO`, `EMAIL`, `SMS` ou `TELEGRAM`;
- observacao, datas, funcionario, vendedor e quantidade de contatos.

Depois de `FINALIZADO`, o contato fica bloqueado para alteracoes. A negociacao e
o contato sao controles diferentes: finalizar um contato nao encerra a venda.

## 8. Filtros de relacionamento no Funil

O menu **Funil de Orcamentos** exibe filtros de status, canal e data da ultima
atualizacao do contato. Para um card ou relatorio participar desses filtros,
adicione a diretiva abaixo na consulta, em um ponto onde uma condicao `AND` seja
valida:

```sql
SELECT
    O.ID AS ID_ORCAMENTO,
    O.CLIENTE_NOME,
    O.VALOR_TOTAL
FROM ORCAMENTOS O
WHERE 1 = 1
  /* relacionamento | campo: O.ID */
ORDER BY O.ID DESC;
```

No Funil, o motor interpreta `campo: O.ID` como o `orcamento_id` da tabela
`controle_contato_orcamento`. Na Carteira de Clientes, a mesma diretiva continua
usando o documento do cliente. O contexto do menu faz essa separacao
automaticamente.

O padrao **Pendente + Sem contato** tambem mantem no resultado os orcamentos que
ainda nao possuem registro em `controle_contato_orcamento`. As demais selecoes
incluem somente os IDs que atendem aos status, canais e datas escolhidos.

### Colunas herdadas do contato

Quando a consulta principal ou de detalhe retorna `ID_ORCAMENTO`,
`ORCAMENTO_ID` ou `IDORCAMENTO`, o Funil combina automaticamente os dados do
Postgres e disponibiliza estas colunas no editor:

- `CONTATO_NEGOCIACAO.STATUS_CONTATO`;
- `CONTATO_NEGOCIACAO.TIPO_CONTATO`;
- `CONTATO_NEGOCIACAO.OBSERVACAO`;
- `CONTATO_NEGOCIACAO.DATA_PRIMEIRO_CONTATO`;
- `CONTATO_NEGOCIACAO.DATA_ULTIMO_CONTATO`;
- `CONTATO_NEGOCIACAO.DATA_FINALIZACAO`;
- `CONTATO_NEGOCIACAO.IDFUNCIONARIO`;
- `CONTATO_NEGOCIACAO.IDVENDEDOR`;
- `CONTATO_NEGOCIACAO.QTDE_CONTATO`;
- `CONTATO_NEGOCIACAO.DATA_ULTIMA_ATUALIZACAO`.

Voce escolhe quais delas serao exibidas. Orcamentos sem contato recebem
`PENDENTE` e `SEM CONTATO` apenas na visualizacao, sem criar registros vazios no
banco. A leitura e feita em lotes e respeita a categoria, a filial e a identidade
do usuario autenticado.

# Arquitetos e orcamentos

## Instalacao no Neon

1. Abra o SQL Editor do branch de Preview/Homologacao.
2. Execute todo o arquivo `database/arquitetos.sql` uma unica vez.
3. Confirme a criacao executando:

```sql
SELECT to_regclass('public.arquiteto') AS arquiteto,
       to_regclass('public.arquiteto_orcamento') AS arquiteto_orcamento;
```

As duas colunas devem retornar o nome das tabelas.

## Permissao para trocar o arquiteto

Os IDs autorizados ficam em `api/crm-permissions.json`, no campo:

```json
"architectBudgetEditorFuncionarioIds": ["142", "752", "4"]
```

Depois de alterar essa lista, o usuario precisa sair e entrar novamente. A permissao e gravada na sessao assinada e tambem validada pela API.

## Regras

- CPF e registro no CAU nao podem se repetir.
- Cada orcamento aceita no maximo um arquiteto.
- O vinculo guarda uma fotografia dos dados do arquiteto no momento do orcamento.
- Usuario comum nao pode trocar nem remover um vinculo existente.
- Usuario autorizado pode trocar o arquiteto ao atualizar um orcamento reaberto.
- Um orcamento sem arquiteto pode ser salvo normalmente.

## Filtro de arquitetos no BI

O filtro visivel **Arquitetos** pertence ao menu **Arquitetos & RT**. Para que
um card ou relatorio desse menu responda a selecao, coloque a diretiva abaixo em
um ponto do `WHERE` onde uma condicao `AND` seja valida:

```sql
/* operador = AND | campo: AO.ARQUITETO_ID | filtro = :arquitetos */
```

Troque `AO.ARQUITETO_ID` pelo alias e campo usados na sua consulta. Exemplo:

```sql
SELECT
    AO.ORCAMENTO_ID,
    AO.ARQUITETO_ID,
    A.NOME,
    O.VALOR_TOTAL
FROM ARQUITETO_ORCAMENTO AO
JOIN ARQUITETO A
  ON A.ID = AO.ARQUITETO_ID
JOIN ORCAMENTOS O
  ON O.ID = AO.ORCAMENTO_ID
WHERE AO.ATIVO = TRUE

/* operador = AND | campo: AO.ARQUITETO_ID | filtro = :arquitetos */
```

Quando um ou mais arquitetos forem selecionados e o usuario clicar em
**Aplicar**, o servidor transforma a diretiva em uma condicao parametrizada
equivalente a:

```sql
AND AO.ARQUITETO_ID IN (:arquitetos)
```

Quando **Todos os arquitetos** estiver selecionado, a diretiva e neutralizada e
nao restringe o resultado. O operador padrao e `AND`, portanto esta forma curta
tambem e valida:

```sql
/* campo: AO.ARQUITETO_ID | filtro = :arquitetos */
```

Use `OR` apenas quando a estrutura logica da consulta exigir:

```sql
AND (
    O.STATUS = 'PENDENTE'
    /* operador = OR | campo: AO.ARQUITETO_ID | filtro = :arquitetos */
)
```

A diretiva funciona em consultas PostgreSQL e Firebird, desde que o campo
informado exista na fonte daquela consulta. O visualizador SQL mostra
`:arquitetos` e os IDs aplicados para facilitar a conferencia.

## Consultas para BI

```sql
SELECT
    a.id,
    a.nome,
    a.cpf,
    a.registro_cau,
    a.telefone,
    a.telefone_alternativo,
    a.email,
    a.data_cadastro,
    a.idfilial_cadastro
FROM arquiteto a
WHERE a.ativo = TRUE;
```

```sql
SELECT
    ao.orcamento_id,
    ao.arquiteto_id,
    ao.nome_arquiteto,
    ao.registro_cau_arquiteto,
    ao.idfilial_vinculo,
    ao.data_vinculo,
    o.valor_total,
    o.status
FROM arquiteto_orcamento ao
JOIN orcamentos o ON o.id = ao.orcamento_id;
```

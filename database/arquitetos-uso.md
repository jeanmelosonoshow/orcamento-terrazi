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

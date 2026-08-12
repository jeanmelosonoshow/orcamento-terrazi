# Controle de contato na Carteira de Clientes

Execute `controle-contato.sql` uma vez no PostgreSQL antes de usar o recurso.

## Combinação Firebird e PostgreSQL

Na Carteira de Clientes, qualquer tabela, tabela dinâmica ou relatório de detalhe
que retorne `DOCTOCLIENTE` (ou `DOCUMENTO`) recebe automaticamente as colunas do
controle de contato em uma única consulta PostgreSQL em lote. Não ocorre uma
consulta por cliente.

Se preferir controlar a combinação manualmente, use a consulta secundária abaixo.

Adicione esta consulta ao card de tabela ou tabela dinâmica e relacione
`DOCTOCLIENTE` da consulta Firebird com `DOCTOCLIENTE` desta consulta:

```sql
SELECT
    doctocliente AS DOCTOCLIENTE,
    nome_cliente AS NOME_CLIENTE,
    status_contato AS STATUS_CONTATO,
    tipo_contato AS TIPO_CONTATO,
    observacao AS OBSERVACAO,
    data_primeiro_contato AS DATA_PRIMEIRO_CONTATO,
    data_ultimo_contato AS DATA_ULTIMO_CONTATO,
    data_finalizacao AS DATA_FINALIZACAO,
    qtde_contato AS QTDE_CONTATO,
    data_ultima_atualizacao AS DATA_ULTIMA_ATUALIZACAO
FROM controle_contato
```

Use o modo **Relacionar por campo**. A consulta Firebird deve ser a principal,
pois assim clientes que ainda não têm contato continuam aparecendo.

## Ícone e ação na célula

Os comentários ficam imediatamente antes do campo e não alteram a sintaxe SQL:

```sql
SELECT
    /* icon:whatsapp | position:before */ C.TELEFONE AS TELEFONE,
    /* action:contact | label:Contato | icon:contact | color:#0A7C66 | position:after */
    C.DOCTOCLIENTE AS DOCTOCLIENTE,
    C.NOMECLIENTE AS NOME_CLIENTE
FROM CLIENTE C
```

Ícones disponíveis: `whatsapp`, `phone`, `email`, `sms`, `telegram`, `link` e
`contact`. A posição pode ser `before` ou `after`.

## Reabertura por recompra

Atualize o valor oficial do indicador Média Recompra em dias:

```sql
UPDATE controle_contato_config
SET media_recompra_dias = 90,
    data_ultima_atualizacao = CURRENT_TIMESTAMP
WHERE id = 1;
```

Não é necessário instalar `pg_cron`. No ambiente Preview/homologação, a API
executa a manutenção abaixo no primeiro acesso diário à Carteira de Clientes:

```sql
SELECT * FROM fn_executar_manutencao_contatos();
```

O controle gravado em `controle_contato_config` garante que apenas uma chamada
por dia faça o processamento, mesmo que vários usuários acessem a tela ao mesmo
tempo. Se não houver acesso em determinado dia, a manutenção será realizada no
primeiro acesso seguinte. O banco reabre o contato como pendente e incrementa
`QTDE_CONTATO`.

Para validar manualmente:

```sql
SELECT id, media_recompra_dias, data_ultima_execucao_reabertura
FROM controle_contato_config;
```

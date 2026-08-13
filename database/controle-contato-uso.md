# Manual do Controle de Contato

Este manual descreve todos os recursos da integração de controle de contato do
menu **Carteira de Clientes**: cadastro, combinação Firebird/PostgreSQL, filtros,
formulário, colunas, tabela dinâmica, botões, ícones, exportação e manutenção.

## 1. Como a integração funciona

- O **Firebird** fornece a carteira e os dados cadastrais dos clientes.
- O **PostgreSQL/Neon** armazena o acompanhamento dos contatos.
- A aplicação consulta primeiro o Firebird.
- Em seguida, reúne os documentos retornados e consulta o PostgreSQL em lote.
- O documento relaciona a linha Firebird ao registro de `controle_contato`.
- Os filtros de relacionamento são aplicados ao resultado combinado.

Não existe `JOIN` direto entre os dois bancos dentro do SQL Firebird.

## 2. Preparação do PostgreSQL

Execute uma vez no PostgreSQL do ambiente:

```text
database/controle-contato.sql
```

O script cria as tabelas, índices, validações, gatilho de gravação e funções de
reabertura por recompra.

Validação básica:

```sql
SELECT to_regclass('public.controle_contato') AS tabela_contato,
       to_regclass('public.controle_contato_config') AS tabela_config;

SELECT id, media_recompra_dias, data_ultima_tentativa_recompra,
       data_ultima_execucao_reabertura, erro_ultima_sincronizacao
FROM controle_contato_config;
```

## 3. Campos obrigatórios na consulta Firebird

A consulta precisa retornar o documento com um destes nomes:

```text
DOCTOCLIENTE
DOCUMENTO
```

Exemplos:

```sql
C.DOCTOCLIENTE AS DOCTOCLIENTE
```

```sql
C.DOCTOCLIENTE AS DOCUMENTO
```

O documento deve permanecer no resultado original mesmo quando ficar oculto na
tabela. Ele é a chave técnica da integração e do botão de contato.

Para o nome exibido no formulário, são reconhecidos:

```text
NOME_CLIENTE
NOMECLIENTE
NOME
```

Sem documento, a linha pode ser exibida, mas não recebe os campos PostgreSQL e
não abre o formulário de contato.

## 4. Campos acrescentados pelo PostgreSQL

| Coluna disponível | Conteúdo |
| --- | --- |
| `CONTATO.NOME_CLIENTE` | Nome salvo no controle |
| `CONTATO.STATUS_CONTATO` | Situação atual |
| `CONTATO.TIPO_CONTATO` | Último canal informado |
| `CONTATO.OBSERVACAO` | Observação ou histórico |
| `CONTATO.DATA_PRIMEIRO_CONTATO` | Data da primeira gravação |
| `CONTATO.DATA_ULTIMO_CONTATO` | Data do último contato em andamento |
| `CONTATO.DATA_FINALIZACAO` | Data da finalização |
| `CONTATO.IDFUNCIONARIO` | Funcionário da última gravação |
| `CONTATO.IDVENDEDOR` | Vendedor da última gravação, quando houver |
| `CONTATO.QTDE_CONTATO` | Número do ciclo de contato |
| `CONTATO.DATA_ULTIMA_ATUALIZACAO` | Última alteração do registro |

Para clientes ainda inexistentes no PostgreSQL:

```text
CONTATO.STATUS_CONTATO = PENDENTE
CONTATO.TIPO_CONTATO = SEM CONTATO
```

Os demais campos ficam vazios até o primeiro cadastro.

## 5. Consulta Firebird simples

```sql
SELECT
    C.DOCTOCLIENTE AS DOCUMENTO,
    C.NOMECLIENTE AS NOME,
    C.CELULAR AS CONTATO,
    C.EMAIL AS EMAIL,
    C.CIDADE AS CIDADE
FROM CLIENTE C
WHERE C.ATIVO = 'T'
```

Depois de **Executar teste**, as colunas `CONTATO.*` ficam disponíveis no editor.

## 6. Utilização com EXECUTE BLOCK

O bloco retorna somente os campos existentes no Firebird:

```sql
EXECUTE BLOCK
RETURNS (
    DOCUMENTO VARCHAR(40),
    NOME VARCHAR(180),
    CONTATO VARCHAR(80),
    EMAIL VARCHAR(320)
)
AS
BEGIN
    FOR
        SELECT C.DOCTOCLIENTE, C.NOMECLIENTE, C.CELULAR, C.EMAIL
        FROM CLIENTE C
        WHERE C.ATIVO = 'T'
        INTO :DOCUMENTO, :NOME, :CONTATO, :EMAIL
    DO
    BEGIN
        SUSPEND;
    END
END
```

Não adicione `CONTATO.STATUS_CONTATO` ou outro campo PostgreSQL ao `RETURNS`.
Depois da execução do bloco, a aplicação usa `DOCUMENTO` para acrescentá-los.

## 7. Escolha das colunas exibidas

### Tabela principal do card

Após executar a consulta, avance para a etapa de campos. Configure como **Linha**
ou **Valor** apenas o que deseja mostrar. Use **Ignorar** nas demais colunas.

Campos ignorados permanecem no conjunto de dados e podem ser usados para
identificação, ação ou detalhamento.

### Tabela do relatório detalhe

Ative **Relatório de detalhe**, escolha **Tabela** e preencha **Colunas exibidas**:

```text
DOCUMENTO, NOME, CONTATO, EMAIL, CONTATO.STATUS_CONTATO,
CONTATO.TIPO_CONTATO, CONTATO.DATA_ULTIMA_ATUALIZACAO
```

Regras:

- separe os nomes por vírgula;
- a ordem digitada será a ordem visual;
- deixe vazio para mostrar todas as colunas;
- misture livremente campos Firebird e `CONTATO.*`;
- o documento pode ficar fora da lista visual, mas precisa existir no SQL;
- um nome inexistente gera uma mensagem com a coluna não encontrada.

Exemplo com documento oculto:

```text
NOME, CONTATO, CONTATO.STATUS_CONTATO, CONTATO.DATA_ULTIMA_ATUALIZACAO
```

Para trocar apenas o título visual de uma coluna, use `AS`:

```text
CONTATO.STATUS_CONTATO AS SITUACAO
```

Aliases com espaços, números ou caracteres especiais devem usar aspas duplas:

```text
CONTATO.DATA_PRIMEIRO_CONTATO AS "1ª Contato"
```

É possível escolher o primeiro valor não nulo entre campos com `COALESCE`:

```text
COALESCE(CONTATO.DATA_FINALIZACAO, CONTATO.DATA_ULTIMO_CONTATO) AS "1ª Contato"
```

Em **Colunas exibidas**, são permitidos somente nomes de campos, `COALESCE` e
aliases com `AS`. A expressão é calculada sobre o resultado combinado e não é
enviada ao Firebird nem ao PostgreSQL como SQL.

O apelido pertence à configuração do relatório combinado, não ao SQL Firebird.
Por isso, em um `EXECUTE BLOCK`, não declare `SITUACAO` no `RETURNS` apenas para
receber o status do PostgreSQL.

### Tabela dinâmica principal

Escolha os papéis:

- **Linha:** dimensão vertical;
- **Coluna:** dimensão que abre colunas dinâmicas;
- **Valor:** campo agregado;
- **Ignorar:** disponível sem aparecer inicialmente.

Exemplo para contar clientes por status:

```text
Linha: CONTATO.STATUS_CONTATO
Valor: DOCUMENTO
Agregação: COUNT DISTINCT
```

Exemplo por status e canal:

```text
Linha: CONTATO.STATUS_CONTATO
Coluna: CONTATO.TIPO_CONTATO
Valor: DOCUMENTO
Agregação: COUNT DISTINCT
```

### Tabela dinâmica do relatório detalhe

```text
Campos de linha: CONTATO.STATUS_CONTATO
Campo de coluna: CONTATO.TIPO_CONTATO
Campos de valor: DOCUMENTO
Agregação: COUNT DISTINCT
Total geral: marcado
```

Quando o detalhe dinâmico usar `CONTATO.*`, informe esses nomes em Linha, Coluna
ou Valor. Assim, a agregação ocorrerá depois da combinação com o PostgreSQL.

## 8. Ícones nas células

A diretiva de ícone é um comentário SQL e não altera a consulta executada:

```sql
/* icon:NOME | position:before */ CAMPO AS ALIAS
```

Também são aceitos `posicao:before` e `posicao:after`.

| Ícone | Uso sugerido |
| --- | --- |
| `whatsapp` | WhatsApp |
| `phone` | Telefone ou ligação |
| `email` | E-mail |
| `sms` | SMS |
| `telegram` | Telegram |
| `link` | Link ou referência |
| `contact` | Controle de contato |

Exemplos:

```sql
SELECT
    /* icon:whatsapp | position:before */ C.CELULAR AS CONTATO,
    /* icon:email | position:before */ C.EMAIL AS EMAIL,
    /* icon:phone | position:after */ C.TELEFONE AS TELEFONE
FROM CLIENTE C
```

### Ícone em EXECUTE BLOCK

Como o alias está no `RETURNS`, use uma marcação totalmente comentada:

```sql
/* icon:whatsapp | position:before */ /* AS CONTATO */
/* icon:email | position:before */ /* AS EMAIL */
```

Ela pode ficar depois do `RETURNS`. O nome após `AS` deve ser exatamente o nome
da coluna retornada.

## 9. Botão de cadastro e atualização

Sintaxe:

```sql
/* action:contact | label:Contato | icon:contact | color:#0A7C66 | position:after */
C.DOCTOCLIENTE AS DOCUMENTO
```

| Opção | Alternativa | Finalidade |
| --- | --- | --- |
| `label` | `nome` | Texto do botão |
| `icon` | `icone` | Ícone do botão |
| `color` | `cor` | Cor CSS, como `#0A7C66` |
| `position` | `posicao` | `before` ou `after` |
| `css` | - | CSS visual permitido para o botão |

### Font Awesome e ícones coloridos

O painel carrega a biblioteca Font Awesome Free. Para usar seus ícones, informe o
nome com o prefixo `fa-`:

```sql
/* icon:fa-whatsapp | color:#25D366 | background:#E9FBEF | size:18px | position:before */
C.CELULAR AS CONTATO
```

Nos botões, use `icon` e, quando necessário, `family:brands` ou
`family:regular`. Ícones conhecidos de marcas, como WhatsApp e Telegram, já são
identificados automaticamente:

```sql
/* action:contact | label:Registrar contato | icon:fa-whatsapp | color:#25D366 | position:after */
C.DOCTOCLIENTE AS DOCUMENTO
```

Para personalizar o botão diretamente na diretiva:

```sql
/* action:contact | label:Registrar | icon:fa-user-plus | css:background:#123865; color:#fff; border-color:#123865; border-radius:14px; padding:7px 12px; box-shadow:0 2px 6px rgba(0,0,0,.18) | position:after */
C.DOCTOCLIENTE AS DOCUMENTO
```

Propriedades CSS aceitas: `color`, `background`, `background-color`,
`border-color`, `border-width`, `border-style`, `border-radius`, `padding`,
`gap`, `font-size`, `font-weight`, `min-width`, `height`, `box-shadow` e
`text-transform`. Regras de posicionamento, URLs, seletores e scripts são
descartados. A versão Free usa uma cor por glifo; o efeito colorido é obtido
combinando cor do ícone, fundo e borda. Duotone nativo depende do Font Awesome
Pro.

Exemplo em português:

```sql
/* action:contact | nome:Registrar | icone:phone | cor:#123865 | posicao:after */
C.DOCTOCLIENTE AS DOCUMENTO
```

O botão pode ser anexado a qualquer coluna exibida, mas a linha deve conter o
documento e, preferencialmente, o nome. Documento e nome podem estar ocultos.

### Botão em EXECUTE BLOCK

```sql
/* action:contact | label:Contato | icon:contact | color:#0A7C66 | position:after */
/* AS DOCUMENTO */
```

Marcações completas para um bloco:

```sql
/* icon:whatsapp | position:before */ /* AS CONTATO */
/* icon:email | position:before */ /* AS EMAIL */
/* action:contact | label:Contato | icon:contact | color:#0A7C66 | position:after */ /* AS DOCUMENTO */
```

Não é necessário criar uma coluna fictícia para o botão. Vinculá-lo ao documento
é a configuração mais simples. Se desejar uma coluna exclusiva, o SQL precisa
retornar `ACAO_CONTATO` e a diretiva deve apontar para esse alias.

## 10. Formulário de contato

Ao clicar no botão, o sistema consulta o PostgreSQL pelo documento e mostra:

- documento e nome;
- status e tipo de contato;
- observação;
- ciclo de contato;
- data da última atualização.

Status permitidos:

```text
PENDENTE
AGUARDANDO RETORNO
FINALIZADO
```

Tipos permitidos:

```text
WHATSAPP
LIGACAO
EMAIL
SMS
TELEGRAM
```

Regras:

- a primeira gravação inclui o registro com `QTDE_CONTATO = 1`;
- `DATA_PRIMEIRO_CONTATO` nasce na primeira gravação;
- Pendente ou Aguardando retorno atualiza `DATA_ULTIMO_CONTATO`;
- Finalizado preenche `DATA_FINALIZACAO`;
- toda gravação atualiza `DATA_ULTIMA_ATUALIZACAO`;
- `IDFUNCIONARIO` e `IDVENDEDOR` vêm da sessão autenticada;
- a observação existente é recuperada para complementação;
- após Finalizado, o registro fica bloqueado para alterações manuais.

O registro finalizado volta para Pendente somente pela rotina automática de
recompra. Nessa reabertura, `QTDE_CONTATO` é incrementado.

## 11. Filtros de relacionamento

Os filtros aparecem apenas na **Carteira de Clientes**.

### Status contato

- múltipla seleção;
- padrão: Pendente e Aguardando retorno;
- opção Todos.

### Tipo contato realizado

- múltipla seleção;
- inclui Sem contato;
- padrão: todos os canais.

### Última atualização

- data inicial e final opcionais;
- usa `CONTATO.DATA_ULTIMA_ATUALIZACAO`.

Após alterar, clique em **Aplicar**. Restaurar filtros volta ao padrão. Clicar
fora da lista, abrir a outra lista ou pressionar `Esc` recolhe a seleção.

Em uma consulta Firebird, não escreva `:status_contato`, `:tipos_contato`,
`:data_contato_inicial` ou `:data_contato_final`: a aplicação filtra depois da
combinação.

### KPI e gráfico já agregados no Firebird

Quando a consulta retorna somente um total, o documento não chega ao navegador e
o filtro não pode ser aplicado depois da agregação. Nesse caso, marque dentro do
`WHERE`, antes do `COUNT`, `SUM` ou outro cálculo, o campo que identifica o
cliente:

```sql
WHERE V.DATA_MIN_COMPRA >= :data_inicial
/* relacionamento | campo: V.DOCTOCLIENTE */
```

A diretiva é um comentário válido no editor SQL e é substituída no servidor por
uma condição segura. Ela respeita status, tipo e período de atualização. Clientes
que ainda não existem em `controle_contato` são tratados como `PENDENTE` e
`SEM CONTATO`. Em um `EXECUTE BLOCK` com vários caminhos por categoria, repita a
diretiva em cada `SELECT` que participa do resultado.

O operador padrão é `AND`. Quando a estrutura lógica exigir `OR`, use:

```sql
/* operador = OR | relacionamento | campo: V.DOCTOCLIENTE */
```

Consultas que retornam `DOCTOCLIENTE` ou `DOCUMENTO` linha a linha continuam com
o enriquecimento automático já existente e não precisam dessa diretiva.

Esses parâmetros podem ser usados quando a própria fonte for PostgreSQL:

```sql
SELECT *
FROM controle_contato
WHERE status_contato IN (:status_contato)
  AND tipo_contato IN (:tipos_contato)
```

## 12. Combinação automática recomendada

1. Crie o card no menu Carteira de Clientes.
2. Use somente a consulta Firebird.
3. Retorne `DOCUMENTO` ou `DOCTOCLIENTE`.
4. Execute o teste.
5. Escolha os campos Firebird e `CONTATO.*`.
6. Salve e teste os filtros.

Essa opção realiza uma consulta PostgreSQL em lote, mantém clientes sem contato
e aplica automaticamente Pendente/Sem contato. Cada enriquecimento aceita até
5.000 documentos distintos; para volumes maiores, restrinja o SQL ou divida o
relatório.

## 13. Combinação manual opcional

Use apenas quando precisar controlar a junção no editor de consultas compostas.

Consulta PostgreSQL secundária:

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
    idfuncionario AS IDFUNCIONARIO,
    idvendedor AS IDVENDEDOR,
    qtde_contato AS QTDE_CONTATO,
    data_ultima_atualizacao AS DATA_ULTIMA_ATUALIZACAO
FROM controle_contato
```

Configuração:

```text
Principal: Firebird
Secundária: PostgreSQL
Modo: Relacionar por campo
Campo principal: DOCTOCLIENTE ou DOCUMENTO
Campo secundário: DOCTOCLIENTE
```

Mantenha o Firebird como principal para não eliminar clientes sem contato.

## 14. Paginação, exportação e impressão

Use paginação e limite visual em relatórios grandes. Isso reduz as linhas
renderizadas simultaneamente. A exportação para Excel/PDF e a impressão usam
todos os registros carregados, não apenas a página visível.

Exiba e exporte apenas os dados necessários, principalmente observações e dados
de contato.

## 15. Reabertura pela média de recompra

Não é necessário `pg_cron`. No primeiro acesso diário à Carteira, a API reserva
a execução e consulta o Firebird:

```sql
SELECT ROUND(AVG(R.MEDIA_RECOMPRA_CLIENTE)) AS RECOMPRA
FROM RECOMPRA_CLIENTE R
```

Com um valor válido, atualiza `media_recompra_dias` e reabre os contatos
finalizados que ultrapassaram esse prazo. Apenas uma chamada por dia recebe a
reserva, mesmo com vários usuários.

Em caso de falha, o último valor válido é mantido e uma nova tentativa é liberada
após 15 minutos. A falha não impede o carregamento da Carteira.

## 16. Diagnóstico

### As colunas CONTATO.* não aparecem

Confirme se o menu é Carteira de Clientes, se existe `DOCUMENTO`/`DOCTOCLIENTE`
no retorno e se o teste da consulta foi executado novamente.

### O botão não aparece

Confirme a diretiva `action:contact`, o alias associado, a presença do documento
na linha e, em `EXECUTE BLOCK`, a marcação `/* AS NOME_DA_COLUNA */`.

### O formulário abre sem o nome

Retorne o nome como `NOME`, `NOMECLIENTE` ou `NOME_CLIENTE`.

### Cliente sem cadastro desaparece

Na combinação manual, confirme que o Firebird é a consulta principal. Na
automática, verifique se o próprio SQL Firebird eliminou o cliente.

### Filtro de data elimina clientes sem contato

É esperado: sem gravação, não existe `DATA_ULTIMA_ATUALIZACAO` para atender ao
período informado.

### Contato finalizado não pode ser alterado

É uma regra intencional. A reabertura ocorrerá pela rotina de recompra.

## 17. Exemplo completo

```sql
SELECT
    /* action:contact | label:Contato | icon:contact | color:#0A7C66 | position:after */
    C.DOCTOCLIENTE AS DOCUMENTO,
    C.NOMECLIENTE AS NOME,
    /* icon:whatsapp | position:before */ C.CELULAR AS CONTATO,
    /* icon:email | position:before */ C.EMAIL AS EMAIL,
    C.CIDADE AS CIDADE
FROM CLIENTE C
WHERE C.ATIVO = 'T'
```

Colunas exibidas no detalhe:

```text
NOME, CONTATO, EMAIL, CIDADE, CONTATO.STATUS_CONTATO,
CONTATO.TIPO_CONTATO, CONTATO.DATA_ULTIMA_ATUALIZACAO, DOCUMENTO
```

Tabela dinâmica:

```text
Campos de linha: CONTATO.STATUS_CONTATO
Campo de coluna: CONTATO.TIPO_CONTATO
Campos de valor: DOCUMENTO
Agregação: COUNT DISTINCT
Total geral: marcado
```

## 18. Checklist

- [ ] O card pertence à Carteira de Clientes.
- [ ] O SQL retorna `DOCUMENTO` ou `DOCTOCLIENTE`.
- [ ] O nome usa um alias reconhecido.
- [ ] O teste da consulta foi executado.
- [ ] As colunas `CONTATO.*` desejadas foram selecionadas.
- [ ] A ordem de Colunas exibidas está correta.
- [ ] Botões e ícones apontam para aliases retornados.
- [ ] A paginação foi configurada para relatórios grandes.
- [ ] O card foi testado com os filtros de relacionamento.
- [ ] O formulário foi testado com cliente novo e existente.

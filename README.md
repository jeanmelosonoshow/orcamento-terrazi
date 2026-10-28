# orcamento-terrazi
# atualizacao

## Documentação funcional

- [Manual do Controle de Contato](database/controle-contato-uso.md)

## Cenarios compartilhados do CRM

Os cards, consultas, aparencia, layout e altura dos paineis de Visao Geral, Carteira de Clientes,
Funil, Arquitetos e Reativacao sao persistidos no PostgreSQL por `api/dashboard-scenarios.js`.
O navegador mantem somente resultados temporarios das consultas e preferencias pessoais.

Na primeira abertura por um editor depois desta atualizacao, configuracoes antigas encontradas no
`localStorage` sao migradas automaticamente para o banco quando o respectivo painel ainda nao existe
no servidor. As alteracoes posteriores usam versao otimista e ficam registradas em
`crm_dashboard_cenario_historico`.

As tabelas sao criadas de forma idempotente pela API. O SQL equivalente para implantacao manual esta
em `database/dashboard-scenarios.sql`.

## Conexao Firebird

Variaveis obrigatorias:

- `DB_HOST_FB`
- `DB_PORT_FB`
- `DB_PATH_FB`
- `DB_USER_FB`
- `DB_PASSWORD_FB`

Opcoes de estabilidade:

- `FB_POOL_SIZE`: conexoes por instancia, padrao `3`
- `FB_CONNECT_RETRIES`: novas tentativas apos falha transitoria, padrao `2`
- `FB_CONNECT_TIMEOUT_MS`: limite de cada tentativa de login no Firebird, padrao `10000`
- `FB_ACQUIRE_TIMEOUT_MS`: limite para aguardar uma conexao livre no pool, padrao `12000`
- `FB_QUERY_TIMEOUT_MS`: limite geral de consulta, padrao `15000`
- `FB_POOL_IDLE_MS`: tempo ocioso antes de fechar conexao, padrao `30000`
- `FB_POOL_LIFETIME_MS`: vida maxima da conexao, padrao `900000`
- `FB_POOL_MAX_USES`: usos antes de reciclar a conexao, padrao `1000`
- `DB_CHARSET_FB`: codificacao principal, padrao `NONE`; deve coincidir com a conexao usada no IBExpert
- `DB_CHARSET_FB_FALLBACK`: alternativa para consultas de cenario com texto legado, padrao `UTF8`; use `OFF` para desativar

O painel limita automaticamente a quantidade de consultas simultaneas. Evite aumentar `FB_POOL_SIZE`
sem conferir `MaxUserConnections` e a capacidade do servidor Firebird; mais conexoes podem aumentar
a incidencia de falhas de login em vez de melhorar o desempenho.

O erro Firebird `335545106` e generico. Se persistir mesmo com o pool,
consultar `firebird.log` no servidor e conferir `AuthServer`, `WireCrypt`,
plugin do usuario e se todos os servidores apontados pelo host usam a mesma
configuracao.

## Filtros de cenario por categoria

As consultas dos cenarios podem usar estes parametros de sistema:

- `:categoria`: codigo da categoria autenticada (`DI`, `SU`, `GR`, `VD` ou `CX`)
- `:idfuncionario`: funcionario autenticado
- `:idfilial`: filial do usuario autenticado
- `:idvendedor`: vendedor vinculado ao usuario autenticado

Esses valores sao obtidos da sessao assinada no servidor. Valores enviados
pelo navegador com os mesmos nomes sao ignorados.

Prefira predicados separados por categoria, pois sao mais claros e tendem a
aproveitar indices melhor do que um `CASE` aplicado sobre as colunas:

```sql
SELECT
    v.idfilial,
    v.nomefilial,
    SUM(v.subtotal) AS total
FROM view_vendas v
WHERE v.data BETWEEN :data_inicial AND :data_final
  AND (
       :categoria = 'DI'
       OR (:categoria = 'SU' AND v.idsupervisor = :idfuncionario)
       OR (:categoria = 'GR' AND v.idfilial = :idfilial)
       OR (:categoria = 'VD' AND v.idvendedor = :idvendedor)
       OR (:categoria = 'CX' AND v.idfilial = :idfilial)
  )
GROUP BY v.idfilial, v.nomefilial
```

Os filtros escolhidos no painel podem ser adicionados como refinamento opcional com diretivas em
comentarios SQL:

```sql
/* operador = OR | campo: V.IDFILIAL | filtro = :filiais */
/* operador = AND | campo: V.IDVENDEDOR | filtro = :vendedores */
```

Use a diretiva no lugar de `AND campo IN (:filiais)` ou `AND campo IN (:vendedores)`. Quando `Todos`
estiver marcado, a diretiva e removida e nenhum parametro de lista e enviado ao Firebird. Em uma
selecao parcial, ela se transforma em `AND campo IN (...)` ou `OR campo IN (...)` parametrizado.
Quando `operador` for omitido, o padrao sera `AND`. A condicao por categoria
deve permanecer na consulta para garantir o escopo de acesso.

## Relacionamento eficiente entre consultas

No modo **Relacionar consultas em sequencia**, a primeira consulta e executada antes das demais.
As chaves configuradas no `INNER JOIN` ou `LEFT JOIN` sao enviadas em lotes para cada consulta
seguinte. O filtro e aplicado no banco antes do limite de retorno, sempre como uma chave composta.
Por exemplo, `IDFILIAL + NUMEROSAIDA` preserva os pares de cada linha e nao cria combinacoes
incorretas entre filiais e vendas.

Nao e preciso alterar o SQL para ativar esse filtro antecipado: basta preencher todos os campos do
relacionamento no editor. Para usar um valor retornado pela primeira consulta como campo virtual no
SQL seguinte, declare um apelido:

```sql
/* RELACIONAR | apelido: rel_orcamento | consulta: "DADOS ORCAMENTO" */

SELECT
    S.IDFILIAL,
    S.NUMEROSAIDA,
    CASE
        WHEN /* rel_orcamento.IDFILIAL */ IN ('02') THEN 'verdadeiro'
        ELSE 'falso'
    END AS TESTE
FROM SAIDA S
```

O nome em `consulta` deve ser o apelido exato da primeira consulta. O campo depois do ponto deve ser
um alias retornado por ela. Tambem e possivel declarar um campo padrao e usar somente o apelido:

```sql
/* RELACIONAR | apelido: filial_origem | consulta: principal | campo: IDFILIAL */
SELECT CASE WHEN /* filial_origem */ = '02' THEN 1 ELSE 0 END AS TESTE
FROM RDB$DATABASE
```

O motor agrupa registros com o mesmo valor virtual, parametriza os valores e divide chaves grandes
em lotes. Se a mesma chave composta possuir valores virtuais conflitantes, a consulta e recusada e
orienta completar a cardinalidade. Campos virtuais nao sao concatenados ao SQL e, por seguranca,
nao sao aceitos dentro de `EXECUTE BLOCK`.

## EXECUTE BLOCK com tabelas temporarias

O executor aceita `DELETE FROM` e `INSERT INTO ... SELECT` dentro de `EXECUTE BLOCK` somente quando
o Firebird confirmar no catalogo que cada destino e uma tabela temporaria global
(`RDB$RELATION_TYPE` 4 ou 5). Tabelas permanentes continuam bloqueadas.

Para cada GTT que receber insercoes:

- use um nome simples, sem schema e sem identificador entre aspas;
- execute `DELETE FROM NOME_DA_GTT` antes do primeiro `INSERT`;
- mantenha `RETURNS` e `SUSPEND` para produzir o relatorio;
- nao use `UPDATE`, `MERGE`, DDL, `COMMIT`, `ROLLBACK`, transacao autonoma ou SQL dinamico.

A limpeza inicial evita dados de um uso anterior em GTTs `ON COMMIT PRESERVE ROWS`. Como protecao
adicional, o Gateway limpa novamente as GTTs na mesma conexao antes de devolve-la ao pool. Se essa
limpeza falhar, a conexao e descartada.

## Relatorio de detalhe por clique

Cards KPI e graficos podem executar uma consulta propria ao clicar no resultado. O SQL do detalhe
recebe os filtros normais do painel e estes parametros adicionais:

- `:detalhe_valor`: valor original da dimensao clicada;
- `:detalhe_campo`: nome informativo do campo de dimensao;
- `:detalhe_serie`: nome da serie selecionada.

Use `:detalhe_valor` como valor parametrizado. `:detalhe_campo` nao substitui um identificador SQL;
quando houver graficos com dimensoes diferentes, use condicoes explicitas:

```sql
SELECT
    v.numero,
    v.cliente,
    v.total
FROM vendas v
WHERE v.data BETWEEN :data_inicial AND :data_final
  AND (
       :detalhe_valor IS NULL
       OR (:detalhe_campo = 'IDFILIAL' AND v.idfilial = :detalhe_valor)
  )
```

Para tabela dinamica, informe no editor os campos de linha, coluna e valor usando exatamente os
nomes ou aliases retornados pelo SQL. A agregacao e executada no servidor antes da renderizacao.
## Gateway de BI para acesso concorrente

Para producao com aproximadamente 250 usuarios, as funcoes da Vercel nao devem abrir conexoes
Firebird diretamente. `lib/bi-gateway-client.js` envia as consultas assinadas ao Gateway Windows e
mantem na camada Vercel:

- fila com limite global de consultas e de espera;
- cache por SQL, parametros, limite e charset;
- single-flight, para uma consulta identica ser executada uma unica vez;
- circuit breaker, que interrompe novas tentativas durante falhas repetidas do Firebird;
- stale-while-revalidate e retorno do ultimo resultado valido durante falhas transitorias.

O `SonoShowGateway.exe` centraliza no TS a autenticacao HMAC, a validacao SQL, a concorrencia e as
conexoes com o Firebird.

### Implantacao

1. Instale o `SonoShowGateway.exe` no Windows TS que alcanca o Firebird.
2. Mantenha o servico `SonoShowFirebirdGateway` em execucao e o Cloudflare Tunnel apontado para
   `http://127.0.0.1:8787`.
3. Na Vercel, configure:
   - `FIREBIRD_GATEWAY_URL`: `https://gateway.jgmelo.company`, sem `/query`;
   - `FIREBIRD_GATEWAY_TOKEN_ID`: identificador `ssg_...` exclusivo do projeto;
   - `FIREBIRD_GATEWAY_HMAC_SECRET`: segredo HMAC exclusivo do projeto;
   - `BI_DASHBOARD_CACHE_TTL_MS`: padrao `300000`;
   - `BI_DASHBOARD_CACHE_STALE_MS`: padrao `900000`;
   - `BI_DRILL_CACHE_MAX_ROWS`: maximo de linhas da base reutilizavel, padrao `3000`;
   - `BI_DRILL_CACHE_MAX_BYTES`: tamanho maximo da base em memoria, padrao `4194304` (4 MB).
4. Remova as credenciais Firebird da Vercel depois de validar o Gateway. Elas devem existir somente
   no servico persistente.

O endpoint publico `GET /health` confirma o servico. As consultas usam `POST /query`, com token,
timestamp, nonce e assinatura HMAC gerados automaticamente por `lib/bi-gateway-client.js`.

### Redis e replicas

Configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (ou os aliases
`KV_REST_API_URL` e `KV_REST_API_TOKEN` criados pela integracao Vercel KV). A fila, os leases,
os bloqueios de single-flight e o cache continuam compartilhados entre as instancias da Vercel antes
da chamada ao Gateway Windows. Use o token REST padrao com escrita; o token read-only nao permite
`SET`, `EVAL`, `ZADD`, renovacao de leases nem liberacao dos bloqueios.

O cliente REST usa timeout curto, uma retentativa com espera progressiva e circuit breaker. Os
scripts de fila e bloqueio sao idempotentes para que uma resposta de rede perdida possa ser repetida
sem duplicar vagas. A espera da fila cresce de 250 ms ate 1,5 s com jitter, e leases/bloqueios sao
renovados durante consultas demoradas. Em uma indisponibilidade do Redis, resultados stale ainda
validos continuam sendo entregues; consultas sem contingencia falham rapidamente para proteger o
Gateway e o Firebird contra uma avalanche de conexoes.

Variaveis recomendadas para essa protecao:

- `BI_REDIS_TIMEOUT_MS=1800`
- `BI_REDIS_RETRIES=1`
- `BI_REDIS_BACKOFF_MS=100`
- `BI_REDIS_CIRCUIT_FAILURES=3`
- `BI_REDIS_CIRCUIT_OPEN_MS=10000`
- `BI_GATEWAY_QUEUE_POLL_MS=250`
- `BI_GATEWAY_QUEUE_POLL_MAX_MS=1500`
- `BI_GATEWAY_LOCK_SAFETY_MS=25000`
- `BI_REFERENCE_CACHE_STALE_MS=21600000`

No primeiro drill-down de uma tabela dinamica, a API carrega e mantem temporariamente a
consulta-base nesse cache compartilhado. Os proximos niveis reaplicam dimensoes, filtros e agregacoes
no servidor sem consultar novamente o Firebird. O carregamento e feito sob demanda para nao trazer
dados detalhados de relatorios que o usuario nao abrir. Se a quantidade de linhas ou o tamanho em
bytes ultrapassar o limite, a API descarta o processamento em memoria e executa o SQL agregado no
banco, preservando a exatidao do resultado.

Configuracao inicial para teste de carga com 250 usuarios:

- `BI_GATEWAY_CONCURRENCY=8`
- `BI_GATEWAY_LOCAL_CONCURRENCY=3`
- `BI_GATEWAY_QUEUE_LIMIT=100`
- `BI_GATEWAY_QUEUE_TIMEOUT_MS=30000`
- `FB_POOL_SIZE=3`

A concorrencia global limita o total de consultas entre todas as instancias. A concorrencia local
deve ser menor ou igual ao pool de cada instancia para que uma consulta nao fique aguardando uma
conexao que a propria instancia nao possui. Ajuste esses valores somente depois de medir CPU, disco,
conexoes ativas e duracao p95 no servidor Firebird. Se
`FIREBIRD_GATEWAY_URL` estiver configurada e o Gateway falhar, a Vercel nao abre conexao direta como
fallback; esse comportamento evita uma avalanche de logins no banco.

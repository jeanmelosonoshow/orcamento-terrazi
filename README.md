# orcamento-terrazi
# atualizacao

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
- `DB_CHARSET_FB`: codificacao principal, padrao `UTF8`; deve coincidir com a conexao usada no IBExpert
- `DB_CHARSET_FB_FALLBACK`: alternativa para consultas de cenario com texto legado, padrao `NONE`; use `OFF` para desativar

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

Os filtros escolhidos no painel (`:filiais` e `:vendedores`) podem ser
adicionados como refinamento. A condicao por categoria deve permanecer na
consulta para garantir o escopo de acesso.

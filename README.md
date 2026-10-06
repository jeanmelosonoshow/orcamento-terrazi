# orcamento-terrazi
# orcamento-sonoshow
# atualizacao
#inclusao do CRM

## Login Firebird via Redis

Na produção, o endpoint `api/login.js` usa o cache Redis sincronizado por uma
máquina Windows que tenha acesso ao Firebird. Configure na Vercel:

```text
FIREBIRD_CONNECTION_MODE=redis-only
KV_REST_API_URL=url-rest-do-upstash-redis
KV_REST_API_TOKEN=token-rest-do-upstash-redis
FIREBIRD_CACHE_TTL_SECONDS=3600
FIREBIRD_STALE_CACHE_TTL_SECONDS=86400
REDIS_CACHE_TIMEOUT_MS=1500
REDIS_CACHE_PREFIX=orcamento-terrazi
```

Se `FIREBIRD_CONNECTION_MODE` não for definido, a produção da Vercel usa
`redis-only`; ambientes locais e de preview mantêm o acesso direto ao Firebird.

### Sincronizador Windows

1. Copie `scripts/windows/env.local.example` para
   `%USERPROFILE%\orcamento-terrazi\env.local` ou para
   `scripts/windows/env.local`.
2. Execute `scripts/windows/proteger-senha-firebird.cmd`. A senha é solicitada
   duas vezes e salva protegida pelo DPAPI em
   `scripts/windows/secrets/firebird-password.dpapi`.
3. No `env.local`, informe somente o caminho em `DB_PASSWORD_FILE`; não grave
   `DB_PASSWORD_FB` nesse arquivo.
4. Execute `scripts/windows/sync-firebird-login-cache.cmd` com o mesmo usuário
   do Windows que criou o arquivo DPAPI.
5. Agende o `.cmd` de hora em hora no Agendador de Tarefas.

O sincronizador envia apenas funcionários ativos com login e senha web das
categorias `GR`, `SU`, `VD` e `DI`. O cache normal dura uma hora e a cópia stale
permanece por 24 horas por padrão.

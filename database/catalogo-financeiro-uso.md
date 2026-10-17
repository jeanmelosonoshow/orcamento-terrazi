# Catalogo financeiro remoto e assinado

O catalogo permite acrescentar operacoes financeiras comuns sem recompilar o Gateway. A aplicacao
nunca envia SQL: envia apenas `operation`, `idempotencyKey` e `data`. O Gateway baixa o manifesto,
confere a assinatura Ed25519 e interpreta somente `ensure`, `update` e `lookup`.

## 1. Estrutura do PostgreSQL

Execute `database/catalogo-financeiro.sql` no PostgreSQL de homologacao. O arquivo cria o cadastro,
o historico imutavel de publicacoes e a operacao inicial `ENSURE_ARCHITECT_SUPPLIER`.

## 2. Chaves de assinatura

Em uma maquina administrativa, execute:

```powershell
node scripts/generate-finance-catalog-keys.mjs
```

- Cadastre a chave privada na Vercel como `FINANCE_CATALOG_PRIVATE_KEY`, somente na homologacao.
- Copie somente a chave publica para o campo **Chave publica Ed25519** do Gateway.
- Nunca coloque a chave privada no Git, navegador, PostgreSQL ou computador do Gateway.

Crie tambem um segredo aleatorio diferente do HMAC das consultas:

- Vercel: `FINANCE_CATALOG_SYNC_SECRET`.
- Gateway: **Segredo de leitura do catalogo**, armazenado pelo DPAPI.

## 3. Configuracao unica do Gateway

- URL do catalogo financeiro:
  `https://orcamento-terrazi-git-homologacao-sono-show.vercel.app/api/catalogo-financeiro`
- Chave publica Ed25519: a chave publica gerada no passo anterior.
- Habilitar operacoes financeiras: `true`.
- Projeto autorizado para escrita: `orcamento-terrazi`.

O Gateway guarda automaticamente apenas uma copia assinada da ultima versao valida para continuar
operando durante uma indisponibilidade breve da Vercel. Essa copia nao e editada manualmente.

## 4. Publicacao inicial

Depois de entrar no CRM com um funcionario autorizado a gerenciar comissoes, abra o console do
navegador nessa mesma aba e execute:

```javascript
const usuario = JSON.parse(sessionStorage.getItem('usuarioLogado'));
await fetch('/api/catalogo-financeiro', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${usuario.sessionToken}`
  },
  body: JSON.stringify({ acao: 'publicar' })
}).then(resposta => resposta.json());
```

Cada publicacao cria uma nova versao, hash SHA-256, assinatura e registro do `idfuncionario`.

## 5. Novas operacoes

Uma nova operacao deve ser salva pela API administrativa e depois publicada. A definicao pode usar:

- `ensure`: localiza pela chave e insere somente quando nao existe;
- `update`: atualiza somente um registro localizado pela chave declarada;
- `lookup`: consulta somente a situacao declarada;
- identidade `max_plus_one` ou `generator`;
- tipos `text`, `digits`, `cpf`, `integer`, `decimal` e `date`.

SQL, procedures, nomes recebidos do navegador e campos nao declarados sao rejeitados. Para o
`PAGAR`, a operacao devera usar uma chave natural unica da comissao para que repeticoes por timeout
retornem o mesmo titulo em vez de inserir outro.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('migracao cria fila de fornecedor e inclui arquitetos ativos existentes', async () => {
    const sql = await readFile(new URL('../database/fornecedor-arquiteto.sql', import.meta.url), 'utf8');

    assert.match(sql, /ADD COLUMN IF NOT EXISTS firebird_idfornecedor BIGINT/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS fila_sincronizacao_fornecedor_arquiteto/i);
    assert.match(sql, /UNIQUE \(arquiteto_id\)/i);
    assert.match(sql, /INSERT INTO fila_sincronizacao_fornecedor_arquiteto/i);
    assert.match(sql, /FROM arquiteto a[\s\S]*a\.ativo = TRUE/i);
    assert.match(sql, /ON CONFLICT \(arquiteto_id\) DO NOTHING/i);
});

test('cadastro agenda fornecedor na mesma transacao quando a estrutura existe', async () => {
    const api = await readFile(new URL('../api/arquitetos.js', import.meta.url), 'utf8');

    assert.match(api, /BEGIN[\s\S]*agendarFornecedorSeDisponivel[\s\S]*COMMIT/i);
    assert.match(api, /to_regclass\('public\.fila_sincronizacao_fornecedor_arquiteto'\)/i);
    assert.match(api, /client\.release\(\)/i);
});

test('bordero so prepara PAGAR depois de confirmar o fornecedor', async () => {
    const api = await readFile(new URL('../api/comissoes-arquiteto.js', import.meta.url), 'utf8');
    const bloco = api.slice(api.indexOf('async function prepararLote'), api.indexOf('export default async function handler'));

    assert.match(bloco, /agendarSincronizacaoFornecedor/i);
    assert.match(bloco, /firebird_idfornecedor IS NOT NULL/i);
    assert.equal((bloco.match(/INSERT INTO fila_sincronizacao_pagamento_arquiteto/g) || []).length, 1);
});

test('sincronizador rejeita resposta atrasada para CPF alterado', async () => {
    const api = await readFile(new URL('../api/sincronizar-fornecedores-arquiteto.js', import.meta.url), 'utf8');

    assert.match(api, /SUPPLIER_SYNC_SECRET/);
    assert.doesNotMatch(api, /process\.env\.CRON_SECRET/);
    assert.match(api, /cpf_fornecedor = \$4[\s\S]*status_fila = 'PROCESSANDO'/i);
    assert.match(api, /WHERE id = \$1[\s\S]*cpf = \$3/i);
    assert.match(api, /FOR UPDATE SKIP LOCKED/i);
    assert.match(api, /tentativas < 10/i);
});

test('cliente financeiro assina somente o comando autorizado de fornecedor', async () => {
    const client = await readFile(new URL('../lib/firebird-finance-gateway-client.js', import.meta.url), 'utf8');

    assert.match(client, /const path = '\/finance\/commands'/);
    assert.match(client, /'ENSURE_ARCHITECT_SUPPLIER'/);
    assert.match(client, /`FORNECEDOR:CPF:/);
    assert.match(client, /createHmac\('sha256'/);
    assert.doesNotMatch(client, /\bsql\b/i);
});

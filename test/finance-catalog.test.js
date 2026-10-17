import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assinarManifesto, jsonCanonico, validarDefinicaoOperacao } from '../lib/finance-catalog.js';

const definicaoFornecedor = {
    kind: 'ensure',
    table: 'FORNECEDOR',
    identity: { column: 'IDFORNECEDOR', strategy: 'max_plus_one' },
    idempotency: { template: 'FORNECEDOR:CPF:{cpf}' },
    match: [{ column: 'CGC', source: 'cpf', type: 'cpf', variants: ['digits', 'cpf_formatted'] }],
    fields: [
        { column: 'NOMEFORNECEDOR', source: 'name', type: 'text', maxLength: 60 },
        { column: 'CGC', source: 'cpf', type: 'cpf' }
    ],
    result: { idColumn: 'IDFORNECEDOR' }
};

test('catalogo aceita operacao estrutural e rejeita qualquer SQL', () => {
    assert.equal(validarDefinicaoOperacao(definicaoFornecedor).definicao.table, 'FORNECEDOR');
    assert.throws(() => validarDefinicaoOperacao({ ...definicaoFornecedor, sql: 'DELETE FROM FORNECEDOR' }), /SQL/i);
    assert.throws(() => validarDefinicaoOperacao({ ...definicaoFornecedor, table: 'FORNECEDOR;DELETE' }), /Tabela/i);
});

test('manifesto canonico recebe assinatura Ed25519 verificavel', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const manifesto = { schemaVersion: 1, catalogVersion: 1, operations: { ENSURE_ARCHITECT_SUPPLIER: definicaoFornecedor } };
    const assinado = assinarManifesto(manifesto, privateKey);
    assert.equal(assinado.hash, crypto.createHash('sha256').update(jsonCanonico(manifesto)).digest('hex'));
    assert.equal(crypto.verify(null, Buffer.from(assinado.canonical), publicKey, Buffer.from(assinado.assinatura, 'base64')), true);
});

test('migracao e API mantem versoes publicadas e auditoria do funcionario', async () => {
    const sql = await readFile(new URL('../database/catalogo-financeiro.sql', import.meta.url), 'utf8');
    const api = await readFile(new URL('../api/catalogo-financeiro.js', import.meta.url), 'utf8');
    const client = await readFile(new URL('../lib/firebird-finance-gateway-client.js', import.meta.url), 'utf8');

    assert.match(sql, /CREATE TABLE IF NOT EXISTS catalogo_operacao_financeira/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS versao_catalogo_financeiro/i);
    assert.match(sql, /ENSURE_ARCHITECT_SUPPLIER/);
    assert.match(api, /FINANCE_CATALOG_PRIVATE_KEY/);
    assert.match(api, /FINANCE_CATALOG_SYNC_SECRET/);
    assert.match(api, /architectCommissionManager/);
    assert.match(api, /idfuncionario_publicacao/);
    assert.match(api, /FINANCE_CATALOG_PRIVATE_KEY_MISSING/);
    assert.match(api, /FINANCE_CATALOG_PRIVATE_KEY_INVALID/);
    assert.match(api, /FINANCE_CATALOG_SCHEMA_MISSING/);
    assert.match(api, /FINANCE_CATALOG_SCHEMA_OUTDATED/);
    assert.match(client, /\/finance\/commands/);
    assert.doesNotMatch(client, /\/finance\/suppliers\/ensure/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregar() {
    const codigo = await readFile(new URL('../public/assets/charts/relationship-query.js', import.meta.url), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(codigo, sandbox);
    return sandbox.window.CRM_RELATIONSHIP_QUERY;
}

test('planeja filtro antecipado com chaves compostas sem cruzar filiais', async () => {
    const motor = await carregar();
    const plano = motor.planejar(
        { alias: 'vendas', sql: 'SELECT * FROM SAIDA' },
        {
            alias: 'DADOS ORCAMENTO',
            dados: [
                { IDFILIAL: 26, NUMEROSAIDA: 100 },
                { IDFILIAL: 27, NUMEROSAIDA: 100 },
                { IDFILIAL: 26, NUMEROSAIDA: 100 }
            ]
        },
        [
            { chavePrincipal: 'IDFILIAL', chaveSecundaria: 'IDFILIAL' },
            { chavePrincipal: 'NUMEROSAIDA', chaveSecundaria: 'NUMEROSAIDA' }
        ]
    );

    assert.equal(plano.lotes.length, 1);
    assert.deepEqual(Array.from(plano.lotes[0].linhas, linha => Array.from(linha)), [[26, 100], [27, 100]]);
});

test('agrupa execucoes por valores de campos virtuais usados no SQL', async () => {
    const motor = await carregar();
    const plano = motor.planejar(
        {
            alias: 'vendas',
            sql: `/* RELACIONAR | apelido: orc | consulta: "DADOS ORCAMENTO" */
                  SELECT CASE WHEN /* orc.IDFILIAL */ = '02' THEN 1 ELSE 0 END, IDFILIAL, NUMEROSAIDA FROM SAIDA`
        },
        {
            alias: 'DADOS ORCAMENTO',
            dados: [
                { IDFILIAL: '01', NUMEROSAIDA: 10 },
                { IDFILIAL: '02', NUMEROSAIDA: 20 }
            ]
        },
        [
            { chavePrincipal: 'IDFILIAL', chaveSecundaria: 'IDFILIAL' },
            { chavePrincipal: 'NUMEROSAIDA', chaveSecundaria: 'NUMEROSAIDA' }
        ]
    );

    assert.equal(plano.lotes.length, 2);
    assert.deepEqual(
        Array.from(plano.lotes, lote => lote.virtuais['orc.IDFILIAL']).sort(),
        ['01', '02']
    );
});

test('rejeita campo virtual ambiguo para a mesma chave', async () => {
    const motor = await carregar();
    assert.throws(() => motor.planejar(
        {
            sql: `/* RELACIONAR | apelido: orc | consulta: principal */
                  SELECT /* orc.CLIENTE */ AS CLIENTE, ID FROM TABELA`
        },
        {
            alias: 'principal',
            dados: [{ ID: 1, CLIENTE: 'Ana' }, { ID: 1, CLIENTE: 'Bia' }]
        },
        [{ chavePrincipal: 'ID', chaveSecundaria: 'ID' }]
    ), /chave composta/i);
});

test('divide uma quantidade grande de chaves em lotes', async () => {
    const motor = await carregar();
    const plano = motor.planejar(
        { sql: 'SELECT ID FROM TABELA' },
        { alias: 'principal', dados: Array.from({ length: 401 }, (_, indice) => ({ ID: indice + 1 })) },
        [{ chavePrincipal: 'ID', chaveSecundaria: 'ID' }],
        200
    );
    assert.deepEqual(Array.from(plano.lotes, lote => lote.linhas.length), [200, 200, 1]);
});

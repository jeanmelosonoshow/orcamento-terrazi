import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverFiltroRelacionamento, sqlPossuiFiltroRelacionamento } from '../lib/contact-relationship-filter.js';

test('reconhece somente a diretiva valida de relacionamento', () => {
    assert.equal(sqlPossuiFiltroRelacionamento('/* relacionamento | campo: V.DOCTOCLIENTE */'), true);
    assert.equal(sqlPossuiFiltroRelacionamento('SELECT V.DOCTOCLIENTE FROM VENDAS V'), false);
});

test('padrao pendente inclui clientes sem contato e exclui registros finalizados', async () => {
    const chamadas = [];
    const db = { query: async (sql, valores) => {
        chamadas.push({ sql, valores });
        return { rows: [{ doctocliente: '123' }] };
    } };
    const resultado = await resolverFiltroRelacionamento(db, {
        contextoDashboard: 'clientes',
        statusContato: ['PENDENTE', 'AGUARDANDO RETORNO'],
        tiposContato: ['SEM CONTATO', 'WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM']
    });

    assert.deepEqual(resultado, { modo: 'excluir', documentos: ['123'] });
    assert.match(chamadas[0].sql, /WHERE NOT \(/);
});

test('status finalizado inclui somente documentos encontrados no Postgres', async () => {
    const db = { query: async () => ({ rows: [{ doctocliente: '456' }] }) };
    const resultado = await resolverFiltroRelacionamento(db, {
        contextoDashboard: 'clientes',
        statusContato: ['FINALIZADO'],
        tiposContato: ['WHATSAPP'],
        dataContatoInicial: '2026-08-01'
    });

    assert.deepEqual(resultado, { modo: 'incluir', documentos: ['456'] });
});

test('fora da Carteira a diretiva nao restringe os dados', async () => {
    let executou = false;
    const db = { query: async () => { executou = true; return { rows: [] }; } };
    const resultado = await resolverFiltroRelacionamento(db, { contextoDashboard: 'geral' });

    assert.deepEqual(resultado, { modo: 'todos', documentos: [] });
    assert.equal(executou, false);
});

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

test('reutiliza o filtro de relacionamento entre cards com a mesma selecao', async () => {
    let consultas = 0;
    const db = { query: async () => {
        consultas += 1;
        return { rows: [{ doctocliente: '789' }] };
    } };
    const itens = new Map();
    const cache = {
        obter: async chave => itens.get(chave) || null,
        definir: async (chave, item) => itens.set(chave, item)
    };
    const filtros = {
        contextoDashboard: 'clientes',
        statusContato: ['FINALIZADO'],
        tiposContato: ['WHATSAPP']
    };

    const primeiro = await resolverFiltroRelacionamento(db, filtros, { cache, ttlMs: 60000 });
    const segundo = await resolverFiltroRelacionamento(db, filtros, { cache, ttlMs: 60000 });

    assert.equal(consultas, 1);
    assert.equal(primeiro.cache, 'MISS');
    assert.equal(segundo.cache, 'HIT');
    assert.deepEqual(segundo.documentos, ['789']);
});

test('nova versao de relacionamento ignora o cache anterior', async () => {
    let consultas = 0;
    const db = { query: async () => ({ rows: [{ doctocliente: String(++consultas) }] }) };
    const itens = new Map();
    const cache = {
        obter: async chave => itens.get(chave) || null,
        definir: async (chave, item) => itens.set(chave, item)
    };
    const base = {
        contextoDashboard: 'clientes', statusContato: ['FINALIZADO'], tiposContato: ['EMAIL']
    };

    const primeiro = await resolverFiltroRelacionamento(db, { ...base, versaoRelacionamento: '1' }, { cache });
    const segundo = await resolverFiltroRelacionamento(db, { ...base, versaoRelacionamento: '2' }, { cache });

    assert.equal(consultas, 2);
    assert.notDeepEqual(primeiro.documentos, segundo.documentos);
});

test('consultas simultaneas com o mesmo filtro compartilham a leitura do Postgres', async () => {
    let consultas = 0;
    const db = { query: async () => {
        consultas += 1;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { rows: [{ doctocliente: '999' }] };
    } };
    const cache = { obter: async () => null, definir: async () => {} };
    const filtros = {
        contextoDashboard: 'clientes', statusContato: ['FINALIZADO'], tiposContato: ['SMS'], versaoRelacionamento: 'concorrente'
    };

    const [primeiro, segundo] = await Promise.all([
        resolverFiltroRelacionamento(db, filtros, { cache }),
        resolverFiltroRelacionamento(db, filtros, { cache })
    ]);

    assert.equal(consultas, 1);
    assert.deepEqual(primeiro.documentos, ['999']);
    assert.deepEqual(segundo.documentos, ['999']);
    assert.equal(new Set([primeiro.cache, segundo.cache]).has('COALESCED'), true);
});

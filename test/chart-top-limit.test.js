import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('../public/crm.js', import.meta.url);

async function carregarFuncoesTop() {
    const source = await readFile(dashboardPath, 'utf8');
    const inicio = source.indexOf('function normalizarLimiteTopGrafico');
    const fim = source.indexOf('function obterApelidoMapeamento', inicio);
    assert.ok(inicio >= 0 && fim > inicio, 'Funcoes de limite Top nao encontradas.');
    return Function(
        source.slice(inicio, fim) + '; return { normalizarLimiteTopGrafico, ordenarELimitarTopGrafico };'
    )();
}

test('limite Top mantem os maiores resultados agregados', async () => {
    const { ordenarELimitarTopGrafico } = await carregarFuncoesTop();
    const grupos = [
        { produto: 'A', quantidade: 5 },
        { produto: 'B', quantidade: 18 },
        { produto: 'C', quantidade: 11 },
        { produto: 'D', quantidade: 7 }
    ];

    const resultado = ordenarELimitarTopGrafico(grupos, 2, grupo => grupo.quantidade);

    assert.deepEqual(resultado.map(grupo => grupo.produto), ['B', 'C']);
});

test('limite Top vazio preserva todos os resultados e a ordem existente', async () => {
    const { ordenarELimitarTopGrafico } = await carregarFuncoesTop();
    const grupos = [{ produto: 'A', total: 1 }, { produto: 'B', total: 9 }];

    assert.equal(ordenarELimitarTopGrafico(grupos, '', grupo => grupo.total), grupos);
    assert.equal(ordenarELimitarTopGrafico(grupos, 0, grupo => grupo.total), grupos);
});

test('limite Top e normalizado como inteiro entre 1 e 1000', async () => {
    const { normalizarLimiteTopGrafico } = await carregarFuncoesTop();

    assert.equal(normalizarLimiteTopGrafico(10.9), 10);
    assert.equal(normalizarLimiteTopGrafico(5000), 1000);
    assert.equal(normalizarLimiteTopGrafico(-2), 0);
    assert.equal(normalizarLimiteTopGrafico('invalido'), 0);
});
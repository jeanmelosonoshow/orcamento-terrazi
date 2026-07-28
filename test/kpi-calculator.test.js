import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregarCalculadora() {
    const fonte = await readFile(new URL('../public/assets/charts/kpi-calculator.js', import.meta.url), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(fonte, sandbox);
    return sandbox.window.CRM_KPI_CALCULATOR;
}

test('calcula expressoes entre KPIs respeitando precedencia e parenteses', async () => {
    const calculadora = await carregarCalculadora();
    assert.equal(calculadora.avaliar('[realizado] / [meta] * 100', { realizado: 80, meta: 100 }), 80);
    assert.equal(calculadora.avaliar('([receita] - [custo]) / [receita] * 100', { receita: 250, custo: 100 }), 60);
    assert.equal(calculadora.avaliar('2 + 3 * 4'), 14);
    assert.equal(calculadora.avaliar('(2 + 3) * 4'), 20);
    assert.equal(calculadora.avaliar('2 ^ 3 ^ 2'), 512);
});

test('aceita decimal com virgula e extrai referencias sem duplicar', async () => {
    const calculadora = await carregarCalculadora();
    assert.equal(calculadora.avaliar('[ticket] * 1,5', { ticket: 10 }), 15);
    assert.deepEqual(Array.from(calculadora.extrairReferencias('[a] + [b] - [a]')), ['a', 'b']);
});

test('rejeita divisao por zero, referencias ausentes e codigo arbitrario', async () => {
    const calculadora = await carregarCalculadora();
    assert.throws(() => calculadora.avaliar('[a] / 0', { a: 10 }), /dividir por zero/i);
    assert.throws(() => calculadora.avaliar('[ausente] + 1', {}), /nao encontrado/i);
    assert.throws(() => calculadora.avaliar('window.alert(1)', {}), /somente numeros/i);
});

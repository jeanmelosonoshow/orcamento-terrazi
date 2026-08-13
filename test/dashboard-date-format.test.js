import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('../public/crm.js', import.meta.url);

async function carregarFormatador() {
    const source = await readFile(dashboardPath, 'utf8');
    const inicio = source.indexOf('function converterDataDimensao');
    const fim = source.indexOf('function formatarValorGrafico', inicio);
    assert.ok(inicio >= 0 && fim > inicio, 'Formatador de data nao encontrado.');
    return Function(`${source.slice(inicio, fim)}; return formatarDimensao;`)();
}

async function carregarDataLocalContato() {
    const source = await readFile(dashboardPath, 'utf8');
    const inicio = source.indexOf('function dataLocalContato');
    const fim = source.indexOf('function aplicarFiltrosContatoRegistros', inicio);
    assert.ok(inicio >= 0 && fim > inicio, 'Conversor de data de contato nao encontrado.');
    return Function(`${source.slice(inicio, fim)}; return dataLocalContato;`)();
}

test('formato de data preserva o dia civil retornado pelo banco em Sao Paulo', async () => {
    const timezoneAnterior = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
        const formatar = await carregarFormatador();
        assert.equal(formatar('2026-07-01T00:00:00.000Z', 'day'), '01/07/2026');
        assert.equal(formatar('2026-07-01', 'day'), '01/07/2026');
        assert.equal(formatar('01/07/2026', 'day'), '01/07/2026');
        assert.equal(formatar('2026-07-01T00:00:00.000Z', 'year'), '2026');
        assert.equal(formatar('2026-07-01T00:00:00.000Z', 'quarter'), '3o tri/2026');
    } finally {
        if (timezoneAnterior === undefined) delete process.env.TZ;
        else process.env.TZ = timezoneAnterior;
    }
});

test('timestamp do PostgreSQL respeita o dia local de Sao Paulo', async () => {
    const timezoneAnterior = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
        const formatar = await carregarFormatador();
        assert.equal(formatar('2026-08-13T02:15:00.000Z', 'day'), '12/08/2026');
        assert.equal(formatar('2027-01-01T02:30:00.000Z', 'year'), '2026');
        assert.equal(formatar('2026-08-12T15:00:00.000-03:00', 'day'), '12/08/2026');
    } finally {
        if (timezoneAnterior === undefined) delete process.env.TZ;
        else process.env.TZ = timezoneAnterior;
    }
});

test('filtro de relacionamento compara a atualizacao pelo dia de Sao Paulo', async () => {
    const dataLocalContato = await carregarDataLocalContato();
    assert.equal(dataLocalContato('2026-08-13T02:15:00.000Z'), '2026-08-12');
    assert.equal(dataLocalContato('2026-08-12T15:00:00.000-03:00'), '2026-08-12');
});

test('valor sem formato de data permanece inalterado', async () => {
    const formatar = await carregarFormatador();
    assert.equal(formatar('2026-07-01T00:00:00.000Z', 'none'), '2026-07-01T00:00:00.000Z');
    assert.equal(formatar('nao e data', 'day'), 'nao e data');
});

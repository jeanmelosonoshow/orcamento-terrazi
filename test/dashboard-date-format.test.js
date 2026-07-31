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

test('valor sem formato de data permanece inalterado', async () => {
    const formatar = await carregarFormatador();
    assert.equal(formatar('2026-07-01T00:00:00.000Z', 'none'), '2026-07-01T00:00:00.000Z');
    assert.equal(formatar('nao e data', 'day'), 'nao e data');
});

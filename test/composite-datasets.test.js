import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
async function carregarModulos() { const calculadora = await readFile(new URL('../public/assets/charts/kpi-calculator.js', import.meta.url), 'utf8'); const combinador = await readFile(new URL('../public/assets/charts/composite-datasets.js', import.meta.url), 'utf8'); const sandbox = { window: {} }; vm.runInNewContext(calculadora, sandbox); vm.runInNewContext(combinador, sandbox); return sandbox.window; }
test('combina resultados unicos de dois bancos e calcula novo campo', async () => { const m = await carregarModulos(); const r = m.CRM_COMPOSITE_DATASETS.combinar([{ alias: 'vendas', colunas: ['TOTAL'], dados: [{ TOTAL: 800 }] }, { alias: 'metas', colunas: ['META'], dados: [{ META: 1000 }] }], { modo: 'single' }, [{ nome: 'ATINGIMENTO', formula: '[vendas.TOTAL] / [metas.META] * 100' }], m.CRM_KPI_CALCULATOR.avaliar); assert.deepEqual(Array.from(r.colunas), ['vendas.TOTAL', 'metas.META', 'ATINGIMENTO']); assert.equal(r.dados[0].ATINGIMENTO, 80); });
test('relaciona relatorios por chaves explicitamente definidas', async () => { const m = await carregarModulos(); const r = m.CRM_COMPOSITE_DATASETS.combinar([{ alias: 'fb', colunas: ['IDFILIAL', 'VENDA'], dados: [{ IDFILIAL: '01', VENDA: 500 }] }, { alias: 'pg', colunas: ['FILIAL', 'META'], dados: [{ FILIAL: '01', META: 400 }] }], { modo: 'key', chavePrincipal: 'IDFILIAL', chaveSecundaria: 'FILIAL' }, [], m.CRM_KPI_CALCULATOR.avaliar); assert.equal(r.dados[0]['fb.VENDA'], 500); assert.equal(r.dados[0]['pg.META'], 400); });
test('rejeita chave duplicada para impedir multiplicacao silenciosa', async () => { const m = await carregarModulos(); assert.throws(() => m.CRM_COMPOSITE_DATASETS.combinar([{ alias: 'fb', colunas: ['ID'], dados: [{ ID: 1 }] }, { alias: 'pg', colunas: ['ID'], dados: [{ ID: 1 }, { ID: 1 }] }], { modo: 'key', chavePrincipal: 'ID', chaveSecundaria: 'ID' }, [], m.CRM_KPI_CALCULATOR.avaliar), /duplicados/i); });


test('normaliza tipos diferentes na chave entre bancos', async () => { const m = await carregarModulos(); const r = m.CRM_COMPOSITE_DATASETS.combinar([{ alias: 'fb', colunas: ['ID'], dados: [{ ID: 19 }] }, { alias: 'pg', colunas: ['ID'], dados: [{ ID: '19' }] }], { modo: 'key', chavePrincipal: 'ID', chaveSecundaria: 'ID' }, [], m.CRM_KPI_CALCULATOR.avaliar); assert.equal(r.dados[0]['pg.ID'], '19'); });

test('mantem colunas vazias quando cliente ainda nao existe no Postgres', async () => {
    const m = await carregarModulos();
    const r = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'firebird', colunas: ['DOCTOCLIENTE', 'NOME_CLIENTE'], dados: [{ DOCTOCLIENTE: '123', NOME_CLIENTE: 'Maria' }] },
        { alias: 'contato', colunas: ['DOCTOCLIENTE', 'STATUS_CONTATO'], dados: [] }
    ], { modo: 'key', chavePrincipal: 'DOCTOCLIENTE', chaveSecundaria: 'DOCTOCLIENTE' }, [], m.CRM_KPI_CALCULATOR.avaliar);
    assert.equal(r.dados[0]['contato.DOCTOCLIENTE'], null);
    assert.equal(r.dados[0]['contato.STATUS_CONTATO'], null);
});

test('editor expoe consultas compostas e campos calculados', async () => { const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8'); const script = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8'); assert.match(html, /data-add-secondary-query/); assert.match(html, /data-query-combination-mode/); assert.match(html, /data-add-calculated-field/); assert.match(html, /composite-datasets.js/); assert.match(script, /consultas: consultasEditor/); assert.match(script, /camposCalculados: calculado/); });
test('une linhas de varias consultas com as mesmas colunas para graficos', async () => {
    const m = await carregarModulos();
    const resultado = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'vendas', colunas: ['DIMENSAO', 'TOTAL'], dados: [{ DIMENSAO: 'Loja', TOTAL: 10 }] },
        { alias: 'servicos', colunas: ['dimensao', 'total'], dados: [{ dimensao: 'Servico', total: 7 }] },
        { alias: 'outros', colunas: ['DIMENSAO', 'TOTAL'], dados: [{ DIMENSAO: 'Outros', TOTAL: 3 }] }
    ], { modo: 'union' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.deepEqual(Array.from(resultado.colunas), ['DIMENSAO', 'TOTAL']);
    assert.deepEqual(JSON.parse(JSON.stringify(resultado.dados)), [
        { DIMENSAO: 'Loja', TOTAL: 10 },
        { DIMENSAO: 'Servico', TOTAL: 7 },
        { DIMENSAO: 'Outros', TOTAL: 3 }
    ]);
});

test('editor permite varias consultas secundarias e oferece uniao de linhas', async () => {
    const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8');
    const script = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');

    assert.match(html, /data-secondary-queries/);
    assert.match(html, /value="union">Unir linhas das consultas/);
    assert.match(script, /querySelectorAll\('\[data-secondary-query-row\]'\)/);
    assert.match(script, /renderizarConsultasSecundarias\(consultasWidget\.slice\(1\)\)/);
    assert.doesNotMatch(script, /Promise\.all\(consultas\.map/);
});

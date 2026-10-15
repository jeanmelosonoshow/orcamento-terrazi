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

test('inner join sequencial retorna apenas registros com correspondencia', async () => {
    const m = await carregarModulos();
    const r = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'orcamento', colunas: ['ID', 'CLIENTE'], dados: [{ ID: 1, CLIENTE: 'Ana' }, { ID: 2, CLIENTE: 'Bia' }] },
        { alias: 'venda', colunas: ['ORCAMENTO_ID', 'VALOR'], dados: [{ ORCAMENTO_ID: '2', VALOR: 900 }], join: { tipo: 'inner', chavePrincipal: 'ID', chaveSecundaria: 'ORCAMENTO_ID' } }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.equal(r.dados.length, 1);
    assert.equal(r.dados[0]['orcamento.CLIENTE'], 'Bia');
    assert.equal(r.dados[0]['venda.VALOR'], 900);
});

test('aplica inner e left join na ordem das consultas cadastradas', async () => {
    const m = await carregarModulos();
    const r = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'orcamento', colunas: ['ID'], dados: [{ ID: 1 }, { ID: 2 }, { ID: 3 }] },
        { alias: 'venda', colunas: ['ORCAMENTO_ID', 'VALOR'], dados: [{ ORCAMENTO_ID: 1, VALOR: 100 }, { ORCAMENTO_ID: 2, VALOR: 200 }], join: { tipo: 'inner', chavePrincipal: 'ID', chaveSecundaria: 'ORCAMENTO_ID' } },
        { alias: 'entrega', colunas: ['PEDIDO_ID', 'STATUS'], dados: [{ PEDIDO_ID: 2, STATUS: 'Enviado' }], join: { tipo: 'left', chavePrincipal: 'ID', chaveSecundaria: 'PEDIDO_ID' } }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.equal(r.dados.length, 2);
    assert.equal(r.dados[0]['entrega.STATUS'], null);
    assert.equal(r.dados[1]['entrega.STATUS'], 'Enviado');
});

test('relaciona por chave composta quando o numero se repete entre filiais', async () => {
    const m = await carregarModulos();
    const campos = [
        { chavePrincipal: 'IDFILIAL', chaveSecundaria: 'idfilial' },
        { chavePrincipal: 'NUMEROSAIDA', chaveSecundaria: 'numerosaida' }
    ];
    const r = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'firebird', colunas: ['IDFILIAL', 'NUMEROSAIDA'], dados: [{ IDFILIAL: 26, NUMEROSAIDA: 100 }, { IDFILIAL: 27, NUMEROSAIDA: 100 }] },
        { alias: 'postgres', colunas: ['idfilial', 'numerosaida', 'orcamento_id'], dados: [{ idfilial: 26, numerosaida: 100, orcamento_id: 501 }, { idfilial: 27, numerosaida: 100, orcamento_id: 777 }], join: { tipo: 'inner', campos } }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.equal(r.dados.length, 2);
    assert.equal(r.dados[0]['postgres.orcamento_id'], 501);
    assert.equal(r.dados[1]['postgres.orcamento_id'], 777);
});

test('preserva cardinalidade um para muitos como um inner join SQL', async () => {
    const m = await carregarModulos();
    const campos = [
        { chavePrincipal: 'idfilial', chaveSecundaria: 'IDFILIAL' },
        { chavePrincipal: 'numerosaida', chaveSecundaria: 'NUMEROSAIDA' }
    ];
    const r = m.CRM_COMPOSITE_DATASETS.combinar([
        {
            alias: 'orcamento',
            colunas: ['idfilial', 'numerosaida', 'orcamento_id'],
            dados: [{ idfilial: 26, numerosaida: 100, orcamento_id: 501 }]
        },
        {
            alias: 'venda',
            colunas: ['IDFILIAL', 'NUMEROSAIDA', 'SITUACAO_ENTREGA'],
            dados: [
                { IDFILIAL: 26, NUMEROSAIDA: 100, SITUACAO_ENTREGA: 'EM TRANSITO' },
                { IDFILIAL: 26, NUMEROSAIDA: 100, SITUACAO_ENTREGA: 'ENTREGA REALIZADA' }
            ],
            join: { tipo: 'inner', campos }
        }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.equal(r.dados.length, 2);
    assert.deepEqual(
        Array.from(r.dados, linha => linha['venda.SITUACAO_ENTREGA']),
        ['EM TRANSITO', 'ENTREGA REALIZADA']
    );
    assert.ok(r.dados.every(linha => linha['orcamento.orcamento_id'] === 501));
});

test('inner join mantem o mesmo conjunto ao inverter os lados de uma relacao um para muitos', async () => {
    const m = await carregarModulos();
    const orcamentos = [{ IDFILIAL: 26, NUMEROSAIDA: 100, ORCAMENTO_ID: 501 }];
    const vendas = [
        { IDFILIAL: 26, NUMEROSAIDA: 100, STATUS: 'PENDENTE' },
        { IDFILIAL: 26, NUMEROSAIDA: 100, STATUS: 'ENTREGUE' }
    ];
    const campos = [
        { chavePrincipal: 'IDFILIAL', chaveSecundaria: 'IDFILIAL' },
        { chavePrincipal: 'NUMEROSAIDA', chaveSecundaria: 'NUMEROSAIDA' }
    ];
    const direto = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'orcamento', colunas: ['IDFILIAL', 'NUMEROSAIDA', 'ORCAMENTO_ID'], dados: orcamentos },
        { alias: 'venda', colunas: ['IDFILIAL', 'NUMEROSAIDA', 'STATUS'], dados: vendas, join: { tipo: 'inner', campos } }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);
    const inverso = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'venda', colunas: ['IDFILIAL', 'NUMEROSAIDA', 'STATUS'], dados: vendas },
        { alias: 'orcamento', colunas: ['IDFILIAL', 'NUMEROSAIDA', 'ORCAMENTO_ID'], dados: orcamentos, join: { tipo: 'inner', campos } }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.equal(direto.dados.length, 2);
    assert.equal(inverso.dados.length, 2);
    assert.deepEqual(
        Array.from(direto.dados, linha => linha['venda.STATUS']).sort(),
        Array.from(inverso.dados, linha => linha['venda.STATUS']).sort()
    );
});

test('multiplica correspondencias de ambos os lados como um join SQL muitos para muitos', async () => {
    const m = await carregarModulos();
    const r = m.CRM_COMPOSITE_DATASETS.combinar([
        { alias: 'a', colunas: ['ID', 'A'], dados: [{ ID: 1, A: 'A1' }, { ID: 1, A: 'A2' }] },
        { alias: 'b', colunas: ['ID', 'B'], dados: [{ ID: 1, B: 'B1' }, { ID: 1, B: 'B2' }], join: { tipo: 'inner', campos: [{ chavePrincipal: 'ID', chaveSecundaria: 'ID' }] } }
    ], { modo: 'joins' }, [], m.CRM_KPI_CALCULATOR.avaliar);

    assert.equal(r.dados.length, 4);
    assert.deepEqual(
        Array.from(r.dados, linha => linha['a.A'] + '/' + linha['b.B']),
        ['A1/B1', 'A1/B2', 'A2/B1', 'A2/B2']
    );
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
    assert.match(html, /value="joins">Relacionar consultas em sequência/);
    assert.match(script, /querySelectorAll\('\[data-secondary-query-row\]'\)/);
    assert.match(script, /data-secondary-join-type/);
    assert.match(script, /data-secondary-primary-key/);
    assert.match(script, /data-secondary-join-key/);
    assert.match(script, /data-add-secondary-join-field/);
    assert.match(script, /data-remove-secondary-join-field/);
    assert.match(script, /preencherCamposJoinsSequenciais/);
    assert.match(script, /renderizarConsultasSecundarias\(consultasWidget\.slice\(1\)\)/);
    assert.doesNotMatch(script, /Promise\.all\(consultas\.map/);
});

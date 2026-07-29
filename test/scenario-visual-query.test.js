import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarVisualizacaoEmMemoria, prepararConsultaVisual } from '../lib/scenario-visual-query.js';

test('executa COUNT DISTINCT no banco mesmo sem dimensao', () => {
    const preparado = prepararConsultaVisual(
        { sql: 'SELECT TOTAL_PRODUTO FROM VENDAS', valores: [] },
        'firebird',
        {
            agrupar: true,
            dimensoes: [],
            valores: [{ coluna: 'TOTAL_PRODUTO', agregacao: 'count_distinct' }]
        }
    );

    assert.equal(
        preparado.sql,
        'SELECT COUNT(DISTINCT CRM_BASE."TOTAL_PRODUTO") AS "TOTAL_PRODUTO" FROM (SELECT TOTAL_PRODUTO FROM VENDAS) CRM_BASE'
    );
    assert.doesNotMatch(preparado.sql, /GROUP BY/);
});

test('mantem agrupamento quando existe dimensao', () => {
    const preparado = prepararConsultaVisual(
        { sql: 'SELECT IDFILIAL, SUBTOTAL FROM VENDAS', valores: [] },
        'firebird',
        {
            agrupar: true,
            dimensoes: [{ coluna: 'IDFILIAL' }],
            valores: [{ coluna: 'SUBTOTAL', agregacao: 'sum' }]
        }
    );

    assert.match(preparado.sql, /SUM\(CRM_BASE\."SUBTOTAL"\)/);
    assert.match(preparado.sql, /GROUP BY CRM_BASE\."IDFILIAL"/);
});

test('nao envolve EXECUTE BLOCK em uma subconsulta', () => {
    const sql = 'EXECUTE BLOCK RETURNS (TOTAL INTEGER) AS BEGIN TOTAL = 1; SUSPEND; END';
    const preparado = prepararConsultaVisual(
        { sql, valores: [] },
        'firebird',
        {
            agrupar: true,
            valores: [{ coluna: 'TOTAL', agregacao: 'count_distinct' }]
        }
    );

    assert.equal(preparado.sql, sql);
    assert.equal(preparado.agregarEmMemoria, true);
});

test('aplica SUM ao retorno de varias linhas de EXECUTE BLOCK', () => {
    const resultado = aplicarVisualizacaoEmMemoria(
        [
            { IDFILIAL: '01', META_EXIBIDA: 100 },
            { IDFILIAL: '02', META_EXIBIDA: 250 },
            { IDFILIAL: '03', META_EXIBIDA: 150 }
        ],
        {
            agrupar: true,
            valores: [{ coluna: 'META_EXIBIDA', agregacao: 'sum' }]
        }
    );

    assert.deepEqual(resultado, [{ META_EXIBIDA: 500 }]);
});

test('agrupa, soma, filtra e ordena o retorno de EXECUTE BLOCK', () => {
    const resultado = aplicarVisualizacaoEmMemoria(
        [
            { IDFILIAL: '01', NOMEFILIAL: 'Filial A', META_EXIBIDA: 100 },
            { IDFILIAL: '01', NOMEFILIAL: 'Filial A', META_EXIBIDA: 50 },
            { IDFILIAL: '02', NOMEFILIAL: 'Filial B', META_EXIBIDA: 300 }
        ],
        {
            agrupar: true,
            dimensoes: [
                { coluna: 'IDFILIAL', ordenacao: 'desc' },
                { coluna: 'NOMEFILIAL' }
            ],
            valores: [{ coluna: 'META_EXIBIDA', agregacao: 'sum' }],
            filtrosDimensao: [{ coluna: 'NOMEFILIAL', valor: 'Filial A' }]
        }
    );

    assert.deepEqual(resultado, [
        { IDFILIAL: '01', NOMEFILIAL: 'Filial A', META_EXIBIDA: 150 }
    ]);
});


test('mantem as demais funcoes de agregacao no retorno de EXECUTE BLOCK', () => {
    const [resultado] = aplicarVisualizacaoEmMemoria(
        [
            { VALOR: 10, CODIGO: 'A' },
            { VALOR: 20, CODIGO: 'A' },
            { VALOR: 30, CODIGO: 'B' }
        ],
        {
            agrupar: true,
            valores: [
                { coluna: 'VALOR', agregacao: 'avg' },
                { coluna: 'CODIGO', agregacao: 'count_distinct' }
            ]
        }
    );

    assert.equal(resultado.VALOR, 20);
    assert.equal(resultado.CODIGO, 2);
});

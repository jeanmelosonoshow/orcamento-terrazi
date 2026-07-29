import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararConsultaVisual } from '../lib/scenario-visual-query.js';

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
});

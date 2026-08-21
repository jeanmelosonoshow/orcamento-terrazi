import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizarCategoriaAcessoOrcamento,
    resolverFiliaisPermitidasOrcamento,
    sqlUsaFiliaisPermitidas
} from '../lib/budget-access-scope.js';

test('escopo de orcamentos normaliza categorias e detecta o parametro protegido', () => {
    assert.equal(normalizarCategoriaAcessoOrcamento('Supervisor'), 'SU');
    assert.equal(normalizarCategoriaAcessoOrcamento('vd'), 'VD');
    assert.equal(sqlUsaFiliaisPermitidas('SELECT 1 WHERE filial IN (:filiais_permitidas)'), true);
});

test('supervisor recebe somente as filiais vinculadas no Firebird', async () => {
    let chamada;
    const filiais = await resolverFiliaisPermitidasOrcamento(
        { categoria: 'SU', sub: '142' },
        {
            executarFirebird: async (sql, valores, opcoes) => {
                chamada = { sql, valores, opcoes };
                return [{ IDFILIAL: '01' }, { IDFILIAL: ' 02 ' }, { IDFILIAL: '01' }];
            }
        }
    );

    assert.deepEqual(filiais, ['01', '02']);
    assert.deepEqual(chamada.valores, [142]);
    assert.match(chamada.sql, /F\.IDSUPERVISOR = \?/i);
    assert.equal(chamada.opcoes.cacheTtlMs, 300000);
    assert.equal(chamada.opcoes.cacheStaleMs, 0);
});

test('demais categorias resolvem o escopo sem consultar o Firebird', async () => {
    const falhar = async () => { throw new Error('nao deveria consultar'); };
    assert.deepEqual(await resolverFiliaisPermitidasOrcamento(
        { categoria: 'DI' }, { executarFirebird: falhar }
    ), ['__TODAS__']);
    assert.deepEqual(await resolverFiliaisPermitidasOrcamento(
        { categoria: 'VD' }, { executarFirebird: falhar }
    ), ['__TODAS__']);
    assert.deepEqual(await resolverFiliaisPermitidasOrcamento(
        { categoria: 'GR', idfilial: '19' }, { executarFirebird: falhar }
    ), ['19']);
    assert.deepEqual(await resolverFiliaisPermitidasOrcamento(
        { categoria: 'CX', idfilial: 'CD' }, { executarFirebird: falhar }
    ), ['CD']);
});

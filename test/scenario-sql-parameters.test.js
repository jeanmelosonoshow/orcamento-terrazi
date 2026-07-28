import test from 'node:test';
import assert from 'node:assert/strict';
import { montarContextoConsulta, prepararSqlCenario } from '../lib/scenario-sql-parameters.js';

test('usa a identidade da sessao em vez dos valores enviados pelo navegador', () => {
    const contexto = montarContextoConsulta(
        {
            categoria: 'DI',
            idfuncionario: '999',
            idfilial: '99',
            idvendedor: '999',
            filiais: ['01', '02']
        },
        {
            categoria: 'gr',
            sub: '752',
            idfilial: '01',
            idvendedor: '632'
        }
    );

    assert.deepEqual(contexto, {
        categoria: 'GR',
        idfuncionario: '752',
        idfilial: '01',
        idvendedor: '632',
        filiais: ['01', '02']
    });
});

test('prepara parametros Firebird por categoria e listas', () => {
    const preparado = prepararSqlCenario(
        'SELECT * FROM V WHERE :categoria = CATEGORIA AND IDFILIAL IN (:filiais) AND IDVENDEDOR = :idvendedor',
        'firebird',
        { categoria: 'GR', filiais: ['01', '02'], idvendedor: '632' }
    );

    assert.equal(
        preparado.sql,
        'SELECT * FROM V WHERE ? = CATEGORIA AND IDFILIAL IN (?,?) AND IDVENDEDOR = ?'
    );
    assert.deepEqual(preparado.valores, ['GR', '01', '02', '632']);
});

test('aceita parametros sem diferenciar maiusculas no Postgres', () => {
    const preparado = prepararSqlCenario(
        'SELECT * FROM vendas WHERE :CATEGORIA = categoria AND idfilial = :IDFILIAL',
        'postgres',
        { categoria: 'VD', idfilial: '01' }
    );

    assert.equal(
        preparado.sql,
        'SELECT * FROM vendas WHERE $1 = categoria AND idfilial = $2'
    );
    assert.deepEqual(preparado.valores, ['VD', '01']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    aplicarFiltroRelacionarPreparado,
    prepararDiretivasRelacionar
} from '../lib/scenario-interquery-relationship.js';
import { prepararSqlCenario } from '../lib/scenario-sql-parameters.js';

test('usa campo virtual da consulta principal e filtra a secundaria por chave composta', () => {
    const diretivas = prepararDiretivasRelacionar(`
        /* RELACIONAR | apelido: rel_orcamento | consulta: "DADOS ORCAMENTO" */
        SELECT S.IDFILIAL, S.NUMEROSAIDA,
               CASE WHEN /* rel_orcamento.IDFILIAL */ IN ('02') THEN 'S' ELSE 'N' END AS TESTE
          FROM SAIDA S
         WHERE S.DATASAIDA >= :data_inicial
    `, {
        apelido: 'rel_orcamento',
        consulta: 'DADOS ORCAMENTO',
        virtuais: { 'rel_orcamento.IDFILIAL': '02' }
    });
    const base = prepararSqlCenario(diretivas.sql, 'firebird', {
        dataInicial: '2026-01-01',
        relacionarParametros: diretivas.parametros
    });
    const preparado = aplicarFiltroRelacionarPreparado(base, 'firebird', {
        chaves: [
            { origem: 'IDFILIAL', destino: 'IDFILIAL' },
            { origem: 'NUMEROSAIDA', destino: 'NUMEROSAIDA' }
        ],
        linhas: [['02', 100], ['02', 101]]
    });

    assert.doesNotMatch(preparado.sql, /RELACIONAR|rel_orcamento/i);
    assert.match(preparado.sql, /CASE WHEN \? IN \('02'\)/i);
    assert.match(preparado.sql, /CRM_REL_BASE\."IDFILIAL" = \? AND CRM_REL_BASE\."NUMEROSAIDA" = \?/);
    assert.deepEqual(preparado.valores, ['02', '2026-01-01', '02', 100, '02', 101]);
});

test('numera os parametros adicionais depois dos parametros PostgreSQL existentes', () => {
    const base = prepararSqlCenario(
        'SELECT idfilial, numerosaida FROM venda WHERE data >= :data_inicial',
        'postgres',
        { dataInicial: '2026-01-01' }
    );
    const preparado = aplicarFiltroRelacionarPreparado(base, 'postgres', {
        chaves: [{ destino: 'idfilial' }, { destino: 'numerosaida' }],
        linhas: [[26, 123]]
    });

    assert.match(preparado.sql, /data >= \$1/);
    assert.match(preparado.sql, /"idfilial" = \$2 AND CRM_REL_BASE\."numerosaida" = \$3/);
    assert.deepEqual(preparado.valores, ['2026-01-01', 26, 123]);
});

test('apelido simples usa o campo padrao declarado', () => {
    const resultado = prepararDiretivasRelacionar(`
        /* RELACIONAR | apelido: filial_origem | consulta: principal | campo: IDFILIAL */
        SELECT CASE WHEN /* filial_origem */ = '02' THEN 1 ELSE 0 END AS FLAG FROM RDB$DATABASE
    `, {
        apelido: 'filial_origem',
        consulta: 'principal',
        virtuais: { 'filial_origem.IDFILIAL': '02' }
    });

    assert.match(resultado.sql, /CASE WHEN :crm_rel_virtual_1 = '02'/);
    assert.deepEqual(resultado.parametros, { crm_rel_virtual_1: '02' });
});

test('rejeita coluna de destino insegura e lote excessivo', () => {
    assert.throws(
        () => aplicarFiltroRelacionarPreparado(
            { sql: 'SELECT 1 AS ID', valores: [] },
            'firebird',
            { chaves: [{ destino: 'ID\nFROM SEGREDO' }], linhas: [[1]] }
        ),
        /nome invalido/i
    );
    assert.throws(
        () => aplicarFiltroRelacionarPreparado(
            { sql: 'SELECT 1 AS ID', valores: [] },
            'firebird',
            { chaves: [{ destino: 'ID' }], linhas: Array.from({ length: 251 }, (_, indice) => [indice + 1]) }
        ),
        /250 chaves/i
    );
});

test('nao aceita campos virtuais dentro de execute block', () => {
    assert.throws(
        () => prepararDiretivasRelacionar(`
            /* RELACIONAR | apelido: origem | consulta: principal */
            EXECUTE BLOCK RETURNS (ID INTEGER) AS
            BEGIN ID = /* origem.ID */; SUSPEND; END
        `, {
            apelido: 'origem',
            consulta: 'principal',
            virtuais: { 'origem.ID': 1 }
        }),
        /EXECUTE BLOCK/i
    );
});

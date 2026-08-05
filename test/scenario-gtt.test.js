import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    extrairOperacoesTemporariasExecuteBlock,
    montarSqlLimpezaTabelasTemporarias,
    obterTabelasTemporariasExecuteBlock,
    validarSqlLeitura
} from '../lib/scenario-sql-validation.js';

const blocoGtt = `EXECUTE BLOCK
RETURNS (DOCUMENTO VARCHAR(20))
AS
BEGIN
  DELETE FROM GTT_CRM_CLIENTES;

  IF (:categoria = 'DI') THEN
  BEGIN
    INSERT INTO GTT_CRM_CLIENTES (DOCUMENTO)
    SELECT DISTINCT S.DOCTOCLIENTE
      FROM SAIDA S
     WHERE S.IDFILIAL IN (:filiais);
  END

  FOR SELECT G.DOCUMENTO
        FROM GTT_CRM_CLIENTES G
      INTO :DOCUMENTO
  DO
  BEGIN
    SUSPEND;
  END
END`;

test('aceita carga em GTT confirmada com limpeza antes da insercao', () => {
    const operacoes = extrairOperacoesTemporariasExecuteBlock(blocoGtt);

    assert.deepEqual(operacoes.map(item => [item.tipo, item.tabela]), [
        ['delete', 'GTT_CRM_CLIENTES'],
        ['insert', 'GTT_CRM_CLIENTES']
    ]);
    assert.deepEqual(obterTabelasTemporariasExecuteBlock(blocoGtt), ['GTT_CRM_CLIENTES']);
    assert.equal(validarSqlLeitura(blocoGtt, 'firebird', {
        permitirDmlTemporariaPendente: true
    }), '');
    assert.equal(validarSqlLeitura(blocoGtt, 'firebird', {
        tabelasTemporariasPermitidas: ['GTT_CRM_CLIENTES']
    }), '');
});

test('rejeita tabela nao confirmada e insercao sem limpeza inicial', () => {
    assert.match(validarSqlLeitura(blocoGtt, 'firebird'), /nao foi confirmada.*temporaria/i);

    const semLimpeza = blocoGtt.replace('DELETE FROM GTT_CRM_CLIENTES;', '');
    assert.match(validarSqlLeitura(semLimpeza, 'firebird', {
        permitirDmlTemporariaPendente: true
    }), /DELETE FROM antes do primeiro INSERT/i);

    const permanente = blocoGtt.replaceAll('GTT_CRM_CLIENTES', 'CLIENTE');
    assert.match(validarSqlLeitura(permanente, 'firebird', {
        tabelasTemporariasPermitidas: []
    }), /CLIENTE.*nao foi confirmada/i);
});

test('continua bloqueando alteracoes permanentes e SQL dinamico', () => {
    const comUpdate = blocoGtt.replace('SUSPEND;', 'UPDATE CLIENTE SET NOMECLIENTE = NOMECLIENTE; SUSPEND;');
    const comMerge = blocoGtt.replace('SUSPEND;', 'MERGE INTO CLIENTE USING CLIENTE ON (1 = 0) WHEN NOT MATCHED THEN INSERT (ID) VALUES (1); SUSPEND;');
    const dinamico = blocoGtt.replace('SUSPEND;', "EXECUTE STATEMENT 'DELETE FROM CLIENTE'; SUSPEND;");

    assert.match(validarSqlLeitura(comUpdate, 'firebird', {
        permitirDmlTemporariaPendente: true
    }), /apenas leitura/i);
    assert.match(validarSqlLeitura(comMerge, 'firebird', {
        permitirDmlTemporariaPendente: true
    }), /apenas leitura/i);
    assert.match(validarSqlLeitura(dinamico, 'firebird', {
        permitirDmlTemporariaPendente: true
    }), /apenas leitura/i);
});

test('gera limpeza defensiva com identificadores estritamente validados', () => {
    assert.equal(
        montarSqlLimpezaTabelasTemporarias(['gtt_crm_clientes', 'GTT_CRM_CLIENTES']),
        'EXECUTE BLOCK AS BEGIN DELETE FROM "GTT_CRM_CLIENTES"; END'
    );
    assert.equal(montarSqlLimpezaTabelasTemporarias(['GTT_OK; DROP TABLE CLIENTE']), '');
});

test('API confirma RDB relation type e executor limpa antes de devolver ao pool', async () => {
    const [api, cliente] = await Promise.all([
        readFile(new URL('../api/executar-cenario.js', import.meta.url), 'utf8'),
        readFile(new URL('../lib/firebird-client.js', import.meta.url), 'utf8')
    ]);

    assert.match(api, /RDB\$RELATION_TYPE IN \(4, 5\)/);
    assert.match(api, /tabelasTemporarias: tabelasTemporariasConfirmadas/);
    assert.match(cliente, /montarSqlLimpezaTabelasTemporarias\(opcoes\.tabelasTemporarias\)/);
    assert.match(cliente, /conexao sera descartada/);
});

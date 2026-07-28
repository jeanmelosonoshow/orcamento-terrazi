import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlEhExecuteBlock, validarSqlLeitura } from '../lib/scenario-sql-validation.js';

const blocoLeitura = `EXECUTE BLOCK
RETURNS (IDFILIAL VARCHAR(2), TOTAL NUMERIC(18,2))
AS
BEGIN
  FOR SELECT V.IDFILIAL, SUM(V.SUBTOTAL)
        FROM VENDAS V
       GROUP BY V.IDFILIAL
      INTO :IDFILIAL, :TOTAL
  DO
  BEGIN
    SUSPEND;
  END
END`;

test('aceita EXECUTE BLOCK retornavel somente no Firebird', () => {
    assert.equal(sqlEhExecuteBlock(blocoLeitura), true);
    assert.equal(validarSqlLeitura(blocoLeitura, 'firebird'), '');
    assert.match(validarSqlLeitura(blocoLeitura, 'postgres'), /apenas.*Firebird/i);
});

test('exige RETURNS e SUSPEND para o bloco produzir linhas', () => {
    assert.match(validarSqlLeitura('EXECUTE BLOCK AS BEGIN EXIT; END', 'firebird'), /RETURNS.*SUSPEND/i);
});

test('bloqueia escrita e execucao dinamica dentro do bloco', () => {
    const comUpdate = blocoLeitura.replace('SUSPEND;', 'UPDATE VENDAS SET TOTAL = 0; SUSPEND;');
    const dinamico = blocoLeitura.replace('SUSPEND;', "EXECUTE STATEMENT 'SELECT 1 FROM RDB$DATABASE'; SUSPEND;");
    assert.match(validarSqlLeitura(comUpdate, 'firebird'), /apenas leitura/i);
    assert.match(validarSqlLeitura(dinamico, 'firebird'), /apenas leitura/i);
});

test('ignora palavras proibidas em comentarios e textos literais', () => {
    const seguro = blocoLeitura.replace('SUSPEND;', "TOTAL = 1; /* UPDATE apenas como comentario */ SUSPEND;");
    assert.equal(validarSqlLeitura(seguro, 'firebird'), '');
});


test('orienta remover SET TERM usado por editores SQL externos', () => {
    assert.match(validarSqlLeitura('SET TERM ^; EXECUTE BLOCK RETURNS (X INT) AS BEGIN X = 1; SUSPEND; END^', 'firebird'), /sem comandos SET TERM/i);
});

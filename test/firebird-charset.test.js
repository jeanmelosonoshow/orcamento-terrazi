import test from 'node:test';
import assert from 'node:assert/strict';
import {
    charsetsParaConsultaFirebird,
    criarErroCharsetFirebird,
    erroConversaoCharsetFirebird,
    normalizarCharsetFirebird
} from '../lib/firebird-charset.js';

test('usa NONE como charset padrao do banco Firebird', () => {
    assert.equal(normalizarCharsetFirebird(undefined), 'NONE');
    assert.equal(normalizarCharsetFirebird('none'), 'NONE');
    assert.equal(normalizarCharsetFirebird('utf8'), 'UTF8');
});
test('reconhece erros de conversao de texto do Firebird', () => {
    assert.equal(erroConversaoCharsetFirebird(new Error('Malformed string, At block line: 27, col: 2')), true);
    assert.equal(erroConversaoCharsetFirebird(new Error('Cannot transliterate character between character sets')), true);
    assert.equal(erroConversaoCharsetFirebird(new Error('Table unknown PRODUTO')), false);
});

test('usa charset alternativo somente quando permitido e diferente do principal', () => {
    assert.deepEqual(charsetsParaConsultaFirebird('utf8', 'none', false), ['UTF8']);
    assert.deepEqual(charsetsParaConsultaFirebird('utf8', 'none', true), ['UTF8', 'NONE']);
    assert.deepEqual(charsetsParaConsultaFirebird('none', 'NONE', true), ['NONE']);
    assert.deepEqual(charsetsParaConsultaFirebird('utf8', 'off', true), ['UTF8']);
});

test('gera diagnostico com os charsets tentados', () => {
    const erro = criarErroCharsetFirebird(new Error('Malformed string'), ['UTF8', 'NONE']);
    assert.equal(erro.isFirebirdCharsetError, true);
    assert.match(erro.message, /UTF8, NONE/);
    assert.match(erro.message, /DB_CHARSET_FB/);
});

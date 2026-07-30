import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emailClienteValido, normalizarBuscaCliente } from '../lib/customer-identifiers.js';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const indexSonoShow = fs.readFileSync(new URL('../public/index-sonoshow.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const salvar = fs.readFileSync(new URL('../api/salvar-orcamento.js', import.meta.url), 'utf8');
const buscarCliente = fs.readFileSync(new URL('../api/buscar-cliente.js', import.meta.url), 'utf8');

test('normaliza os identificadores usados na correspondencia de cliente', () => {
    assert.deepEqual(normalizarBuscaCliente({
        cpf: '123.456.789-01',
        telefone: '(11) 99876-5432',
        email: ' Cliente@Exemplo.COM '
    }), {
        cpf: '12345678901',
        telefone: '11998765432',
        email: 'cliente@exemplo.com'
    });
    assert.equal(emailClienteValido('invalido@'), false);
    assert.equal(emailClienteValido('cliente@dominio.com.br'), true);
    assert.equal(emailClienteValido('a'.repeat(250) + '@x.com'), false);
});

test('os dois formularios possuem email e confirmacao de cliente existente', () => {
    for (const html of [index, indexSonoShow]) {
        assert.match(html, /type="email" id="custEmail"/);
        assert.match(html, /id="existingCustomerDialog"/);
        assert.match(html, /data-customer-match-action="load"/);
    }
});

test('o fluxo consulta cliente, preenche o formulario e salva email_cliente', () => {
    assert.ok(script.includes("fetch('/api/buscar-cliente'"));
    assert.match(script, /preencherDadosClienteExistente/);
    assert.match(script, /cust_email: normalizarEmailCliente/);
    assert.ok(salvar.includes('email_cliente = $5'));
    assert.match(salvar, /email_cliente,/i);
});

test('a busca recupera o orcamento mais recente entre os registros correspondentes', () => {
    assert.match(buscarCliente, /ORDER BY DATA_CRIACAO DESC NULLS LAST, ID DESC, PONTUACAO DESC/);
});

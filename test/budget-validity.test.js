import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calcularDataValidadeOrcamento, ORCAMENTO_VALIDADE_DIAS } from '../lib/budget-validity.js';

test('calcula a validade cinco dias depois na data civil de São Paulo', () => {
  assert.equal(ORCAMENTO_VALIDADE_DIAS, 5);
  assert.equal(calcularDataValidadeOrcamento(new Date('2026-10-26T15:00:00Z')), '2026-10-31');
  assert.equal(calcularDataValidadeOrcamento(new Date('2026-10-27T01:30:00Z')), '2026-10-31');
  assert.equal(calcularDataValidadeOrcamento(new Date('2024-02-25T15:00:00Z')), '2024-03-01');
});

test('mantem o campo visivel e bloqueado nos dois formularios', async () => {
  const formularios = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/index-sonoshow.html', import.meta.url), 'utf8')
  ]);

  for (const html of formularios) {
    assert.match(html, /id="quoteValid"[^>]*disabled[^>]*aria-disabled="true"/);
    assert.match(html, /Validade calculada automaticamente em 5 dias/);
  }
});

test('recalcula ao abrir e gerar, e informa a regra nos PDFs', async () => {
  const [script, lista] = await Promise.all([
    readFile(new URL('../public/script.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/script-lista.js', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(script, /data\.data_validade\) quoteValid\.value/);
  assert.ok((script.match(/atualizarDataValidadeOrcamento\(\)/g) || []).length >= 4);
  assert.match(script, /ou enquanto vigorar a tabela de preços\./);
  assert.match(lista, /ou enquanto vigorar a tabela de preços\./);
});

test('servidor calcula a validade e ignora datas manipuladas pelo cliente', async () => {
  const api = await readFile(new URL('../api/salvar-orcamento.js', import.meta.url), 'utf8');

  assert.match(api, /const dataValidade = calcularDataValidadeOrcamento\(\)/);
  assert.doesNotMatch(api, /orcamento\.valid_until/);
  assert.match(api, /dataValidade, items: itensSalvos/);
});

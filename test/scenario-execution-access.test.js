import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    modoExecucaoExigeEditor,
    normalizarModoExecucaoCenario,
    validarModoExecucaoCenario
} from '../lib/scenario-execution-access.js';

test('execucao comum do painel nao exige permissao de editor', () => {
    assert.equal(normalizarModoExecucaoCenario(), 'painel');
    assert.equal(validarModoExecucaoCenario('painel'), '');
    assert.equal(validarModoExecucaoCenario('detalhe'), '');
    assert.equal(validarModoExecucaoCenario('drilldown'), '');
    assert.equal(modoExecucaoExigeEditor('painel'), false);
    assert.equal(modoExecucaoExigeEditor('detalhe'), false);
    assert.equal(modoExecucaoExigeEditor('drilldown'), false);
});

test('somente o modo de edicao exige permissao administrativa', () => {
    assert.equal(validarModoExecucaoCenario(' EDICAO '), '');
    assert.equal(modoExecucaoExigeEditor(' EDICAO '), true);
    assert.match(validarModoExecucaoCenario('desconhecido'), /invalido/i);
});

test('API restringe o construtor sem bloquear a atualizacao dos cards', () => {
    const api = fs.readFileSync(new URL('../api/executar-cenario.js', import.meta.url), 'utf8');
    const crm = fs.readFileSync(new URL('../public/crm.js', import.meta.url), 'utf8');

    assert.match(api, /modoExecucaoExigeEditor\(modoNormalizado\)/);
    assert.doesNotMatch(api, /if \(!usuarioPodeEditarCenario\(String\(session\.sub\)\)\)/);
    assert.match(crm, /modoExecucao: 'painel'/);
    assert.match(crm, /modoExecucao: 'edicao'/);
});

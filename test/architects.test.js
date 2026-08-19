import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    cpfValido,
    normalizarArquitetoEntrada,
    podeAlterarArquitetoOrcamento,
    sincronizarArquitetoOrcamento
} from '../lib/architects.js';

test('cadastro de arquiteto valida CPF, CAU, telefones e email', () => {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('111.111.111-11'), false);
    const arquiteto = normalizarArquitetoEntrada({
        nome: '  Ana   Souza  ',
        cpf: '529.982.247-25',
        registroCau: ' a12345-6 ',
        telefone: '(21) 99999-1234',
        telefoneAlternativo: '(21) 3333-1234',
        email: 'ANA@EXEMPLO.COM'
    });
    assert.deepEqual(arquiteto, {
        nome: 'Ana Souza',
        cpf: '52998224725',
        registroCau: 'A12345-6',
        telefone: '21999991234',
        telefoneAlternativo: '2133331234',
        email: 'ana@exemplo.com'
    });
});

test('permissao de troca do arquiteto vem exclusivamente da sessao assinada', () => {
    assert.equal(podeAlterarArquitetoOrcamento({ architectBudgetEditor: true }), true);
    assert.equal(podeAlterarArquitetoOrcamento({ architectBudgetEditor: false }), false);
    assert.equal(podeAlterarArquitetoOrcamento({ podeAlterarArquitetoOrcamento: true }), false);
});

test('API bloqueia a troca de um vinculo existente para usuario comum', async () => {
    const cliente = {
        async query(sql) {
            if (/FROM arquiteto_orcamento/i.test(sql)) return { rows: [{
                arquiteto_id: 7,
                nome_arquiteto: 'Ana Souza',
                cpf_arquiteto: '52998224725',
                registro_cau_arquiteto: 'A12345-6',
                telefone_arquiteto: '21999991234',
                email_arquiteto: 'ana@exemplo.com',
                data_vinculo: new Date(),
                ativo: true
            }] };
            throw new Error('Consulta inesperada');
        }
    };
    await assert.rejects(
        sincronizarArquitetoOrcamento(cliente, { orcamentoId: 10, arquitetoId: 8, alterar: true }, { architectBudgetEditor: false }),
        error => error.statusCode === 403 && error.code === 'ARCHITECT_LINK_LOCKED'
    );
});

test('migracao cria cadastros, vinculo unico, fotografia historica e bloqueio de troca', async () => {
    const sql = await readFile(new URL('../database/arquitetos.sql', import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS arquiteto\s*\(/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS arquiteto_orcamento\s*\(/i);
    assert.match(sql, /UNIQUE \(orcamento_id\)/i);
    assert.match(sql, /nome_arquiteto VARCHAR\(180\)/i);
    assert.match(sql, /registro_cau_arquiteto VARCHAR\(30\)/i);
    assert.match(sql, /fn_proteger_arquiteto_orcamento/i);
    assert.match(sql, /app\.permitir_troca_arquiteto/i);
});

test('menu possui cadastro real e o orcamento pergunta antes de PDF ou WhatsApp', async () => {
    const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8');
    const crm = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const budget = await readFile(new URL('../public/script.js', import.meta.url), 'utf8');
    const saveApi = await readFile(new URL('../api/salvar-orcamento.js', import.meta.url), 'utf8');
    const detailApi = await readFile(new URL('../api/detalhe-orcamento.js', import.meta.url), 'utf8');

    assert.match(html, /data-architect-form/);
    assert.match(html, /data-architect-cau/);
    assert.match(crm, /fetch\('\/api\/arquitetos/);
    const indiceArquiteto = budget.indexOf('await definirArquitetoAntesDeGerarOrcamento()');
    const indiceAcaoPdf = budget.indexOf('await abrirDialogoAcaoPdf()', indiceArquiteto);
    assert.ok(indiceArquiteto >= 0 && indiceAcaoPdf > indiceArquiteto);
    assert.match(budget, /podeAlterarArquitetoOrcamento/);
    assert.match(budget, /arquiteto_id: currentArchitect\?\.id/);
    assert.match(saveApi, /sincronizarArquitetoOrcamento/);
    assert.match(detailApi, /obterVinculoArquitetoOrcamento/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    cpfValido,
    normalizarArquitetoEntrada,
    normalizarPercentualComissao,
    podeAlterarArquitetoOrcamento,
    podeGerenciarComissaoArquiteto,
    sincronizarArquitetoOrcamento
} from '../lib/architects.js';

test('cadastro de arquiteto valida CPF, CAU, telefones e email', () => {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('111.111.111-11'), false);
    const arquiteto = normalizarArquitetoEntrada({
        nome: '  Ana   Souza  ',
        cpf: '529.982.247-25',
        nascimento: '1990-05-18',
        registroCau: ' a12345-6 ',
        telefone: '(21) 99999-1234',
        telefoneAlternativo: '(21) 3333-1234',
        email: 'ANA@EXEMPLO.COM'
    });
    assert.deepEqual(arquiteto, {
        nome: 'Ana Souza',
        cpf: '52998224725',
        nascimento: '1990-05-18',
        registroCau: 'A12345-6',
        telefone: '21999991234',
        telefoneAlternativo: '2133331234',
        email: 'ana@exemplo.com'
    });
    assert.throws(() => normalizarArquitetoEntrada({
        nome: 'Ana Souza',
        cpf: '52998224725',
        nascimento: '2099-01-01',
        registroCau: 'A12345-6',
        telefone: '21999991234',
        email: 'ana@exemplo.com'
    }), /futuro/i);
});

test('percentual de comissao e validado e depende da permissao assinada', () => {
    assert.equal(normalizarPercentualComissao('2,75'), 2.75);
    assert.equal(normalizarPercentualComissao(''), null);
    assert.throws(() => normalizarPercentualComissao(100.01), /entre 0 e 100/i);
    assert.equal(podeGerenciarComissaoArquiteto({ architectCommissionManager: true }), true);
    assert.equal(podeGerenciarComissaoArquiteto({ architectCommissionManager: false, podeGerenciarComissaoArquiteto: true }), false);
});

test('campo de comissao fica oculto e usa uma unica fonte de permissoes', async () => {
    const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8');
    const login = await readFile(new URL('../api/login.js', import.meta.url), 'utf8');

    assert.match(html, /data-architect-commission-field hidden/);
    assert.match(html, /crm-style\.css\?v=crm-20261016-permissions-1/);
    assert.match(css, /\.crm-architect-form \[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/i);
    assert.match(login, /path\.join\(__dirname, 'crm-permissions\.json'\)/);
    assert.doesNotMatch(login, /config['"],\s*'crm-permissions\.json'/);
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
    assert.match(sql, /nascimento DATE/i);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS nascimento DATE/i);
    assert.match(sql, /percentual_comissao NUMERIC\(7,4\)/i);
    assert.match(sql, /ck_arquiteto_percentual_comissao/i);
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
    assert.match(html, /data-architect-birth/);
    assert.match(html, /data-architect-commission/);
    assert.match(crm, /fetch\('\/api\/arquitetos/);
    assert.match(crm, /data-architect-edit/);
    assert.match(crm, /method: editando \? 'PUT' : 'POST'/);
    const indiceArquiteto = budget.indexOf('await definirArquitetoAntesDeGerarOrcamento()');
    const indiceAcaoPdf = budget.indexOf('await abrirDialogoAcaoPdf()', indiceArquiteto);
    assert.ok(indiceArquiteto >= 0 && indiceAcaoPdf > indiceArquiteto);
    assert.match(budget, /podeAlterarArquitetoOrcamento/);
    assert.match(budget, /arquiteto_id: currentArchitect\?\.id/);
    assert.match(saveApi, /sincronizarArquitetoOrcamento/);
    assert.match(detailApi, /obterVinculoArquitetoOrcamento/);
});

test('estrutura financeira preserva venda, auditoria, lote e idempotencia', async () => {
    const sql = await readFile(new URL('../database/comissao-arquiteto.sql', import.meta.url), 'utf8');
    const api = await readFile(new URL('../api/arquitetos.js', import.meta.url), 'utf8');
    const login = await readFile(new URL('../api/login.js', import.meta.url), 'utf8');

    assert.match(sql, /CREATE TABLE IF NOT EXISTS pagamento_orcamento_arquiteto/i);
    assert.match(sql, /UNIQUE \(idfilial_saida, numero_saida\)/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS lote_pagamento_arquiteto/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS historico_pagamento_arquiteto/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS fila_sincronizacao_pagamento_arquiteto/i);
    assert.match(sql, /PENDENTE[\s\S]*AUTORIZADO[\s\S]*PAGAMENTO_GERADO[\s\S]*PAGAMENTO_EFETUADO/i);
    assert.match(sql, /fn_validar_transicao_pagamento_arquiteto/i);
    assert.match(sql, /fn_registrar_historico_pagamento_arquiteto/i);
    assert.match(api, /incluirPercentualComissao: gerenciaComissao/);
    assert.match(api, /Usuario sem permissao para definir o percentual/i);
    assert.match(login, /architectCommissionManagerFuncionarioIds/);
});

test('diretorio fica antes do BI, mostra ate tres linhas e pagina os demais sem filtrar filial', async () => {
    const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8');
    const crm = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const api = await readFile(new URL('../api/arquitetos.js', import.meta.url), 'utf8');
    const inicioView = html.indexOf('data-crm-view="arquitetos"');
    const inicioDiretorio = html.indexOf('data-architect-manager', inicioView);
    const inicioBi = html.indexOf('data-dashboard-host="arquitetos"', inicioView);

    assert.ok(inicioView >= 0 && inicioDiretorio > inicioView && inicioBi > inicioDiretorio);
    assert.match(html, /data-architect-expand/);
    assert.match(html, /data-architect-pagination/);
    assert.match(crm, /architectDirectoryColumns \* \(architectDirectoryExpanded \? 3 : 1\)/);
    assert.match(crm, /architectDirectoryTotalPages/);
    assert.match(api, /LIMIT \$3 OFFSET \$4/);
    assert.match(api, /COUNT\(\*\)::INTEGER AS total/);
    assert.doesNotMatch(api, /WHERE[\s\S]{0,100}idfilial_cadastro\s*=/i);
});

test('menu de arquitetos oferece filtro multiplo global ligado ao BI', async () => {
    const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8');
    const crm = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const api = await readFile(new URL('../api/arquitetos.js', import.meta.url), 'utf8');

    assert.match(html, /data-architect-filter/);
    assert.match(html, /data-architect-filter-search/);
    assert.match(crm, /proximoContexto === 'arquitetos'/);
    assert.match(crm, /arquitetosTodos:/);
    assert.match(crm, /setArquitetosSelecionados\(arquitetosRascunho\)/);
    assert.match(crm, /preparacaoFiltrosContexto\.finally/);
    assert.match(crm, /carregarFiltroArquitetos\(\)[\s\S]*solicitarAtualizacaoCenarioMenu\(proximoContexto\)/);
    assert.match(api, /somenteOpcoes/);
    assert.match(api, /SELECT id, nome, cpf, registro_cau/);
    assert.doesNotMatch(api, /idfilial_cadastro\s*=\s*\$/i);
});

test('manual documenta a diretiva do filtro de arquitetos', async () => {
    const manual = await readFile(new URL('../database/arquitetos-uso.md', import.meta.url), 'utf8');

    assert.match(manual, /filtro = :arquitetos/);
    assert.match(manual, /campo: AO\.ARQUITETO_ID/);
    assert.match(manual, /Todos os arquitetos/);
    assert.match(manual, /operador = OR/);
    assert.match(manual, /PostgreSQL e Firebird/);
});

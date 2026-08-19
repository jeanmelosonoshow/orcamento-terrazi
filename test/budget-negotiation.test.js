import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    STATUS_NEGOCIACAO,
    normalizarContatoOrcamento,
    normalizarNegociacao,
    normalizarStatus
} from '../lib/budget-negotiation.js';
import { listarMotivosRecusa, obterMotivoRecusa } from '../lib/budget-rejection-reasons.js';

const ler = caminho => readFile(new URL(caminho, import.meta.url), 'utf8');

test('migracao cria historico, contato, indices e sincronizacao bidirecional', async () => {
    const sql = await ler('../database/negociacao-orcamento.sql');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS status_negociacao/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS controle_contato_orcamento/i);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_status_negociacao_vigente/i);
    assert.match(sql, /fn_status_negociacao_sincronizar_orcamento/i);
    assert.match(sql, /fn_orcamento_registrar_negociacao/i);
    assert.match(sql, /NEW\.valor_total IS DISTINCT FROM OLD\.valor_total/i);
    assert.match(sql, /OLD\.valor_total/i);
    assert.match(sql, /'EM NEGOCIACAO'/i);
    assert.match(sql, /WHEN 'RECUSADO' THEN 'CANCELADO'/i);
    assert.match(sql, /WHEN 'CANCELADO' THEN 'RECUSADO'/i);
    assert.match(sql, /fn_expirar_orcamentos/i);
    assert.match(sql, /data_validade < CURRENT_DATE/i);
    assert.match(sql, /motivo_recusa VARCHAR\(50\)/i);
    assert.match(sql, /motivo_recusa_descricao VARCHAR\(120\)/i);
    assert.match(sql, /ck_status_negociacao_motivo_recusa/i);
});

test('catalogo JSON possui motivos ativos, ordenados e identificadores estaveis', () => {
    const motivos = listarMotivosRecusa();
    assert.ok(motivos.length >= 5);
    assert.equal(motivos[0].id, 'PRECO_FORA_EXPECTATIVA');
    assert.equal(obterMotivoRecusa('outro')?.label, 'Outro motivo');
    assert.ok(motivos.every((item, indice) => indice === 0 || motivos[indice - 1].order <= item.order));
});

test('status de negociacao cobre todas as etapas comerciais', () => {
    assert.deepEqual([...STATUS_NEGOCIACAO], [
        'ORCAMENTO CRIADO', 'ENVIADO AO CLIENTE', 'EM NEGOCIACAO',
        'EXPIRADO', 'GEROU VENDA', 'RECUSADO'
    ]);
    assert.equal(normalizarStatus(' Em negociacao '), 'EM NEGOCIACAO');
});

test('normalizadores entregam contratos estaveis para a interface', () => {
    assert.equal(normalizarNegociacao({ status_negociacao: 'EXPIRADO', vigente: true }).status, 'EXPIRADO');
    assert.deepEqual(normalizarContatoOrcamento({
        orcamento_id: 12,
        status_contato: 'FINALIZADO',
        qtde_contato: 3
    }), {
        orcamentoId: 12,
        statusContato: 'FINALIZADO',
        tipoContato: undefined,
        observacao: '',
        dataPrimeiroContato: undefined,
        dataUltimoContato: undefined,
        dataFinalizacao: undefined,
        idfuncionario: undefined,
        idvendedor: undefined,
        qtdeContato: 3,
        dataUltimaAtualizacao: undefined,
        finalizado: true
    });
});

test('APIs exigem sessao, verificam acesso e usam as funcoes do banco', async () => {
    const [negociacao, contato, listar, salvar, status] = await Promise.all([
        ler('../api/negociacao-orcamento.js'),
        ler('../api/controle-contato-orcamento.js'),
        ler('../api/listar-orcamentos.js'),
        ler('../api/salvar-orcamento.js'),
        ler('../api/status-orcamento.js')
    ]);
    for (const api of [negociacao, contato, listar, salvar, status]) assert.match(api, /requireRequestSession/);
    assert.match(negociacao, /verificarAcessoOrcamento/);
    assert.match(contato, /verificarAcessoOrcamento/);
    assert.match(negociacao, /INSERT INTO status_negociacao/i);
    assert.match(negociacao, /obterMotivoRecusa/);
    assert.match(negociacao, /motivo_recusa_descricao/i);
    assert.match(contato, /ON CONFLICT \(orcamento_id\) DO UPDATE/i);
    assert.match(listar, /expirarOrcamentos/);
    assert.match(salvar, /definirContextoAuditoria/);
    assert.match(status, /definirContextoAuditoria/);
});

test('Funil combina os contatos dos orcamentos em lote e respeita o acesso da sessao', async () => {
    const [api, script] = await Promise.all([
        ler('../api/controle-contatos-orcamento.js'),
        ler('../public/crm.js')
    ]);
    assert.match(api, /requireRequestSession/);
    assert.match(api, /LIMITE_ORCAMENTOS = 5000/);
    assert.match(api, /ANY\(\$1::integer\[\]\)/i);
    assert.match(api, /v\.id_funcionario = \$3/i);
    assert.match(api, /v\.id_filial = \$4/i);
    assert.match(script, /fetch\(ehFunil \? '\/api\/controle-contatos-orcamento'/);
    assert.match(script, /CONTATO_NEGOCIACAO\./);
    assert.match(script, /\['ID_ORCAMENTO', 'ORCAMENTO_ID', 'IDORCAMENTO'\]/);
});

test('historico e BI compartilham a mesma janela de gestao', async () => {
    const [crmHtml, crmScript, listaHtml, listaScript, componente, manual] = await Promise.all([
        ler('../public/crm.html'),
        ler('../public/crm.js'),
        ler('../public/lista-orcamentos.html'),
        ler('../public/script-lista.js'),
        ler('../public/assets/budget-negotiation.js'),
        ler('../database/negociacao-orcamento-uso.md')
    ]);
    assert.match(crmHtml, /assets\/budget-negotiation\.js/);
    assert.match(listaHtml, /assets\/budget-negotiation\.js/);
    assert.match(listaScript, /abrirNegociacaoOrcamento/);
    assert.match(crmScript, /data-budget-negotiation-action/);
    assert.match(crmScript, /\['negotiation', 'negociacao'\]/);
    assert.match(componente, /data-budget-negotiation-form/);
    assert.match(componente, /data-budget-contact-form/);
    assert.match(componente, /data-budget-rejection-reason/);
    assert.match(componente, /motivoRecusa/);
    assert.match(manual, /action:negotiation/);
    assert.match(manual, /ID_ORCAMENTO/);
    assert.match(manual, /CONTATO_NEGOCIACAO\.STATUS_CONTATO/);
});

test('manutencao possui endpoint protegido e agendamento diario', async () => {
    const [api, vercel] = await Promise.all([
        ler('../api/manutencao-orcamentos.js'),
        ler('../vercel.json')
    ]);
    assert.match(api, /CRON_SECRET/);
    assert.match(api, /expirarOrcamentos/);
    assert.match(vercel, /\/api\/manutencao-orcamentos/);
    assert.match(vercel, /5 3 \* \* \*/);
});

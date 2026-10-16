import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    calcularValorComissao,
    chaveVendaComissao,
    normalizarVendaComissao,
    statusOperacionalComissao
} from '../lib/architect-commissions.js';

test('venda entregue e normalizada pela chave composta e calcula a comissao', () => {
    const venda = normalizarVendaComissao({
        idfilialSaida: '26',
        numeroSaida: '2620',
        orcamentoId: '118',
        valorVenda: 11508.90,
        situacaoEntrega: 'Entrega realizada'
    });
    assert.deepEqual(venda, {
        idfilialSaida: '26', numeroSaida: 2620, orcamentoId: 118,
        valorVenda: 11508.90, situacaoEntrega: 'ENTREGA REALIZADA', chave: '26:2620'
    });
    assert.equal(chaveVendaComissao('26', 2620), '26:2620');
    assert.equal(calcularValorComissao(venda.valorVenda, 2.5), 287.72);
});

test('venda ainda nao entregue nao pode ser autorizada', () => {
    assert.throws(() => normalizarVendaComissao({
        idfilialSaida: '26', numeroSaida: 2620, orcamentoId: 118,
        valorVenda: 1000, situacaoEntrega: 'Pendente'
    }), error => error.statusCode === 409 && error.code === 'SALE_NOT_DELIVERED');
});

test('registro ausente nasce virtualmente pendente e lote aguarda geracao', () => {
    assert.equal(statusOperacionalComissao(null), 'PENDENTE');
    assert.equal(statusOperacionalComissao({ status_pagamento: 'AUTORIZADO', lote_pagamento_id: 9 }), 'AGUARDANDO_GERACAO');
});

test('API prepara bordero e fila sem marcar pagamento como gerado', async () => {
    const api = await readFile(new URL('../api/comissoes-arquiteto.js', import.meta.url), 'utf8');
    const crm = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const html = await readFile(new URL('../public/crm.html', import.meta.url), 'utf8');

    assert.match(api, /status_pagamento\s*=\s*'AUTORIZADO'/);
    assert.match(api, /INSERT INTO lote_pagamento_arquiteto/);
    assert.match(api, /INSERT INTO fila_sincronizacao_pagamento_arquiteto/);
    assert.doesNotMatch(api, /status_pagamento\s*=\s*'PAGAMENTO_GERADO'/);
    assert.match(api, /JOIN orcamento_saida/);
    assert.match(crm, /widgetEhRelatorioComissao/);
    assert.match(crm, /renderizarConteudoCelula[\s\S]*renderizarControleComissaoRegistro/);
    assert.match(html, /data-commission-batch-form/);
    assert.match(html, /data-print-commission-bordero/);
});

test('relatorio alvo aceita acentos, espacos e hifen sem afetar outras tabelas', async () => {
    const crm = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicio = crm.indexOf('function normalizarIdentificadorComissao');
    const fim = crm.indexOf('function campoEhNumeroSaidaComissao', inicio);
    const widgetEhRelatorioComissao = Function(`${crm.slice(inicio, fim)}; return widgetEhRelatorioComissao;`)();

    assert.equal(widgetEhRelatorioComissao({ titulo: 'ORÇAMENTO COM VENDA GERADA -' }), true);
    assert.equal(widgetEhRelatorioComissao({ titulo: 'Outro relatório de vendas' }), false);
    assert.match(crm, /crm-commission-control, \.crm-commission-toolbar/);
});

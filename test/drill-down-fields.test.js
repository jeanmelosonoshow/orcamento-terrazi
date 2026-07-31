import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('../public/crm.js', import.meta.url);

async function carregarSeletorDetalhes() {
    const source = await readFile(dashboardPath, 'utf8');
    const inicio = source.indexOf('function obterCamposDetalheWidget');
    const fim = source.indexOf('function obterAlinhamentoCampo', inicio);
    assert.ok(inicio >= 0 && fim > inicio, 'Seletor de campos de drill-down nao encontrado.');
    return Function(source.slice(inicio, fim) + '; return obterCamposDetalheWidget;')();
}

test('drill-down recupera campos ignorados mesmo apos retorno agregado da tabela dinamica', async () => {
    const obterCamposDetalhe = await carregarSeletorDetalhes();
    const widget = {
        tipo: 'pivot',
        consultas: [{ alias: 'principal' }],
        colunasConsulta: ['IDFILIAL', 'TOTAL'],
        dadosConsultaAgregados: true
    };
    const mapeamentos = [
        { coluna: 'IDFILIAL', papel: 'linha', apelido: 'Filial' },
        { coluna: 'SUBTOTAL', papel: 'valor', apelido: 'Total' },
        { coluna: 'DESCRICAOPRODUTO', papel: 'ignorar', apelido: 'Produto' },
        { coluna: 'IDVENDEDOR', papel: 'ignorar', apelido: 'Vendedor' }
    ];

    const detalhes = obterCamposDetalhe(widget, mapeamentos);

    assert.deepEqual(
        detalhes.map(campo => [campo.coluna, campo.apelido]),
        [['DESCRICAOPRODUTO', 'Produto'], ['IDVENDEDOR', 'Vendedor']]
    );
    assert.ok(!detalhes.some(campo => campo.coluna === 'IDFILIAL'));
    assert.ok(!detalhes.some(campo => campo.coluna === 'SUBTOTAL'));
});

test('atualizacao da tabela dinamica preserva as colunas originais para novos filtros', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    assert.match(source, /widget\.tipo === 'pivot'/);
    assert.match(source, /widget\.colunasConsulta[\s\S]*colunasRetornadas/);
});
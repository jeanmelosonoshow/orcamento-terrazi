import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executarManutencaoControleContato } from '../lib/contact-maintenance.js';

const ler = caminho => readFile(new URL(caminho, import.meta.url), 'utf8');

test('manual documenta configuração, interação e exibição do controle de contato', async () => {
    const manual = await ler('../database/controle-contato-uso.md');
    for (const recurso of [
        'DOCUMENTO',
        'CONTATO.STATUS_CONTATO',
        'Colunas exibidas',
        'action:contact',
        'icon:whatsapp',
        'Font Awesome',
        'fa-calendar-days',
        'AS "DATA CONTATO"',
        'css:background',
        'EXECUTE BLOCK',
        'COUNT DISTINCT',
        'Filtros de relacionamento'
    ]) {
        assert.match(manual, new RegExp(recurso.replace('.', '\\.')));
    }
    assert.match(manual, /22\.000 linhas/);
    assert.match(manual, /lotes internos de até 5\.000/);
});

test('migracao cria controle, indices, invariantes e reabertura por recompra', async () => {
    const sql = await ler('../database/controle-contato.sql');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS controle_contato/i);
    assert.match(sql, /PRIMARY KEY/i);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_controle_contato_status/i);
    assert.match(sql, /Contato finalizado nao pode ser alterado/);
    assert.match(sql, /fn_reabrir_contatos_por_recompra/i);
    assert.match(sql, /fn_executar_manutencao_contatos/i);
    assert.match(sql, /fn_reservar_manutencao_contatos/i);
    assert.match(sql, /data_ultima_tentativa_recompra < CURRENT_TIMESTAMP - INTERVAL '15 minutes'/i);
    assert.match(sql, /data_ultima_execucao_reabertura AT TIME ZONE 'America\/Sao_Paulo'/i);
    assert.match(sql, /idx_controle_contato_finalizado_reabertura/i);
    assert.match(sql, /qtde_contato = qtde_contato \+ 1/i);
});

test('API usa identidade da sessao e faz upsert do contato', async () => {
    const api = await ler('../api/controle-contato.js');
    assert.match(api, /requireRequestSession/);
    assert.match(api, /numeroSessao\(session\.sub\)/);
    assert.match(api, /numeroSessao\(session\.idvendedor\)/);
    assert.match(api, /ON CONFLICT \(doctocliente\) DO UPDATE/i);
    assert.match(api, /CONTACT_FINALIZED/);
});

test('enriquecimento consulta contatos em lote sem uma chamada por linha', async () => {
    const [api, manutencao, script] = await Promise.all([
        ler('../api/controle-contatos.js'),
        ler('../lib/contact-maintenance.js'),
        ler('../public/crm.js')
    ]);
    assert.match(api, /ANY\(\$1::text\[\]\)/i);
    assert.match(api, /LIMITE_DOCUMENTOS = 5000/);
    assert.match(api, /executarManutencaoControleContato\(db\)/);
    assert.match(manutencao, /fn_executar_manutencao_contatos/);
    assert.match(manutencao, /return \{ ok: false, executada: false/);
    assert.match(script, /function enriquecerRegistrosContato/);
    assert.match(script, /'\/api\/controle-contatos'/);
});

test('Carteira possui filtros, formulario e diretivas de celula', async () => {
    const [html, script] = await Promise.all([ler('../public/crm.html'), ler('../public/crm.js')]);
    assert.match(html, /data-contact-filters/);
    assert.doesNotMatch(html, /data-contact-client/);
    assert.match(html, /crm-contact-date-range/);
    assert.match(script, /status selecionados/);
    assert.match(script, /canais selecionados/);
    assert.match(html, /data-contact-modal/);
    assert.match(script, /aplicarFiltrosContatoRegistros/);
    assert.match(script, /data-contact-action/);
    assert.match(script, /function obterDiretivasCelula/);
    assert.match(script, /item\.tipo === 'icon'/);
    assert.match(script, /fetch\('\/api\/controle-contato/);
    assert.match(script, /!dentroStatusContato && contactStatusDetails/);
    assert.match(script, /!dentroTipoContato && contactTypeDetails/);
    assert.match(script, /details\?\.addEventListener\('toggle'/);
    assert.match(script, /event\.key !== 'Escape'/);
    assert.match(script, /timeZone: 'America\/Sao_Paulo'/);
});

test('Funil exibe filtros proprios de contato por orcamento', async () => {
    const [html, script, api] = await Promise.all([
        ler('../public/crm.html'),
        ler('../public/crm.js'),
        ler('../api/executar-cenario.js')
    ]);
    assert.match(html, /data-contact-filters-title/);
    assert.match(script, /\['clientes', 'funil'\]\.includes\(proximoContexto\)/);
    assert.match(script, /Relacionamento dos orcamentos/);
    assert.match(script, /dashboardContextoAtivo === 'funil'/);
    assert.match(script, /if \(usaRelacionamentoFunil\) return true;[\s\S]*const parametros = categoriaCodigo/);
    assert.doesNotMatch(api, /fonteNormalizada === 'firebird' && sqlPossuiFiltroRelacionamento/);
});

test('executor reconhece parametros dos filtros de contato', async () => {
    const parametros = await ler('../lib/scenario-sql-parameters.js');
    for (const nome of ['status_contato', 'tipos_contato', 'data_contato_inicial', 'data_contato_final']) {
        assert.match(parametros, new RegExp(nome));
    }
    assert.doesNotMatch(parametros, /cliente_contato/);
});

test('manutencao diaria normaliza o resultado retornado pelo banco', async () => {
    const consultas = [];
    const cliente = {
        query: async (sql, params) => {
            consultas.push({ sql, params });
            if (sql.includes('fn_reservar')) return { rows: [{ reservada: true }] };
            return { rows: [{ executada: true, contatos_reabertos: '7' }] };
        }
    };
    const executarFirebird = async sql => {
        assert.match(sql, /AVG\(R\.MEDIA_RECOMPRA_CLIENTE\)/i);
        return [{ recompra: '83' }];
    };
    assert.deepEqual(await executarManutencaoControleContato(cliente, { executarFirebird }), {
        ok: true,
        executada: true,
        contatosReabertos: 7,
        mediaRecompraDias: 83
    });
    assert.deepEqual(consultas.at(-1).params, [83]);
});

test('manutencao sem reserva nao consulta o Firebird', async () => {
    const cliente = { query: async () => ({ rows: [{ reservada: false }] }) };
    let consultasFirebird = 0;
    const executarFirebird = async () => { consultasFirebird += 1; return []; };
    assert.deepEqual(await executarManutencaoControleContato(cliente, { executarFirebird }), {
        ok: true,
        executada: false,
        contatosReabertos: 0,
        mediaRecompraDias: null
    });
    assert.equal(consultasFirebird, 0);
});

test('falha da manutencao nao impede o carregamento da Carteira', async () => {
    const avisos = [];
    const cliente = { query: async () => { throw Object.assign(new Error('indisponivel'), { code: '08006' }); } };
    const logger = { warn: (...argumentos) => avisos.push(argumentos) };
    assert.deepEqual(await executarManutencaoControleContato(cliente, { logger }), {
        ok: false,
        executada: false,
        contatosReabertos: 0,
        mediaRecompraDias: null
    });
    assert.equal(avisos.length, 1);
});

test('media invalida preserva configuracao anterior e registra falha', async () => {
    const consultas = [];
    const cliente = {
        query: async (sql, params) => {
            consultas.push({ sql, params });
            if (sql.includes('fn_reservar')) return { rows: [{ reservada: true }] };
            return { rows: [] };
        }
    };
    const resultado = await executarManutencaoControleContato(cliente, {
        executarFirebird: async () => [{ RECOMPRA: null }],
        logger: { warn: () => {} }
    });
    assert.equal(resultado.ok, false);
    assert.ok(consultas.some(item => item.sql.includes('fn_registrar_falha')));
    assert.ok(!consultas.some(item => item.sql.includes('fn_executar_manutencao')));
});

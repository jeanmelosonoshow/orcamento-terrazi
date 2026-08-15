import test from 'node:test';
import assert from 'node:assert/strict';
import {
    aplicarFiltroClientesProximos,
    calcularDistanciaKm,
    normalizarCep,
    obterConfiguracaoClientesProximos,
    sqlPossuiFiltroClientesProximos
} from '../lib/client-proximity-filter.js';

test('le a diretiva simples e a configuracao personalizada', () => {
    assert.equal(sqlPossuiFiltroClientesProximos('SELECT 1'), false);
    assert.equal(sqlPossuiFiltroClientesProximos('/* filtro: clientes_proximos */ SELECT 1'), true);
    assert.deepEqual(
        obterConfiguracaoClientesProximos('/* filtro: clientes_proximos */ SELECT 1'),
        { campoCep: 'CEP', raioKm: 30 }
    );
    assert.deepEqual(
        obterConfiguracaoClientesProximos('/* filtro: clientes_proximos | campo_cep: "CEP CLIENTE" | raio_km: 45,5 */'),
        { campoCep: 'CEP CLIENTE', raioKm: 45.5 }
    );
    assert.throws(
        () => obterConfiguracaoClientesProximos('/* filtro: clientes_proximos | raio_km: 0 */'),
        /entre 1 e 300 km/
    );
});

test('normaliza CEP e calcula distancia pela formula de Haversine', () => {
    assert.equal(normalizarCep('20.040-002'), '20040002');
    assert.equal(normalizarCep('123'), '');
    const distancia = calcularDistanciaKm(
        { latitude: -22.9068, longitude: -43.1729 },
        { latitude: -23.5505, longitude: -46.6333 }
    );
    assert.ok(distancia > 350 && distancia < 370);
});

test('mantem clientes no raio, associa a filial e informa localidades sem coordenadas', async () => {
    const db = {
        async query(sql) {
            if (/SELECT chave/i.test(sql)) return { rows: [] };
            return { rows: [] };
        }
    };
    const executarFirebird = async () => [{
        IDFILIAL: '01',
        NOMEFILIAL: 'Filial Centro',
        CIDADE: 'Rio de Janeiro',
        BAIRRO: 'Centro',
        CEP: '20040002',
        UF: 'RJ'
    }];
    const coordenadas = {
        '20040002': { latitude: '-22.9068', longitude: '-43.1729', city: 'Rio de Janeiro', neighborhood: 'Centro', state: 'RJ' },
        '22290030': { latitude: '-22.9541', longitude: '-43.1822', city: 'Rio de Janeiro', neighborhood: 'Botafogo', state: 'RJ' },
        '01310930': { latitude: '-23.5614', longitude: '-46.6559', city: 'Sao Paulo', neighborhood: 'Bela Vista', state: 'SP' }
    };
    const fetchImpl = async url => {
        const cep = String(url).split('/').pop();
        const item = coordenadas[cep];
        return {
            ok: Boolean(item),
            status: item ? 200 : 404,
            async json() {
                if (!item) return { message: 'CEP nao encontrado' };
                return {
                    city: item.city,
                    neighborhood: item.neighborhood,
                    state: item.state,
                    location: { coordinates: { latitude: item.latitude, longitude: item.longitude } }
                };
            }
        };
    };

    const resultado = await aplicarFiltroClientesProximos({
        db,
        executarFirebird,
        linhas: [
            { DOCUMENTO: '1', NOME: 'Cliente perto', CIDADE: 'Rio de Janeiro', BAIRRO: 'Botafogo', CEP: '22290-030' },
            { DOCUMENTO: '2', NOME: 'Cliente longe', CIDADE: 'Sao Paulo', BAIRRO: 'Bela Vista', CEP: '01310-930' },
            { DOCUMENTO: '3', NOME: 'Sem CEP', CIDADE: '', BAIRRO: '', CEP: '' }
        ],
        session: { categoria: 'DI', sub: '10' },
        contexto: { filiaisTodos: true, filiais: [] },
        configuracao: { campoCep: 'CEP', raioKm: 30 },
        fetchImpl
    });

    assert.equal(resultado.linhas.length, 1);
    assert.equal(resultado.linhas[0].NOME, 'Cliente perto');
    assert.equal(resultado.linhas[0].IDFILIAL_PROXIMA, '01');
    assert.equal(resultado.linhas[0].FILIAL_PROXIMA, 'Filial Centro');
    assert.ok(resultado.linhas[0].DISTANCIA_KM > 0);
    assert.equal(resultado.metadata.clientesAnalisados, 3);
    assert.equal(resultado.metadata.clientesProximos, 1);
    assert.equal(resultado.metadata.clientesSemCep, 1);
    assert.equal(resultado.metadata.ufReferencia, 'RJ');
});

test('base com muitos bairros retorna por cidade e indexa progressivamente sem bloquear', async () => {
    const db = { async query(sql) { return /SELECT chave/i.test(sql) ? { rows: [] } : { rows: [] }; } };
    const executarFirebird = async () => [{
        IDFILIAL: '01', NOMEFILIAL: 'Filial Centro', CIDADE: 'Rio de Janeiro',
        BAIRRO: 'Centro', CEP: '20040002', UF: 'RJ'
    }];
    const linhas = Array.from({ length: 125 }, (_, indice) => ({
        DOCUMENTO: String(indice + 1),
        NOME: 'Cliente ' + (indice + 1),
        CIDADE: 'Rio de Janeiro',
        BAIRRO: 'Bairro ' + (indice + 1),
        CEP: String(22000000 + indice)
    }));
    const fetchImpl = async url => ({
        ok: true,
        status: 200,
        async json() {
            const cep = String(url).split('/').pop();
            return {
                city: 'Rio de Janeiro', neighborhood: 'Centro', state: 'RJ',
                location: { coordinates: {
                    latitude: cep === '20040002' ? '-22.9068' : '-22.92',
                    longitude: cep === '20040002' ? '-43.1729' : '-43.19'
                } }
            };
        }
    });

    const resultado = await aplicarFiltroClientesProximos({
        db, executarFirebird, linhas,
        session: { categoria: 'DI', sub: '10' },
        contexto: { filiaisTodos: true, filiais: [] },
        configuracao: { campoCep: 'CEP', raioKm: 30 },
        fetchImpl
    });

    assert.equal(resultado.linhas.length, 125);
    assert.equal(resultado.metadata.localidadesIndexadasNestaExecucao, 120);
    assert.equal(resultado.metadata.localidadesPendentes, 5);
    assert.equal(resultado.metadata.clientesAproximadosPorCidade, 5);
});

test('CEP identificado fora do RJ nao entra no raio', async () => {
    const db = { async query(sql) { return /SELECT chave/i.test(sql) ? { rows: [] } : { rows: [] }; } };
    const executarFirebird = async () => [{
        IDFILIAL: '01', NOMEFILIAL: 'Filial RJ', CIDADE: 'Rio de Janeiro',
        BAIRRO: 'Centro', CEP: '20040002', UF: 'RJ'
    }];
    const fetchImpl = async url => {
        const cep = String(url).split('/').pop();
        const foraDoRio = cep === '01310930';
        return {
            ok: true, status: 200,
            async json() {
                return {
                    city: foraDoRio ? 'Sao Paulo' : 'Rio de Janeiro',
                    neighborhood: 'Centro',
                    state: foraDoRio ? 'SP' : 'RJ',
                    location: { coordinates: {
                        latitude: foraDoRio ? '-23.5614' : '-22.9068',
                        longitude: foraDoRio ? '-46.6559' : '-43.1729'
                    } }
                };
            }
        };
    };
    const resultado = await aplicarFiltroClientesProximos({
        db, executarFirebird,
        linhas: [{ DOCUMENTO: '1', CIDADE: 'Sao Paulo', BAIRRO: 'Centro', CEP: '01310-930' }],
        session: { categoria: 'DI', sub: '10' },
        contexto: { filiaisTodos: true, filiais: [] },
        configuracao: { campoCep: 'CEP', raioKm: 30 }, fetchImpl
    });
    assert.equal(resultado.linhas.length, 0);
    assert.equal(resultado.metadata.ufReferencia, 'RJ');
});

test('filiais com o mesmo CEP sao geocodificadas e gravadas uma unica vez por chave', async () => {
    const db = { async query(sql) { return /SELECT chave/i.test(sql) ? { rows: [] } : { rows: [] }; } };
    const executarFirebird = async () => [
        { IDFILIAL: '01', NOMEFILIAL: 'Filial A', CIDADE: 'Rio de Janeiro', BAIRRO: 'Centro', CEP: '20040002', UF: 'RJ' },
        { IDFILIAL: '02', NOMEFILIAL: 'Filial B', CIDADE: 'Rio de Janeiro', BAIRRO: 'Centro', CEP: '20040002', UF: 'RJ' }
    ];
    const chamadas = new Map();
    const fetchImpl = async url => {
        const cep = String(url).split('/').pop();
        chamadas.set(cep, (chamadas.get(cep) || 0) + 1);
        return {
            ok: true, status: 200,
            async json() {
                return {
                    city: 'Rio de Janeiro', neighborhood: 'Centro', state: 'RJ',
                    location: { coordinates: { latitude: '-22.9068', longitude: '-43.1729' } }
                };
            }
        };
    };
    const resultado = await aplicarFiltroClientesProximos({
        db, executarFirebird,
        linhas: [{ DOCUMENTO: '1', CIDADE: 'Rio de Janeiro', BAIRRO: 'Botafogo', CEP: '22290030' }],
        session: { categoria: 'DI', sub: '10' },
        contexto: { filiaisTodos: true, filiais: [] },
        configuracao: { campoCep: 'CEP', raioKm: 30 }, fetchImpl
    });

    assert.equal(chamadas.get('20040002'), 1);
    assert.equal(resultado.metadata.filiaisConsideradas.length, 2);
});

test('a rota aplica proximidade antes do limite visual e devolve os metadados', async () => {
    const { readFile } = await import('node:fs/promises');
    const api = await readFile(new URL('../api/executar-cenario.js', import.meta.url), 'utf8');
    assert.match(api, /configuracaoProximidade \? undefined : limiteRetorno/);
    assert.match(api, /aplicarFiltroClientesProximos/);
    assert.match(api, /proximidade: metadataProximidade/);
    assert.match(api, /'DISTANCIA_KM'/);
});

test('relatorio principal preserva e exibe o resumo de proximidade', async () => {
    const { readFile } = await import('node:fs/promises');
    const [javascript, css] = await Promise.all([
        readFile(new URL('../public/crm.js', import.meta.url), 'utf8'),
        readFile(new URL('../public/crm-style.css', import.meta.url), 'utf8')
    ]);
    assert.match(javascript, /function renderizarResumoProximidade/);
    assert.match(javascript, /proximidade: data\.proximidade \|\| null/);
    assert.match(javascript, /container\.insertAdjacentHTML\('afterbegin', resumoProximidade\)/);
    assert.match(javascript, /resultadosConsultasAtuais\.find\(resultado => resultado\.proximidade\)/);
    assert.match(css, /\.crm-table-proximity-summary/);
});

test('painel repete silenciosamente apenas falhas temporarias da fila', async () => {
    const { readFile } = await import('node:fs/promises');
    const javascript = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    assert.match(javascript, /function executarCenarioComRetentativa/);
    assert.match(javascript, /BI_GATEWAY_QUEUE_TIMEOUT/);
    assert.match(javascript, /BI_GATEWAY_QUEUE_FULL/);
    assert.match(javascript, /DASHBOARD_QUEUE_RETRY_LIMIT = 1/);
});

test('mapeamento permite ordenar inclusive colunas herdadas', async () => {
    const { readFile } = await import('node:fs/promises');
    const javascript = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    assert.match(javascript, /data-map-move="-1"/);
    assert.match(javascript, /data-map-move="1"/);
    assert.match(javascript, /function atualizarControlesOrdemMapeamento/);
    assert.match(javascript, /widgetEmEdicao\.mapeamentos = coletarMapeamentosColunas\(\)/);
    assert.match(javascript, /mapeamentos\.filter\(item => item\.papel !== 'ignorar'\),\s*camposDetalheDisponiveis/);
});

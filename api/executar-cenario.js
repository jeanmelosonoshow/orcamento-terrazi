import { db } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireRequestSession } from '../lib/session-token.js';
import { executarConsultaFirebirdGateway, statusHttpErroConsulta } from '../lib/bi-gateway-client.js';
import { montarContextoConsulta, prepararSqlCenario } from '../lib/scenario-sql-parameters.js';
import {
    obterTabelasTemporariasExecuteBlock,
    validarSqlLeitura
} from '../lib/scenario-sql-validation.js';
import {
    aplicarVisualizacaoEmMemoria,
    avaliarBaseVisualizacaoEmMemoria,
    deveTentarCacheBaseVisualizacao,
    prepararConsultaBaseVisualizacao,
    prepararConsultaVisual
} from '../lib/scenario-visual-query.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const permissionsPath = path.join(__dirname, 'crm-permissions.json');
const LIMITE_RETORNO = 1000;
const LIMITE_PREVIA = 100;
const CONSULTA_TIMEOUT_MS = 90000;
const DRILL_CACHE_MAX_ROWS = Math.min(10000, Math.max(100, Number(process.env.BI_DRILL_CACHE_MAX_ROWS) || 3000));
const DRILL_CACHE_MAX_BYTES = Math.min(16777216, Math.max(262144, Number(process.env.BI_DRILL_CACHE_MAX_BYTES) || 4194304));

function obterCampo(linha, nome) {
    if (!linha) return undefined;
    if (Object.prototype.hasOwnProperty.call(linha, nome)) return linha[nome];
    const chave = Object.keys(linha).find(item => item.toLowerCase() === String(nome).toLowerCase());
    return chave ? linha[chave] : undefined;
}

async function confirmarTabelasTemporariasFirebird(tabelas) {
    const nomes = Array.from(new Set((Array.isArray(tabelas) ? tabelas : [])
        .map(item => String(item || '').trim().toUpperCase())
        .filter(Boolean)));
    if (!nomes.length) return [];

    const marcadores = nomes.map(() => '?').join(',');
    const sqlCatalogo = `
        SELECT
            TRIM(R.RDB$RELATION_NAME) AS NOME,
            R.RDB$RELATION_TYPE AS TIPO
        FROM RDB$RELATIONS R
        WHERE R.RDB$RELATION_NAME IN (${marcadores})
          AND R.RDB$RELATION_TYPE IN (4, 5)
    `;
    const linhas = await executarConsultaFirebirdGateway(sqlCatalogo, nomes, {
        operacao: 'validar-gtt-cenario',
        timeoutMs: 15000,
        limite: nomes.length,
        permitirFallbackCharset: false,
        cacheTtlMs: 300000,
        cacheStaleMs: 0
    });
    return linhas
        .filter(linha => [4, 5].includes(Number(obterCampo(linha, 'TIPO'))))
        .map(linha => String(obterCampo(linha, 'NOME') || '').trim().toUpperCase())
        .filter(nome => nomes.includes(nome));
}

function carregarEditoresCenario() {
    try {
        const config = JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
        const ids = config.scenarioEditorFuncionarioIds || config.cenarios?.editoresIdFuncionario || [];
        return Array.isArray(ids) ? ids.map(id => String(id).trim()).filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

function usuarioPodeEditarCenario(idFuncionario) {
    return Boolean(idFuncionario && carregarEditoresCenario().includes(idFuncionario));
}

function extrairColunas(linhas) {
    if (!Array.isArray(linhas) || !linhas.length) return [];
    return Object.keys(linhas[0]);
}

function mensagemErroInfraestrutura(error, status) {
    const codigo = String(error?.code || '');
    if (codigo === 'BI_REDIS_AUTH_ERROR') return 'Redis/Upstash recusou o token ou as permissoes ACL.';
    if (codigo === 'BI_REDIS_ERROR') return 'Falha ao acessar o cache ou a fila Redis/Upstash.';
    if (codigo === 'BI_GATEWAY_QUEUE_FULL') return 'Fila de consultas lotada. Aguarde alguns segundos.';
    if (codigo === 'BI_GATEWAY_QUEUE_TIMEOUT') return 'Tempo limite aguardando uma vaga na fila de consultas.';
    if (codigo === 'BI_GATEWAY_CIRCUIT_OPEN') return 'Firebird em recuperacao apos falhas consecutivas.';
    if (codigo === 'FB_ACQUIRE_TIMEOUT') return 'Capacidade de consultas ocupada. Aguarde alguns segundos e tente novamente.';
    if (codigo.startsWith('FB_') || error?.isFirebirdConnectionError) return 'Firebird temporariamente indisponivel.';
    return status >= 503 ? 'Servico de dados temporariamente indisponivel.' : 'Erro ao executar consulta.';
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });

    const session = requireRequestSession(req, res);
    if (!session) return;
    const { fonte = 'firebird', sql, filtros = {}, visualizacao = null } = req.body || {};
    if (!usuarioPodeEditarCenario(String(session.sub))) return res.status(403).json({ error: 'Usuario sem permissao para testar cenarios.' });

    const fonteNormalizada = String(fonte).toLowerCase() === 'postgres' ? 'postgres' : 'firebird';
    const tabelasTemporariasSolicitadas = fonteNormalizada === 'firebird'
        ? obterTabelasTemporariasExecuteBlock(sql)
        : [];
    const erroValidacao = validarSqlLeitura(sql, fonteNormalizada, {
        permitirDmlTemporariaPendente: tabelasTemporariasSolicitadas.length > 0
    });
    if (erroValidacao) return res.status(400).json({ error: erroValidacao });
    try {
        const tabelasTemporariasConfirmadas = await confirmarTabelasTemporariasFirebird(
            tabelasTemporariasSolicitadas
        );
        if (tabelasTemporariasSolicitadas.length) {
            const erroGtt = validarSqlLeitura(sql, fonteNormalizada, {
                tabelasTemporariasPermitidas: tabelasTemporariasConfirmadas
            });
            if (erroGtt) return res.status(400).json({ error: erroGtt });
        }

        const contextoConsulta = montarContextoConsulta(filtros, session);
        const preparadoBase = prepararSqlCenario(sql, fonteNormalizada, contextoConsulta);
        const preparado = prepararConsultaVisual(preparadoBase, fonteNormalizada, visualizacao);
        let linhas = [];
        let visualizacaoAplicadaEmMemoria = false;
        let estrategiaVisualizacao = 'sql-direto';

        if (fonteNormalizada === 'postgres') {
            const client = await db.connect();
            try {
                await client.query('BEGIN READ ONLY');
                await client.query(`SET LOCAL statement_timeout = ${CONSULTA_TIMEOUT_MS}`);
                const result = await client.query(preparado.sql, preparado.valores);
                linhas = result.rows.slice(0, LIMITE_RETORNO);
                await client.query('COMMIT');
            } catch (error) {
                try { await client.query('ROLLBACK'); } catch (rollbackError) {}
                throw error;
            } finally {
                client.release();
            }
        } else {
            const opcoesCache = {
                operacao: 'executar-cenario',
                timeoutMs: CONSULTA_TIMEOUT_MS,
                permitirFallbackCharset: true,
                tabelasTemporarias: tabelasTemporariasConfirmadas,
                cacheTtlMs: Number(process.env.BI_DASHBOARD_CACHE_TTL_MS || 300000),
                cacheStaleMs: Number(process.env.BI_DASHBOARD_CACHE_STALE_MS || 900000)
            };

            if (deveTentarCacheBaseVisualizacao(preparadoBase, fonteNormalizada, visualizacao)) {
                const consultaBase = prepararConsultaBaseVisualizacao(preparadoBase, DRILL_CACHE_MAX_ROWS);
                const linhasBase = await executarConsultaFirebirdGateway(
                    consultaBase.sql,
                    consultaBase.valores,
                    { ...opcoesCache, limite: consultaBase.limiteBaseMemoria + 1 }
                );
                const avaliacaoBase = avaliarBaseVisualizacaoEmMemoria(
                    linhasBase,
                    consultaBase.limiteBaseMemoria,
                    DRILL_CACHE_MAX_BYTES
                );

                if (avaliacaoBase.adequada) {
                    linhas = aplicarVisualizacaoEmMemoria(linhasBase, visualizacao).slice(0, LIMITE_RETORNO);
                    visualizacaoAplicadaEmMemoria = true;
                    estrategiaVisualizacao = 'cache-base';
                } else {
                    linhas = await executarConsultaFirebirdGateway(preparado.sql, preparado.valores, {
                        ...opcoesCache,
                        limite: preparado.agregarEmMemoria ? undefined : LIMITE_RETORNO
                    });
                    estrategiaVisualizacao = avaliacaoBase.excedeuLinhas
                        ? 'sql-agregado-limite-linhas'
                        : 'sql-agregado-limite-memoria';
                }
            } else {
                linhas = await executarConsultaFirebirdGateway(preparado.sql, preparado.valores, {
                    ...opcoesCache,
                    limite: preparado.agregarEmMemoria ? undefined : LIMITE_RETORNO
                });
            }
        }

        if (!visualizacaoAplicadaEmMemoria && preparado.agregarEmMemoria) {
            linhas = aplicarVisualizacaoEmMemoria(linhas, visualizacao).slice(0, LIMITE_RETORNO);
            visualizacaoAplicadaEmMemoria = true;
            estrategiaVisualizacao = 'execute-block-memoria';
        }
        const resultadoAgregado = preparado.resultadoAgregado === true || visualizacaoAplicadaEmMemoria;

        res.status(200).json({
            colunas: extrairColunas(linhas),
            linhas: linhas.length,
            limite: LIMITE_PREVIA,
            amostra: linhas.slice(0, LIMITE_PREVIA),
            dados: linhas,
            resultadoAgregado,
            estrategiaVisualizacao
        });
    } catch (error) {
        const status = fonteNormalizada === 'firebird' ? statusHttpErroConsulta(error) : 500;
        const codigo = String(error?.code || 'QUERY_ERROR');
        const mensagem = mensagemErroInfraestrutura(error, status);
        console.error('[executar-cenario] falha', { codigo, status, message: error?.message });
        if (status >= 503) res.setHeader('Retry-After', '1');
        res.status(status).json({
            error: mensagem,
            code: codigo,
            details: status >= 503 ? undefined : error.message
        });
    }
}

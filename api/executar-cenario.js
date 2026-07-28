import { db } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireRequestSession } from '../lib/session-token.js';
import { executarConsultaFirebird, statusHttpErroFirebird } from '../lib/firebird-client.js';
import { montarContextoConsulta, prepararSqlCenario } from '../lib/scenario-sql-parameters.js';
import { sqlEhExecuteBlock, validarSqlLeitura } from '../lib/scenario-sql-validation.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const permissionsPath = path.join(__dirname, 'crm-permissions.json');
const LIMITE_RETORNO = 1000;
const LIMITE_PREVIA = 100;
const CONSULTA_TIMEOUT_MS = 15000;

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

function citarIdentificador(nome) {
    const valor = String(nome || '').trim();
    if (!valor) throw new Error('Campo de agrupamento invalido.');
    return `"${valor.replace(/"/g, '""')}"`;
}

function normalizarCamposVisualizacao(campos) {
    const unicos = new Map();
    (Array.isArray(campos) ? campos : []).forEach(campo => {
        const coluna = String(campo?.coluna || '').trim();
        if (!coluna) return;
        const chave = coluna.toLowerCase();
        if (!unicos.has(chave)) unicos.set(chave, { ...campo, coluna });
    });
    return Array.from(unicos.values());
}

function prepararConsultaVisual(preparado, fonte, visualizacao = {}) {
    if (!visualizacao || visualizacao.agrupar !== true) return preparado;
    if (sqlEhExecuteBlock(preparado.sql)) return preparado;
    const dimensoes = normalizarCamposVisualizacao([
        ...(Array.isArray(visualizacao.dimensoes) ? visualizacao.dimensoes : []),
        ...(Array.isArray(visualizacao.colunas) ? visualizacao.colunas : [])
    ]);
    const valoresConfigurados = normalizarCamposVisualizacao(visualizacao.valores);
    if (!dimensoes.length || !valoresConfigurados.length) return preparado;

    const valores = [...preparado.valores];
    const marcador = valor => {
        valores.push(valor);
        return fonte === 'postgres' ? '$' + valores.length : '?';
    };
    const referencia = campo => `CRM_BASE.${citarIdentificador(campo.coluna)}`;
    const expressoesDimensao = dimensoes.map(campo => referencia(campo));
    const valoresComExpressao = valoresConfigurados.map(campo => {
        const referenciaCampo = referencia(campo);
        const agregacao = String(campo.agregacao || 'sum').toLowerCase();
        let expressao = `SUM(${referenciaCampo})`;
        if (agregacao === 'count') expressao = `COUNT(${referenciaCampo})`;
        else if (agregacao === 'count_distinct') expressao = `COUNT(DISTINCT ${referenciaCampo})`;
        else if (agregacao === 'min' || agregacao === 'none') expressao = `MIN(${referenciaCampo})`;
        else if (agregacao === 'max') expressao = `MAX(${referenciaCampo})`;
        else if (agregacao === 'avg') expressao = `AVG(${referenciaCampo})`;
        return { campo, expressao };
    });
    const expressoesValor = valoresComExpressao.map(item =>
        `${item.expressao} AS ${citarIdentificador(item.campo.coluna)}`
    );
    const filtrosDimensao = Array.isArray(visualizacao.filtrosDimensao) ? visualizacao.filtrosDimensao : [];
    const condicoes = filtrosDimensao.map(filtro => {
        const coluna = citarIdentificador(filtro?.coluna);
        if (filtro?.valor === null || filtro?.valor === undefined) return `CRM_BASE.${coluna} IS NULL`;
        return `CRM_BASE.${coluna} = ${marcador(filtro.valor)}`;
    });
    const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
    const referenciasOrdenacao = new Map([
        ...dimensoes.map(campo => [String(campo.coluna).toLowerCase(), referencia(campo)]),
        ...valoresComExpressao.map(item => [String(item.campo.coluna).toLowerCase(), item.expressao])
    ]);
    const ordem = [...dimensoes, ...valoresConfigurados]
        .filter(campo => ['asc', 'desc'].includes(String(campo.ordenacao).toLowerCase()))
        .map(campo => `${referenciasOrdenacao.get(String(campo.coluna).toLowerCase())} ${String(campo.ordenacao).toUpperCase()}`);
    const orderBy = ordem.length ? ` ORDER BY ${ordem.join(', ')}` : '';
    const sql = `SELECT ${[...expressoesDimensao, ...expressoesValor].join(', ')} FROM (${preparado.sql}) CRM_BASE${where} GROUP BY ${expressoesDimensao.join(', ')}${orderBy}`;
    return { sql, valores };
}

function extrairColunas(linhas) {
    if (!Array.isArray(linhas) || !linhas.length) return [];
    return Object.keys(linhas[0]);
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
    const erroValidacao = validarSqlLeitura(sql, fonteNormalizada);
    if (erroValidacao) return res.status(400).json({ error: erroValidacao });
    try {
        const contextoConsulta = montarContextoConsulta(filtros, session);
        const preparadoBase = prepararSqlCenario(sql, fonteNormalizada, contextoConsulta);
        const preparado = prepararConsultaVisual(preparadoBase, fonteNormalizada, visualizacao);
        let linhas = [];
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
            linhas = await executarConsultaFirebird(preparado.sql, preparado.valores, {
                operacao: 'executar-cenario',
                timeoutMs: CONSULTA_TIMEOUT_MS,
                limite: LIMITE_RETORNO
            });
        }

        res.status(200).json({
            colunas: extrairColunas(linhas),
            linhas: linhas.length,
            limite: LIMITE_PREVIA,
            amostra: linhas.slice(0, LIMITE_PREVIA),
            dados: linhas
        });
    } catch (error) {
        const status = fonteNormalizada === 'firebird' ? statusHttpErroFirebird(error) : 500;
        if (status >= 503) res.setHeader('Retry-After', '1');
        res.status(status).json({
            error: status >= 503 ? 'Banco temporariamente indisponível. Tente novamente.' : 'Erro ao executar consulta.',
            details: status >= 503 ? undefined : error.message
        });
    }
}

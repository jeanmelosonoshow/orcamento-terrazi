import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DASHBOARD_CONTEXTS = Object.freeze([
    'visao-geral',
    'clientes',
    'funil',
    'arquitetos',
    'reativacao',
]);

const RUNTIME_WIDGET_FIELDS = new Set([
    'dadosConsulta',
    'colunasConsulta',
    'dadosConsultaAgregados',
    'consultaAtualizadaEm',
    'proximidade',
    'desempenhoExecucao',
    'erroConsulta',
]);
const MAX_WIDGETS_PER_SCENARIO = 100;
const MAX_SCENARIO_BYTES = 2 * 1024 * 1024;
const PERMISSIONS_PATH = fileURLToPath(new URL('../api/crm-permissions.json', import.meta.url));
let schemaPromise = null;

export function normalizarContextoDashboard(value) {
    const contexto = String(value || '').trim().toLowerCase();
    return DASHBOARD_CONTEXTS.includes(contexto) ? contexto : '';
}

export function normalizarAlturaCanvas(value) {
    const altura = Number.parseInt(value, 10);
    if (!Number.isFinite(altura)) return 620;
    return Math.min(4000, Math.max(620, altura));
}

export function limparConfiguracaoWidgets(widgets) {
    if (!Array.isArray(widgets)) throw criarErro('A configuracao do cenario deve ser uma lista.', 400);
    if (widgets.length > MAX_WIDGETS_PER_SCENARIO) {
        throw criarErro(`O cenario aceita no maximo ${MAX_WIDGETS_PER_SCENARIO} cards.`, 400);
    }

    const limpos = widgets.map((widget, index) => limparValor(widget, `widgets[${index}]`));
    const serialized = JSON.stringify(limpos);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SCENARIO_BYTES) {
        throw criarErro('A configuracao do cenario ultrapassa o limite de 2 MB.', 413);
    }
    return limpos;
}

export function obterEditoresCenariosDashboard() {
    try {
        const config = JSON.parse(fs.readFileSync(PERMISSIONS_PATH, 'utf8'));
        const ids = config.scenarioEditorFuncionarioIds || config.cenarios?.editoresIdFuncionario || [];
        return Array.isArray(ids) ? ids.map(id => String(id).trim()).filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

export function podeEditarCenariosDashboard(session = {}, editores = obterEditoresCenariosDashboard()) {
    const idFuncionario = String(session.sub || session.idfuncionario || '').trim();
    return Boolean(idFuncionario && Array.isArray(editores) && editores.includes(idFuncionario));
}

export function normalizarLinhaCenario(linha = {}) {
    return {
        contexto: linha.contexto,
        widgets: Array.isArray(linha.configuracao) ? linha.configuracao : [],
        alturaCanvas: normalizarAlturaCanvas(linha.altura_canvas),
        versao: Number(linha.versao || 0),
        atualizadoEm: linha.atualizado_em || null,
        atualizadoPor: linha.atualizado_por == null ? null : String(linha.atualizado_por),
    };
}

export async function garantirSchemaCenariosDashboard() {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            const { db } = await import('@vercel/postgres');
            await db.query(`
                CREATE TABLE IF NOT EXISTS crm_dashboard_cenario (
                    contexto VARCHAR(40) PRIMARY KEY,
                    configuracao JSONB NOT NULL DEFAULT '[]'::jsonb,
                    altura_canvas INTEGER NOT NULL DEFAULT 620,
                    versao BIGINT NOT NULL DEFAULT 1,
                    atualizado_por VARCHAR(50),
                    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT crm_dashboard_cenario_contexto_check
                        CHECK (contexto IN ('visao-geral', 'clientes', 'funil', 'arquitetos', 'reativacao')),
                    CONSTRAINT crm_dashboard_cenario_altura_check
                        CHECK (altura_canvas BETWEEN 620 AND 4000)
                )
            `);
            await db.query(`
                CREATE TABLE IF NOT EXISTS crm_dashboard_cenario_historico (
                    id BIGSERIAL PRIMARY KEY,
                    contexto VARCHAR(40) NOT NULL,
                    configuracao JSONB NOT NULL,
                    altura_canvas INTEGER NOT NULL,
                    versao BIGINT NOT NULL,
                    atualizado_por VARCHAR(50),
                    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);
            await db.query(`
                CREATE INDEX IF NOT EXISTS crm_dashboard_cenario_historico_contexto_idx
                    ON crm_dashboard_cenario_historico (contexto, versao DESC)
            `);
        })().catch(error => {
            schemaPromise = null;
            throw error;
        });
    }
    return schemaPromise;
}

function limparValor(value, path) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map((item, index) => limparValor(item, `${path}[${index}]`));
    if (typeof value !== 'object') return null;

    const clean = {};
    for (const [key, item] of Object.entries(value)) {
        if (RUNTIME_WIDGET_FIELDS.has(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        clean[key] = limparValor(item, `${path}.${key}`);
    }
    return clean;
}

function criarErro(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

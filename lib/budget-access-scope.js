import { executarConsultaFirebirdGateway } from './bi-gateway-client.js';

const CATEGORIAS_POR_NOME = {
    DIRETOR: 'DI',
    SUPERVISOR: 'SU',
    GERENTE: 'GR',
    VENDEDOR: 'VD',
    CAIXA: 'CX'
};

export function normalizarCategoriaAcessoOrcamento(valor) {
    const categoria = String(valor || '').trim().toUpperCase();
    return CATEGORIAS_POR_NOME[categoria] || categoria;
}

export function sqlUsaFiliaisPermitidas(sql) {
    return /:filiais_permitidas\b/i.test(String(sql || ''));
}

function normalizarFiliaisPermitidas(valor) {
    if (!Array.isArray(valor)) return [];
    return Array.from(new Set(valor
        .map(item => String(item || '').trim().toUpperCase())
        .filter(item => /^[A-Z0-9]{1,2}$/.test(item))));
}

export async function resolverFiliaisPermitidasOrcamento(session = {}, opcoes = {}) {
    const categoria = normalizarCategoriaAcessoOrcamento(session.categoria);
    const idfilial = String(session.idfilial || '').trim();

    // DI e VD nao dependem da lista: DI acessa tudo e VD e restringido pelo funcionario.
    if (['DI', 'VD'].includes(categoria)) return ['__TODAS__'];
    if (['GR', 'CX'].includes(categoria)) return idfilial ? [idfilial] : [];
    if (categoria !== 'SU') return [];

    if (Array.isArray(session.filiaisPermitidas)) {
        return normalizarFiliaisPermitidas(session.filiaisPermitidas);
    }

    const idfuncionario = Number(session.sub || 0);
    if (!Number.isSafeInteger(idfuncionario) || idfuncionario <= 0) return [];
    const executarFirebird = opcoes.executarFirebird || executarConsultaFirebirdGateway;
    const linhas = await executarFirebird(`
        SELECT F.IDFILIAL
          FROM FILIAL F
         WHERE F.IDSUPERVISOR = ?
         ORDER BY F.IDFILIAL
    `, [idfuncionario], {
        operacao: 'escopo-filiais-orcamento',
        timeoutMs: 12000,
        cacheTtlMs: 0,
        cacheStaleMs: 0
    });
    return Array.from(new Set((Array.isArray(linhas) ? linhas : [])
        .map(linha => String(linha.IDFILIAL || linha.idfilial || '').trim())
        .filter(Boolean)));
}

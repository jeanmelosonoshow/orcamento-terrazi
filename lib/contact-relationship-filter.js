import crypto from 'crypto';

const STATUS_VALIDOS = new Set(['PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO']);
const TIPOS_VALIDOS = new Set(['SEM CONTATO', 'WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM']);
const LIMITE_DOCUMENTOS_RELACIONAMENTO = 15000;
const consultasRelacionamentoEmAndamento = new Map();
const FONTES_RELACIONAMENTO = Object.freeze({
    clientes: {
        tabela: 'controle_contato',
        campo: 'doctocliente',
        descricao: 'clientes'
    },
    funil: {
        tabela: 'controle_contato_orcamento',
        campo: 'orcamento_id',
        descricao: 'orcamentos'
    }
});

function normalizarSelecao(valores, permitidos) {
    return Array.from(new Set((Array.isArray(valores) ? valores : [])
        .map(valor => String(valor || '').trim().toUpperCase())
        .filter(valor => permitidos.has(valor))));
}

function normalizarData(valor) {
    const texto = String(valor || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

export function sqlPossuiFiltroRelacionamento(sql) {
    return /\/\*\s*(?:operador\s*=\s*(?:AND|OR)\s*\|\s*)?relacionamento\s*\|\s*campo\s*:/i.test(String(sql || ''));
}

function criarChaveFiltroRelacionamento({ contexto, status, tipos, dataInicial, dataFinal, versao }) {
    const assinatura = JSON.stringify({ contexto, status: [...status].sort(), tipos: [...tipos].sort(), dataInicial, dataFinal, versao });
    return `contact-relationship-v2:${crypto.createHash('sha256').update(assinatura).digest('hex')}`;
}

async function consultarFiltroRelacionamento(db, { fonte, status, tipos, dataInicial, dataFinal }) {
    const clienteSemContatoAtende = status.includes('PENDENTE')
        && tipos.includes('SEM CONTATO')
        && !dataInicial
        && !dataFinal;
    const condicao = `
        status_contato = ANY($1::text[])
        AND COALESCE(tipo_contato, 'SEM CONTATO') = ANY($2::text[])
        AND ($3::date IS NULL OR data_ultima_atualizacao::date >= $3::date)
        AND ($4::date IS NULL OR data_ultima_atualizacao::date <= $4::date)
    `;
    const criterio = clienteSemContatoAtende ? `NOT (${condicao})` : condicao;
    const resultado = await db.query(`
        SELECT ${fonte.campo} AS chave_relacionamento
          FROM ${fonte.tabela}
         WHERE ${criterio}
         ORDER BY ${fonte.campo}
         LIMIT ${LIMITE_DOCUMENTOS_RELACIONAMENTO + 1}
    `, [status, tipos, dataInicial, dataFinal]);
    const documentos = (resultado.rows || [])
        .map(linha => String(linha.chave_relacionamento ?? linha[fonte.campo] ?? '').trim())
        .filter(Boolean);

    if (documentos.length > LIMITE_DOCUMENTOS_RELACIONAMENTO) {
        const error = new Error(`O filtro de relacionamento encontrou mais de 15.000 ${fonte.descricao}. Restrinja status, tipo ou periodo de atualizacao.`);
        error.code = 'CONTACT_FILTER_TOO_LARGE';
        throw error;
    }

    if (!documentos.length) {
        return { modo: clienteSemContatoAtende ? 'todos' : 'nenhum', documentos: [] };
    }
    return {
        modo: clienteSemContatoAtende ? 'excluir' : 'incluir',
        documentos
    };
}

export async function resolverFiltroRelacionamento(db, filtros = {}, opcoes = {}) {
    const contexto = String(filtros.contextoDashboard || '').trim().toLowerCase();
    const fonte = FONTES_RELACIONAMENTO[contexto];
    if (!fonte) {
        return { modo: 'todos', documentos: [] };
    }

    const status = normalizarSelecao(filtros.statusContato, STATUS_VALIDOS);
    const tipos = normalizarSelecao(filtros.tiposContato, TIPOS_VALIDOS);
    const dataInicial = normalizarData(filtros.dataContatoInicial);
    const dataFinal = normalizarData(filtros.dataContatoFinal);
    if (!status.length || !tipos.length) return { modo: 'nenhum', documentos: [] };

    const parametros = { fonte, status, tipos, dataInicial, dataFinal };
    const cache = opcoes.cache;
    if (!cache) return consultarFiltroRelacionamento(db, parametros);

    const agora = Date.now();
    const ttlMs = Math.min(300000, Math.max(5000, Number(opcoes.ttlMs) || 60000));
    const chave = criarChaveFiltroRelacionamento({
        contexto,
        ...parametros,
        versao: String(filtros.versaoRelacionamento || '')
    });
    try {
        const item = await cache.obter(chave);
        if (item?.freshUntil > agora && item?.value) return { ...item.value, cache: 'HIT' };
    } catch (error) {
        opcoes.logger?.warn?.('[relacionamento] cache indisponivel', { operacao: 'obter', message: error.message });
    }

    const compartilhada = consultasRelacionamentoEmAndamento.get(chave);
    if (compartilhada) return { ...(await compartilhada), cache: 'COALESCED' };

    const consulta = consultarFiltroRelacionamento(db, parametros);
    consultasRelacionamentoEmAndamento.set(chave, consulta);
    try {
        const valor = await consulta;
        try {
            await cache.definir(chave, { value: valor, freshUntil: agora + ttlMs, staleUntil: agora + ttlMs });
        } catch (error) {
            opcoes.logger?.warn?.('[relacionamento] cache indisponivel', { operacao: 'definir', message: error.message });
        }
        return { ...valor, cache: 'MISS' };
    } finally {
        if (consultasRelacionamentoEmAndamento.get(chave) === consulta) consultasRelacionamentoEmAndamento.delete(chave);
    }
}

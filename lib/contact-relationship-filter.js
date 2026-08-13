const STATUS_VALIDOS = new Set(['PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO']);
const TIPOS_VALIDOS = new Set(['SEM CONTATO', 'WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM']);
const LIMITE_DOCUMENTOS_RELACIONAMENTO = 15000;

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

export async function resolverFiltroRelacionamento(db, filtros = {}) {
    if (filtros.contextoDashboard !== 'clientes') {
        return { modo: 'todos', documentos: [] };
    }

    const status = normalizarSelecao(filtros.statusContato, STATUS_VALIDOS);
    const tipos = normalizarSelecao(filtros.tiposContato, TIPOS_VALIDOS);
    const dataInicial = normalizarData(filtros.dataContatoInicial);
    const dataFinal = normalizarData(filtros.dataContatoFinal);
    if (!status.length || !tipos.length) return { modo: 'nenhum', documentos: [] };

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
        SELECT doctocliente
          FROM controle_contato
         WHERE ${criterio}
         ORDER BY doctocliente
         LIMIT ${LIMITE_DOCUMENTOS_RELACIONAMENTO + 1}
    `, [status, tipos, dataInicial, dataFinal]);
    const documentos = (resultado.rows || [])
        .map(linha => String(linha.doctocliente || '').trim())
        .filter(Boolean);

    if (documentos.length > LIMITE_DOCUMENTOS_RELACIONAMENTO) {
        const error = new Error('O filtro de relacionamento encontrou mais de 15.000 clientes. Restrinja status, tipo ou período de atualização.');
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

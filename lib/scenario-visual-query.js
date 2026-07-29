import { sqlEhExecuteBlock } from './scenario-sql-validation.js';

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

export function prepararConsultaVisual(preparado, fonte, visualizacao = {}) {
    if (!visualizacao || visualizacao.agrupar !== true) return preparado;
    if (sqlEhExecuteBlock(preparado.sql)) return preparado;
    const dimensoes = normalizarCamposVisualizacao([
        ...(Array.isArray(visualizacao.dimensoes) ? visualizacao.dimensoes : []),
        ...(Array.isArray(visualizacao.colunas) ? visualizacao.colunas : [])
    ]);
    const valoresConfigurados = normalizarCamposVisualizacao(visualizacao.valores);
    if (!valoresConfigurados.length) return preparado;

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
    const groupBy = expressoesDimensao.length ? ` GROUP BY ${expressoesDimensao.join(', ')}` : '';
    const orderBy = ordem.length ? ` ORDER BY ${ordem.join(', ')}` : '';
    const sql = `SELECT ${[...expressoesDimensao, ...expressoesValor].join(', ')} FROM (${preparado.sql}) CRM_BASE${where}${groupBy}${orderBy}`;
    return { sql, valores };
}

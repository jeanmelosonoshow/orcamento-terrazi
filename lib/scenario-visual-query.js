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

function obterValorLinha(linha, coluna) {
    if (!linha || !coluna) return undefined;
    if (Object.prototype.hasOwnProperty.call(linha, coluna)) return linha[coluna];
    const chave = Object.keys(linha).find(item => item.toLowerCase() === String(coluna).toLowerCase());
    return chave ? linha[chave] : undefined;
}

function chaveAgrupamento(valor) {
    if (valor === null) return 'null:';
    if (valor === undefined) return 'undefined:';
    return `${typeof valor}:${String(valor)}`;
}

function agregarValores(valores, agregacao) {
    const preenchidos = valores.filter(valor => valor !== null && valor !== undefined && valor !== '');
    if (agregacao === 'count') return preenchidos.length;
    if (agregacao === 'count_distinct') return new Set(preenchidos.map(chaveAgrupamento)).size;
    if (!preenchidos.length) return agregacao === 'sum' ? 0 : null;

    const numeros = preenchidos.map(Number).filter(Number.isFinite);
    if (agregacao === 'sum') return numeros.reduce((total, numero) => total + numero, 0);
    if (agregacao === 'avg') return numeros.length
        ? numeros.reduce((total, numero) => total + numero, 0) / numeros.length
        : null;
    if (agregacao === 'max') return numeros.length ? Math.max(...numeros) : null;
    if (agregacao === 'min' || agregacao === 'none') return numeros.length ? Math.min(...numeros) : null;
    return preenchidos[0];
}

function valoresEquivalentes(atual, esperado) {
    if (atual === esperado) return true;
    if (atual === null || atual === undefined || esperado === null || esperado === undefined) return false;
    return String(atual) === String(esperado);
}

function compararValores(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    const numeroA = Number(a);
    const numeroB = Number(b);
    if (Number.isFinite(numeroA) && Number.isFinite(numeroB)) return numeroA - numeroB;
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function aplicarVisualizacaoEmMemoria(linhas, visualizacao = {}) {
    if (!visualizacao || visualizacao.agrupar !== true) return Array.isArray(linhas) ? linhas : [];
    const dimensoes = normalizarCamposVisualizacao([
        ...(Array.isArray(visualizacao.dimensoes) ? visualizacao.dimensoes : []),
        ...(Array.isArray(visualizacao.colunas) ? visualizacao.colunas : [])
    ]);
    const valores = normalizarCamposVisualizacao(visualizacao.valores);
    if (!valores.length) return Array.isArray(linhas) ? linhas : [];

    const filtros = Array.isArray(visualizacao.filtrosDimensao) ? visualizacao.filtrosDimensao : [];
    const filtradas = (Array.isArray(linhas) ? linhas : []).filter(linha =>
        filtros.every(filtro => valoresEquivalentes(obterValorLinha(linha, filtro?.coluna), filtro?.valor))
    );
    const grupos = new Map();

    filtradas.forEach(linha => {
        const valoresDimensao = dimensoes.map(campo => obterValorLinha(linha, campo.coluna));
        const chave = valoresDimensao.map(chaveAgrupamento).join('|');
        if (!grupos.has(chave)) grupos.set(chave, { valoresDimensao, linhas: [] });
        grupos.get(chave).linhas.push(linha);
    });
    if (!dimensoes.length && !grupos.size) grupos.set('__total__', { valoresDimensao: [], linhas: [] });

    const resultado = Array.from(grupos.values()).map(grupo => {
        const linha = {};
        dimensoes.forEach((campo, indice) => {
            linha[campo.coluna] = grupo.valoresDimensao[indice];
        });
        valores.forEach(campo => {
            linha[campo.coluna] = agregarValores(
                grupo.linhas.map(item => obterValorLinha(item, campo.coluna)),
                String(campo.agregacao || 'sum').toLowerCase()
            );
        });
        return linha;
    });

    const ordenacoes = [...dimensoes, ...valores]
        .filter(campo => ['asc', 'desc'].includes(String(campo.ordenacao).toLowerCase()));
    if (ordenacoes.length) {
        resultado.sort((a, b) => {
            for (const campo of ordenacoes) {
                const comparacao = compararValores(obterValorLinha(a, campo.coluna), obterValorLinha(b, campo.coluna));
                if (comparacao !== 0) return String(campo.ordenacao).toLowerCase() === 'desc' ? -comparacao : comparacao;
            }
            return 0;
        });
    }
    return resultado;
}

export function prepararConsultaVisual(preparado, fonte, visualizacao = {}) {
    if (!visualizacao || visualizacao.agrupar !== true) return preparado;
    if (sqlEhExecuteBlock(preparado.sql)) return { ...preparado, agregarEmMemoria: true };
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
    return { sql, valores, resultadoAgregado: true };
}

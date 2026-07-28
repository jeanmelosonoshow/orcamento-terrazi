function normalizarLista(valor) {
    if (Array.isArray(valor)) return valor.map(item => String(item).trim()).filter(Boolean);
    return String(valor || '').split(',').map(item => item.trim()).filter(Boolean);
}

export function montarContextoConsulta(filtros = {}, session = {}) {
    return {
        ...filtros,
        categoria: String(session.categoria || '').trim().toUpperCase(),
        idfuncionario: String(session.sub || '').trim(),
        idfilial: String(session.idfilial || '').trim(),
        idvendedor: String(session.idvendedor || '').trim()
    };
}

export function prepararSqlCenario(sql, fonte, filtros = {}) {
    const valores = [];
    const marcador = () => fonte === 'postgres' ? `$${valores.length}` : '?';
    const adicionarValor = valor => {
        valores.push(valor === undefined || valor === '' ? null : valor);
        return marcador();
    };
    const adicionarLista = valor => {
        const lista = normalizarLista(valor);
        if (!lista.length) {
            valores.push('__SEM_VALOR__');
            return marcador();
        }
        return lista.map(item => adicionarValor(item)).join(',');
    };

    const mapa = {
        categoria: () => adicionarValor(filtros.categoria),
        data_inicial: () => adicionarValor(filtros.dataInicial),
        data_final: () => adicionarValor(filtros.dataFinal),
        idfuncionario: () => adicionarValor(filtros.idfuncionario),
        idfilial: () => adicionarValor(filtros.idfilial),
        idvendedor: () => adicionarValor(filtros.idvendedor),
        filiais: () => adicionarLista(filtros.filiais),
        vendedores: () => adicionarLista(filtros.vendedores)
    };

    const nomes = Object.keys(mapa).join('|');
    const texto = String(sql).replace(new RegExp(`:(${nomes})\\b`, 'gi'), (_, nome) => mapa[nome.toLowerCase()]());
    return { sql: texto, valores };
}

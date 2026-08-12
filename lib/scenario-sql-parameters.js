import { mascararComentariosELiterais, sqlEhExecuteBlock } from './scenario-sql-validation.js';

function normalizarLista(valor) {
    if (Array.isArray(valor)) return valor.map(item => String(item).trim()).filter(Boolean);
    return String(valor || '').split(',').map(item => item.trim()).filter(Boolean);
}

function normalizarCategoria(valor) {
    const categoria = String(valor || '').trim().toUpperCase();
    const categoriasPorNome = {
        VENDEDOR: 'VD',
        CAIXA: 'CX',
        GERENTE: 'GR',
        SUPERVISOR: 'SU',
        DIRETOR: 'DI'
    };
    return categoriasPorNome[categoria] || categoria;
}

const parametrosCenario = {
    categoria: { tipo: 'VARCHAR(20)', filtro: 'categoria' },
    data_inicial: { tipo: 'VARCHAR(10)', filtro: 'dataInicial', data: true },
    data_final: { tipo: 'VARCHAR(10)', filtro: 'dataFinal', data: true },
    idfuncionario: { tipo: 'VARCHAR(50)', filtro: 'idfuncionario' },
    idfilial: { tipo: 'VARCHAR(50)', filtro: 'idfilial' },
    idvendedor: { tipo: 'VARCHAR(50)', filtro: 'idvendedor' },
    filiais: { tipo: 'VARCHAR(50)', filtro: 'filiais', lista: true },
    vendedores: { tipo: 'VARCHAR(50)', filtro: 'vendedores', lista: true },
    status_contato: { tipo: 'VARCHAR(40)', filtro: 'statusContato', lista: true },
    tipos_contato: { tipo: 'VARCHAR(40)', filtro: 'tiposContato', lista: true },
    cliente_contato: { tipo: 'VARCHAR(120)', filtro: 'clienteContato' },
    data_contato_inicial: { tipo: 'VARCHAR(10)', filtro: 'dataContatoInicial', data: true },
    data_contato_final: { tipo: 'VARCHAR(10)', filtro: 'dataContatoFinal', data: true },
    detalhe_valor: { tipo: 'VARCHAR(500)', filtro: 'detalheValor' },
    detalhe_campo: { tipo: 'VARCHAR(120)', filtro: 'detalheCampo' },
    detalhe_serie: { tipo: 'VARCHAR(200)', filtro: 'detalheSerie' }
};

function substituirOcorrencias(texto, substituicoes) {
    let resultado = texto;
    [...substituicoes].reverse().forEach(item => {
        resultado = resultado.slice(0, item.inicio) + item.valor + resultado.slice(item.fim);
    });
    return resultado;
}

function aplicarDiretivasFiltrosOpcionais(sql, filtros = {}) {
    const texto = String(sql || '');
    const diretiva = /\/\*\s*(?:operador\s*=\s*(AND|OR)\s*\|\s*)?campo\s*:\s*([a-z_][a-z0-9_$]*(?:\s*\.\s*[a-z_][a-z0-9_$]*)*)\s*\|\s*filtro\s*=\s*:(filiais|vendedores)\s*\*\//gi;

    const resultado = texto.replace(diretiva, (_, operadorInformado, campoInformado, filtro) => {
        const operador = String(operadorInformado || 'AND').toUpperCase();
        const nomeFiltro = String(filtro).toLowerCase();
        const todosSelecionados = filtros[nomeFiltro + 'Todos'] === true;
        if (todosSelecionados) return operador === 'OR' ? 'OR 1 = 1' : '';

        const campo = String(campoInformado)
            .split('.')
            .map(parte => parte.trim())
            .join('.');
        const selecionados = normalizarLista(filtros[nomeFiltro]);
        if (!selecionados.length) return `${operador} 1 = 0`;
        return `${operador} ${campo} IN (:${nomeFiltro})`;
    });
    if (/\/\*\s*(?:operador\b|campo\s*:)/i.test(resultado)) {
        throw new Error('Diretiva de filtro opcional invalida. Use /* operador = AND | campo: ALIAS.CAMPO | filtro = :filiais */ ou :vendedores.');
    }
    return resultado;
}
function neutralizarFiltrosLista(sql, categoria) {
    if (!['VD', 'CX'].includes(categoria)) return String(sql || '');

    const texto = String(sql || '');
    const mascarado = mascararComentariosELiterais(texto);
    const substituicoes = [];
    const padrao = /(?:\b[a-z_][a-z0-9_$]*\s*\.\s*)?\b[a-z_][a-z0-9_$]*\s+in\s*\(\s*:(filiais|vendedores)\s*\)/gi;
    let match;

    while ((match = padrao.exec(mascarado)) !== null) {
        substituicoes.push({
            inicio: match.index,
            fim: match.index + match[0].length,
            valor: '1 = 1'
        });
    }

    return substituirOcorrencias(texto, substituicoes);
}

function encontrarFimParametros(textoMascarado, inicio) {
    let nivel = 0;
    for (let indice = inicio; indice < textoMascarado.length; indice += 1) {
        if (textoMascarado[indice] === '(') nivel += 1;
        else if (textoMascarado[indice] === ')') {
            nivel -= 1;
            if (nivel === 0) return indice;
        }
    }
    return -1;
}

function inserirParametrosExecuteBlock(sql, declaracoes) {
    const mascarado = mascararComentariosELiterais(sql);
    const cabecalho = mascarado.match(/^\s*execute\s+block\b/i);
    if (!cabecalho) return sql;
    let posicao = cabecalho[0].length;
    while (/\s/.test(mascarado[posicao] || '')) posicao += 1;
    const declaracoesSql = declaracoes.join(',\n    ');
    if (mascarado[posicao] !== '(') {
        return sql.slice(0, cabecalho[0].length) + ' (\n    ' + declaracoesSql + '\n)' + sql.slice(cabecalho[0].length);
    }
    const fim = encontrarFimParametros(mascarado, posicao);
    if (fim < 0) throw new Error('Parametros de entrada invalidos no EXECUTE BLOCK.');
    const existentes = sql.slice(posicao + 1, fim).trim();
    const novos = existentes ? existentes + ',\n    ' + declaracoesSql : declaracoesSql;
    return sql.slice(0, posicao) + '(\n    ' + novos + '\n)' + sql.slice(fim + 1);
}

function prepararExecuteBlock(sql, filtros) {
    const texto = String(sql || '');
    const mascarado = mascararComentariosELiterais(texto);
    const nomes = Object.keys(parametrosCenario).join('|');
    const regex = new RegExp(':(' + nomes + ')\\b', 'gi');
    const valores = [];
    const declaracoes = [];
    const referencias = new Map();
    const substituicoes = [];
    let match;
    while ((match = regex.exec(mascarado)) !== null) {
        const nome = match[1].toLowerCase();
        const configuracao = parametrosCenario[nome];
        if (!referencias.has(nome)) {
            const lista = configuracao.lista ? normalizarLista(filtros[configuracao.filtro]) : [];
            const itens = configuracao.lista
                ? (lista.length ? lista : ['__SEM_VALOR__'])
                : [filtros[configuracao.filtro] === undefined || filtros[configuracao.filtro] === '' ? null : filtros[configuracao.filtro]];
            const nomesInternos = itens.map((valor, indice) => {
                const sufixo = configuracao.lista ? '_' + (indice + 1) : '';
                const nomeInterno = 'CRM_SYS_' + nome.toUpperCase() + sufixo;
                declaracoes.push(nomeInterno + ' ' + configuracao.tipo + ' = ?');
                valores.push(valor);
                return nomeInterno;
            });
            referencias.set(nome, nomesInternos);
        }
        substituicoes.push({
            inicio: match.index,
            fim: match.index + match[0].length,
            valor: referencias.get(nome)
                .map(item => configuracao.data ? 'CAST(:' + item + ' AS DATE)' : ':' + item)
                .join(',')
        });
    }
    if (!substituicoes.length) return { sql: texto, valores: [] };
    const substituido = substituirOcorrencias(texto, substituicoes);
    return { sql: inserirParametrosExecuteBlock(substituido, declaracoes), valores };
}

export function montarContextoConsulta(filtros = {}, session = {}) {
    const categoria = normalizarCategoria(session.categoria);
    const semFiltrosFilialVendedor = ['VD', 'CX'].includes(categoria);
    return {
        ...filtros,
        ...(semFiltrosFilialVendedor
            ? { filiais: [], vendedores: [], filiaisTodos: true, vendedoresTodos: true }
            : {}),
        categoria,
        idfuncionario: String(session.sub || '').trim(),
        idfilial: categoria === 'VD' ? '' : String(session.idfilial || '').trim(),
        idvendedor: categoria === 'CX' ? '' : String(session.idvendedor || '').trim(),
        ...(filtros.detalheValor !== undefined ? { detalheValor: filtros.detalheValor === null ? '' : String(filtros.detalheValor).slice(0, 500) } : {}),
        ...(filtros.detalheCampo !== undefined ? { detalheCampo: String(filtros.detalheCampo || '').trim().slice(0, 120) } : {}),
        ...(filtros.detalheSerie !== undefined ? { detalheSerie: String(filtros.detalheSerie || '').trim().slice(0, 200) } : {})
    };
}

export function prepararSqlCenario(sql, fonte, filtros = {}) {
    const categoria = normalizarCategoria(filtros.categoria);
    const sqlComFiltrosOpcionais = aplicarDiretivasFiltrosOpcionais(sql, filtros);
    const sqlPermitido = neutralizarFiltrosLista(sqlComFiltrosOpcionais, categoria);
    if (String(fonte).toLowerCase() === 'firebird' && sqlEhExecuteBlock(sqlPermitido)) {
        return prepararExecuteBlock(sqlPermitido, filtros);
    }
    const valores = [];
    const marcador = () => fonte === 'postgres' ? '$' + valores.length : '?';
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
        vendedores: () => adicionarLista(filtros.vendedores),
        status_contato: () => adicionarLista(filtros.statusContato),
        tipos_contato: () => adicionarLista(filtros.tiposContato),
        cliente_contato: () => adicionarValor(filtros.clienteContato),
        data_contato_inicial: () => adicionarValor(filtros.dataContatoInicial),
        data_contato_final: () => adicionarValor(filtros.dataContatoFinal),
        detalhe_valor: () => adicionarValor(filtros.detalheValor),
        detalhe_campo: () => adicionarValor(filtros.detalheCampo),
        detalhe_serie: () => adicionarValor(filtros.detalheSerie)
    };
    const nomes = Object.keys(mapa).join('|');
    const texto = sqlPermitido.replace(new RegExp(':(' + nomes + ')\\b', 'gi'), (_, nome) => mapa[nome.toLowerCase()]());
    return { sql: texto, valores };
}

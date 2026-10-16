import { sqlEhExecuteBlock } from './scenario-sql-validation.js';

const MAX_CAMPOS_CHAVE = 8;
const MAX_LINHAS_LOTE = 250;
const MAX_CAMPOS_VIRTUAIS = 32;

function erro(mensagem, codigo = 'INTERQUERY_RELATIONSHIP_INVALID') {
    const falha = new Error(mensagem);
    falha.status = 400;
    falha.code = codigo;
    return falha;
}

function chaveNormalizada(valor) {
    return String(valor || '').trim().toLowerCase();
}

function extrairDeclaracoes(sql) {
    const declaracoes = [];
    const texto = String(sql || '');
    const padrao = /\/\*\s*RELACIONAR\b([\s\S]*?)\*\//gi;
    let match;
    while ((match = padrao.exec(texto)) !== null) {
        const atributos = {};
        const conteudo = String(match[1] || '').replace(/^\s*[|:]\s*/, '');
        const atributo = /([a-z_][a-z0-9_]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^|\r\n]+))/gi;
        let item;
        while ((item = atributo.exec(conteudo)) !== null) {
            atributos[chaveNormalizada(item[1])] = String(item[2] ?? item[3] ?? item[4] ?? '').trim();
        }
        const apelido = atributos.apelido;
        if (!apelido || !/^[a-z_][a-z0-9_$]*$/i.test(apelido)) {
            throw erro('A diretiva RELACIONAR precisa de um apelido simples, por exemplo: apelido: rel_orcamento.');
        }
        declaracoes.push({
            inicio: match.index,
            fim: match.index + match[0].length,
            apelido,
            consulta: atributos.consulta || '',
            campoPadrao: atributos.campo || ''
        });
    }
    return declaracoes;
}

function removerTrechos(texto, trechos) {
    let resultado = texto;
    [...trechos].reverse().forEach(item => {
        resultado = resultado.slice(0, item.inicio) + ' ' + resultado.slice(item.fim);
    });
    return resultado;
}

function mapaCaseInsensitive(objeto = {}) {
    return new Map(Object.entries(objeto || {}).map(([nome, valor]) => [chaveNormalizada(nome), valor]));
}

export function prepararDiretivasRelacionar(sql, relacionamento = null) {
    const texto = String(sql || '');
    const declaracoes = extrairDeclaracoes(texto);
    if (!declaracoes.length) return { sql: texto, parametros: {}, apelido: '' };
    if (declaracoes.length > 1) throw erro('Use somente uma declaracao RELACIONAR em cada consulta adicional.');
    if (!relacionamento || typeof relacionamento !== 'object') {
        throw erro('A consulta declarou RELACIONAR, mas nao recebeu o resultado da consulta de origem.');
    }
    if (sqlEhExecuteBlock(texto)) {
        throw erro('Campos virtuais RELACIONAR ainda nao podem ser usados dentro de EXECUTE BLOCK.');
    }

    const declaracao = declaracoes[0];
    const apelidoRecebido = String(relacionamento.apelido || declaracao.apelido).trim();
    if (chaveNormalizada(apelidoRecebido) !== chaveNormalizada(declaracao.apelido)) {
        throw erro(`O apelido RELACIONAR esperado e "${declaracao.apelido}".`);
    }
    const consultaRecebida = String(relacionamento.consulta || '').trim();
    if (declaracao.consulta && chaveNormalizada(consultaRecebida) !== chaveNormalizada(declaracao.consulta)) {
        throw erro(`O relacionamento "${declaracao.apelido}" deve receber dados da consulta "${declaracao.consulta}".`);
    }

    const virtuais = mapaCaseInsensitive(relacionamento.virtuais);
    if (virtuais.size > MAX_CAMPOS_VIRTUAIS) throw erro('O relacionamento excedeu o limite de campos virtuais.');
    let resultado = removerTrechos(texto, declaracoes);
    const parametros = {};
    let sequencia = 0;
    const obterParametro = campo => {
        const chaveCompleta = chaveNormalizada(`${declaracao.apelido}.${campo}`);
        const chaveCampo = chaveNormalizada(campo);
        const possuiCompleta = virtuais.has(chaveCompleta);
        const possuiCampo = virtuais.has(chaveCampo);
        if (!possuiCompleta && !possuiCampo) {
            throw erro(`O campo virtual "${declaracao.apelido}.${campo}" nao foi retornado pela consulta de origem.`);
        }
        sequencia += 1;
        const nome = `crm_rel_virtual_${sequencia}`;
        parametros[nome] = possuiCompleta ? virtuais.get(chaveCompleta) : virtuais.get(chaveCampo);
        return `:${nome}`;
    };

    const apelidoEscapado = declaracao.apelido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    resultado = resultado.replace(
        new RegExp(`/\\*\\s*${apelidoEscapado}\\.([a-z_][a-z0-9_$]*)\\s*\\*/`, 'gi'),
        (_, campo) => obterParametro(campo)
    );
    resultado = resultado.replace(
        new RegExp(`/\\*\\s*${apelidoEscapado}\\s*\\*/`, 'gi'),
        () => {
            if (!declaracao.campoPadrao) {
                throw erro(`Use /* ${declaracao.apelido}.CAMPO */ ou informe campo: CAMPO na declaracao RELACIONAR.`);
            }
            return obterParametro(declaracao.campoPadrao);
        }
    );
    if (/\/\*\s*[a-z_][a-z0-9_$]*\.[a-z_][a-z0-9_$]*\s*\*\//i.test(resultado)) {
        throw erro('Existe um campo virtual com apelido diferente da declaracao RELACIONAR.');
    }
    return { sql: resultado, parametros, apelido: declaracao.apelido };
}

function validarNomeColuna(nome) {
    const texto = String(nome || '').trim();
    if (!texto || texto.length > 128 || /[\u0000-\u001f]/.test(texto)) {
        throw erro('Um campo de relacionamento possui nome invalido.');
    }
    return texto;
}

function citarIdentificador(nome) {
    return `"${validarNomeColuna(nome).replace(/"/g, '""')}"`;
}

export function aplicarFiltroRelacionarPreparado(preparado, fonte, relacionamento = null) {
    if (!relacionamento || typeof relacionamento !== 'object') return { ...preparado, relacionamentoAplicado: false };
    const chaves = Array.isArray(relacionamento.chaves) ? relacionamento.chaves : [];
    const linhas = Array.isArray(relacionamento.linhas) ? relacionamento.linhas : [];
    if (!chaves.length || chaves.length > MAX_CAMPOS_CHAVE) {
        throw erro(`Informe entre 1 e ${MAX_CAMPOS_CHAVE} campos para o relacionamento.`);
    }
    if (linhas.length > MAX_LINHAS_LOTE) {
        throw erro(`Cada lote RELACIONAR aceita no maximo ${MAX_LINHAS_LOTE} chaves.`);
    }
    const destinos = chaves.map(chave => citarIdentificador(chave?.destino));
    const valoresBase = Array.isArray(preparado?.valores) ? preparado.valores.slice() : [];
    const valoresRelacionamento = [];
    let indicePostgres = valoresBase.length;
    const marcador = () => {
        if (String(fonte).toLowerCase() === 'postgres') {
            indicePostgres += 1;
            return `$${indicePostgres}`;
        }
        return '?';
    };
    const predicados = linhas.map((linha, indiceLinha) => {
        if (!Array.isArray(linha) || linha.length !== destinos.length) {
            throw erro(`A chave ${indiceLinha + 1} nao possui todos os campos do relacionamento.`);
        }
        return '(' + linha.map((valor, indiceCampo) => {
            if (valor === null || valor === undefined || valor === '') {
                throw erro('Chaves RELACIONAR vazias nao sao permitidas.');
            }
            valoresRelacionamento.push(valor);
            return `CRM_REL_BASE.${destinos[indiceCampo]} = ${marcador()}`;
        }).join(' AND ') + ')';
    });
    const sqlBase = String(preparado?.sql || '').trim().replace(/;\s*$/, '');
    const filtro = predicados.length ? predicados.join(' OR ') : '1 = 0';
    return {
        ...preparado,
        sql: `SELECT CRM_REL_BASE.* FROM (\n${sqlBase}\n) CRM_REL_BASE WHERE (${filtro})`,
        valores: valoresBase.concat(valoresRelacionamento),
        relacionamentoAplicado: true,
        relacionamentoChaves: linhas.length
    };
}

export const limitesRelacionar = {
    camposChave: MAX_CAMPOS_CHAVE,
    linhasLote: MAX_LINHAS_LOTE,
    camposVirtuais: MAX_CAMPOS_VIRTUAIS
};

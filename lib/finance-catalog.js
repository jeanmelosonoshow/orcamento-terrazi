import crypto from 'node:crypto';

export function jsonCanonico(valor) {
    if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
    if (valor && typeof valor === 'object') {
        return `{${Object.keys(valor).sort().map(chave => `${JSON.stringify(chave)}:${jsonCanonico(valor[chave])}`).join(',')}}`;
    }
    return JSON.stringify(valor);
}

function contemChaveProibida(valor) {
    if (Array.isArray(valor)) return valor.some(contemChaveProibida);
    if (!valor || typeof valor !== 'object') return false;
    return Object.entries(valor).some(([chave, item]) => (
        ['sql', 'query', 'statement', 'procedure'].includes(String(chave).toLowerCase()) || contemChaveProibida(item)
    ));
}

export function validarDefinicaoOperacao(definicao) {
    if (!definicao || typeof definicao !== 'object' || Array.isArray(definicao)) throw new Error('Definicao financeira invalida.');
    if (contemChaveProibida(definicao)) throw new Error('SQL e instrucoes executaveis nao sao permitidos no catalogo.');
    const chavesRaiz = new Set(['kind', 'table', 'identity', 'idempotency', 'match', 'fields', 'result', 'definitionVersion']);
    if (Object.keys(definicao).some(chave => !chavesRaiz.has(chave))) throw new Error('Propriedade financeira nao suportada.');
    if (!['ensure', 'update', 'lookup'].includes(definicao.kind)) throw new Error('Tipo de operacao financeira nao suportado.');
    if (!/^[A-Z][A-Z0-9_$]{0,62}$/.test(String(definicao.table || ''))) throw new Error('Tabela financeira invalida.');
    const identificadorValido = valor => /^[A-Z][A-Z0-9_$]{0,62}$/.test(String(valor || ''));
    const fontes = new Set();
    for (const item of [...(definicao.match || []), ...(definicao.fields || [])]) {
        const chavesCampo = new Set(['column', 'source', 'constant', 'type', 'maxLength', 'required', 'variants']);
        if (!item || typeof item !== 'object' || Object.keys(item).some(chave => !chavesCampo.has(chave))) {
            throw new Error('Propriedade de campo financeiro nao suportada.');
        }
        if (!identificadorValido(item?.column)) throw new Error('Coluna financeira invalida.');
        if (item.source) {
            if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(item.source)) throw new Error('Campo de entrada invalido.');
            fontes.add(item.source);
        }
        if (!item.source && !Object.prototype.hasOwnProperty.call(item, 'constant')) throw new Error('Campo sem origem ou constante.');
        if (!['text', 'digits', 'cpf', 'integer', 'decimal', 'date'].includes(item.type)) throw new Error('Tipo de campo invalido.');
        if (item.variants && (!Array.isArray(item.variants) || item.variants.some(valor => !['digits', 'cpf_formatted'].includes(valor)))) {
            throw new Error('Variante de correspondencia invalida.');
        }
        if (item.maxLength !== undefined && (!Number.isInteger(item.maxLength) || item.maxLength < 1 || item.maxLength > 4000)) {
            throw new Error('Tamanho de campo invalido.');
        }
    }
    if (!Array.isArray(definicao.match) || !definicao.match.length) throw new Error('A operacao precisa de uma chave de correspondencia.');
    if (definicao.kind !== 'lookup' && (!Array.isArray(definicao.fields) || !definicao.fields.length)) {
        throw new Error('A operacao de escrita precisa declarar os campos permitidos.');
    }
    if (definicao.identity) {
        if (Object.keys(definicao.identity).some(chave => !['column', 'strategy', 'generator'].includes(chave))) {
            throw new Error('Propriedade de identidade nao suportada.');
        }
        if (!identificadorValido(definicao.identity.column)) throw new Error('Coluna de identidade invalida.');
        if (!['max_plus_one', 'generator'].includes(definicao.identity.strategy)) throw new Error('Estrategia de identidade invalida.');
        if (definicao.identity.strategy === 'generator' && !identificadorValido(definicao.identity.generator)) {
            throw new Error('Generator invalido.');
        }
    }
    if (!definicao.idempotency || Object.keys(definicao.idempotency).some(chave => chave !== 'template')) {
        throw new Error('Regra de idempotencia obrigatoria.');
    }
    const template = String(definicao.idempotency.template || '');
    const referencias = [...template.matchAll(/\{([a-z][a-zA-Z0-9_]*)\}/g)].map(item => item[1]);
    if (!template || template.length > 180 || !referencias.length || referencias.some(campo => !fontes.has(campo))) {
        throw new Error('Template de idempotencia invalido.');
    }
    if (definicao.result) {
        if (Object.keys(definicao.result).some(chave => chave !== 'idColumn') || !identificadorValido(definicao.result.idColumn)) {
            throw new Error('Mapeamento de resultado invalido.');
        }
    }
    return { definicao, fontes: Array.from(fontes) };
}

export function assinarManifesto(manifesto, chavePrivada) {
    const canonical = jsonCanonico(manifesto);
    const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    const assinatura = crypto.sign(null, Buffer.from(canonical, 'utf8'), chavePrivada).toString('base64');
    return { canonical, hash, assinatura };
}

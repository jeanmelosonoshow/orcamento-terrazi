export function mascararComentariosELiterais(sql) {
    const texto = String(sql || '');
    let resultado = '';
    let indice = 0;
    let estado = 'normal';

    while (indice < texto.length) {
        const atual = texto[indice];
        const proximo = texto[indice + 1];

        if (estado === 'normal' && atual === '/' && proximo === '*') {
            resultado += '  ';
            indice += 2;
            estado = 'comentario-bloco';
            continue;
        }
        if (estado === 'normal' && atual === '-' && proximo === '-') {
            resultado += '  ';
            indice += 2;
            estado = 'comentario-linha';
            continue;
        }
        if (estado === 'normal' && atual === "'") {
            resultado += ' ';
            indice += 1;
            estado = 'literal';
            continue;
        }
        if (estado === 'normal' && atual === '"') {
            resultado += ' ';
            indice += 1;
            estado = 'identificador';
            continue;
        }
        if (estado === 'comentario-bloco') {
            if (atual === '*' && proximo === '/') {
                resultado += '  ';
                indice += 2;
                estado = 'normal';
            } else {
                resultado += atual === '\n' ? '\n' : ' ';
                indice += 1;
            }
            continue;
        }
        if (estado === 'comentario-linha') {
            resultado += atual === '\n' ? '\n' : ' ';
            indice += 1;
            if (atual === '\n') estado = 'normal';
            continue;
        }
        if (estado === 'literal') {
            if (atual === "'" && proximo === "'") {
                resultado += '  ';
                indice += 2;
            } else {
                resultado += atual === '\n' ? '\n' : ' ';
                indice += 1;
                if (atual === "'") estado = 'normal';
            }
            continue;
        }
        if (estado === 'identificador') {
            if (atual === '"' && proximo === '"') {
                resultado += '  ';
                indice += 2;
            } else {
                resultado += atual === '\n' ? '\n' : ' ';
                indice += 1;
                if (atual === '"') estado = 'normal';
            }
            continue;
        }

        resultado += atual;
        indice += 1;
    }

    return resultado;
}

export function sqlEhExecuteBlock(sql) {
    return /^\s*execute\s+block\b/i.test(mascararComentariosELiterais(sql));
}

export function extrairOperacoesTemporariasExecuteBlock(sql) {
    if (!sqlEhExecuteBlock(sql)) return [];
    const normalizado = mascararComentariosELiterais(sql);
    const operacoes = [];
    const padrao = /\b(insert\s+into|delete\s+from)\s+([a-z_][a-z0-9_$]*)\b/gi;
    let match;
    while ((match = padrao.exec(normalizado)) !== null) {
        operacoes.push({
            tipo: /^\s*insert/i.test(match[1]) ? 'insert' : 'delete',
            tabela: String(match[2]).toUpperCase(),
            indice: match.index
        });
    }
    return operacoes;
}

export function obterTabelasTemporariasExecuteBlock(sql) {
    return Array.from(new Set(extrairOperacoesTemporariasExecuteBlock(sql).map(item => item.tabela)));
}

export function montarSqlLimpezaTabelasTemporarias(tabelas) {
    const nomes = Array.from(new Set((Array.isArray(tabelas) ? tabelas : [])
        .map(item => String(item || '').trim().toUpperCase())
        .filter(item => /^[A-Z_][A-Z0-9_$]*$/.test(item))));
    if (!nomes.length) return '';
    const comandos = nomes.map(nome => `DELETE FROM "${nome}";`).join(' ');
    return `EXECUTE BLOCK AS BEGIN ${comandos} END`;
}

function validarOperacoesTemporarias(normalizado, operacoes, opcoes) {
    const palavrasDml = normalizado.match(/\b(insert|delete)\b/g) || [];
    if (palavrasDml.length !== operacoes.length) {
        return 'Use apenas INSERT INTO ou DELETE FROM com nome simples de tabela temporaria.';
    }

    const inseridas = Array.from(new Set(operacoes.filter(item => item.tipo === 'insert').map(item => item.tabela)));
    const semLimpezaInicial = inseridas.find(tabela => {
        const primeiraInsercao = operacoes.find(item => item.tipo === 'insert' && item.tabela === tabela);
        return !operacoes.some(item =>
            item.tipo === 'delete' && item.tabela === tabela && item.indice < primeiraInsercao.indice
        );
    });
    if (semLimpezaInicial) {
        return `Limpe a tabela temporaria ${semLimpezaInicial} com DELETE FROM antes do primeiro INSERT.`;
    }

    if (opcoes.permitirDmlTemporariaPendente === true) return '';

    const permitidas = new Set((Array.isArray(opcoes.tabelasTemporariasPermitidas)
        ? opcoes.tabelasTemporariasPermitidas
        : []).map(item => String(item).trim().toUpperCase()));
    const naoConfirmada = operacoes.find(item => !permitidas.has(item.tabela));
    if (naoConfirmada) {
        return `A tabela ${naoConfirmada.tabela} nao foi confirmada como tabela temporaria global no Firebird.`;
    }
    return '';
}

export function validarSqlLeitura(sql, fonte = 'firebird', opcoes = {}) {
    const texto = String(sql || '').trim();
    if (!texto) return 'Informe uma consulta SQL.';
    const normalizado = mascararComentariosELiterais(texto).trim().toLowerCase();
    if (/\bset\s+term\b/.test(normalizado)) {
        return 'Envie apenas o EXECUTE BLOCK, sem comandos SET TERM.';
    }

    if (/^execute\s+block\b/.test(normalizado)) {
        if (String(fonte).toLowerCase() !== 'firebird') {
            return 'EXECUTE BLOCK esta disponivel apenas para consultas Firebird.';
        }
        if (!/\breturns\s*\(/.test(normalizado) || !/\bsuspend\s*;/.test(normalizado)) {
            return 'O EXECUTE BLOCK deve declarar RETURNS e usar SUSPEND para retornar dados.';
        }
        if (!/\bas\b[\s\S]*\bbegin\b/.test(normalizado) || !/\bend\s*;?\s*$/.test(normalizado)) {
            return 'Revise a estrutura do EXECUTE BLOCK. O bloco deve terminar com END.';
        }
        if (/\b(update|merge|drop|alter|truncate|create|recreate|grant|revoke|commit|rollback)\b/.test(normalizado)
            || /\bexecute\s+(statement|procedure)\b/.test(normalizado)
            || /\bin\s+autonomous\s+transaction\b/.test(normalizado)
            || /\bpost_event\b/.test(normalizado)) {
            return 'O EXECUTE BLOCK do cenario permite apenas leitura ou carga controlada em tabelas temporarias globais.';
        }

        const operacoes = extrairOperacoesTemporariasExecuteBlock(texto);
        if (/\b(insert|delete)\b/.test(normalizado)) {
            return validarOperacoesTemporarias(normalizado, operacoes, opcoes);
        }
        return '';
    }

    if (!/^(select|with)\b/.test(normalizado)) {
        return 'Use consultas SELECT, WITH ou EXECUTE BLOCK retornavel.';
    }
    if (normalizado.includes(';')) {
        return 'Remova ponto e virgula. Execute apenas uma consulta por vez.';
    }
    if (/\b(insert|update|delete|drop|alter|truncate|create|recreate|grant|revoke|execute|merge|commit|rollback)\b/.test(normalizado)) {
        return 'A consulta de cenario permite apenas leitura.';
    }
    return '';
}

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

export function validarSqlLeitura(sql, fonte = 'firebird') {
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
        if (/\b(insert|update|delete|merge|drop|alter|truncate|create|recreate|grant|revoke|commit|rollback)\b/.test(normalizado)
            || /\bexecute\s+(statement|procedure)\b/.test(normalizado)
            || /\bin\s+autonomous\s+transaction\b/.test(normalizado)
            || /\bpost_event\b/.test(normalizado)) {
            return 'O EXECUTE BLOCK do cenario permite apenas leitura e retorno de dados.';
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

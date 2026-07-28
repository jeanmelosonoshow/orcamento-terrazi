export function normalizarCharsetFirebird(valor, fallback = 'UTF8') {
    const charset = String(valor || fallback).trim().toUpperCase();
    return charset || String(fallback).trim().toUpperCase();
}

export function erroConversaoCharsetFirebird(error) {
    const mensagem = String(error?.message || error || '').toLowerCase();
    return /malformed string|cannot transliterate|transliteration failed|malformed unicode/.test(mensagem);
}

export function charsetsParaConsultaFirebird(principal, alternativo, permitirAlternativo = false) {
    const charsetPrincipal = normalizarCharsetFirebird(principal);
    const charsets = [charsetPrincipal];
    if (!permitirAlternativo) return charsets;

    const charsetAlternativo = normalizarCharsetFirebird(alternativo, 'NONE');
    if (!['OFF', 'DISABLED', 'FALSE'].includes(charsetAlternativo) && charsetAlternativo !== charsetPrincipal) {
        charsets.push(charsetAlternativo);
    }
    return charsets;
}

export function criarErroCharsetFirebird(error, charsets) {
    const tentados = Array.from(new Set((charsets || []).map(valor => normalizarCharsetFirebird(valor))));
    const original = String(error?.message || error || 'Falha de conversao de texto.');
    const detalhe = new Error(
        `Falha ao converter texto retornado pelo Firebird. Charsets tentados: ${tentados.join(', ')}. ` +
        `Confirme o charset usado no IBExpert e configure DB_CHARSET_FB com o mesmo valor. Erro original: ${original}`
    );
    detalhe.code = error?.code;
    detalhe.gdscode = error?.gdscode;
    detalhe.isFirebirdCharsetError = true;
    detalhe.cause = error;
    return detalhe;
}

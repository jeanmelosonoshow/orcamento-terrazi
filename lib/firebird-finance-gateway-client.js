import crypto from 'node:crypto';

function configuracao() {
    return {
        url: String(process.env.FIREBIRD_GATEWAY_URL || '').trim().replace(/\/+$/, ''),
        tokenId: String(process.env.FIREBIRD_GATEWAY_TOKEN_ID || '').trim(),
        secret: String(process.env.FIREBIRD_GATEWAY_HMAC_SECRET || '').trim()
    };
}

export async function garantirFornecedorArquiteto({ nome, telefone, cpf }) {
    return executarComandoFinanceiro(
        'ENSURE_ARCHITECT_SUPPLIER',
        `FORNECEDOR:CPF:${String(cpf || '').replace(/\D/g, '')}`,
        { name: nome, phone: telefone || '', cpf: String(cpf || '').replace(/\D/g, '') },
        resultado => ({ idFornecedor: Number(resultado?.id), criado: resultado?.created === true })
    );
}

export async function consultarCentroCustoFilial(idfilial) {
    return executarComandoFinanceiro(
        'LOOKUP_BRANCH_COST_CENTER',
        `FILIAL:CENTROCUSTO:${String(idfilial || '').trim().toUpperCase()}`,
        { idfilial: String(idfilial || '').trim().toUpperCase() },
        resultado => Number(resultado?.id)
    );
}

export async function criarPagarArquiteto(data) {
    const numeroDuplicata = String(data?.numeroDuplicata || '').trim();
    return executarComandoFinanceiro(
        'CREATE_ARCHITECT_PAYABLE',
        `PAGAR:ARQUITETO:${numeroDuplicata}`,
        data,
        resultado => ({
            id: Number(resultado?.id),
            criado: resultado?.created === true
        })
    );
}

export async function regenerarPagarArquiteto(data) {
    const numeroDuplicata = String(data?.numeroDuplicata || '').trim();
    return executarComandoFinanceiro(
        'UPDATE_ARCHITECT_PAYABLE',
        `PAGAR:ARQUITETO:REGENERAR:${numeroDuplicata}`,
        data,
        resultado => ({ id: Number(resultado?.id), atualizado: resultado?.updated === true })
    );
}

export async function consultarStatusPagar(numeroDuplicata) {
    return executarComandoFinanceiro(
        'LOOKUP_ARCHITECT_PAYABLE_STATUS',
        `PAGAR:STATUS:${String(numeroDuplicata || '').trim()}`,
        { numeroDuplicata: String(numeroDuplicata || '').trim() },
        resultado => String(resultado?.id ?? '')
    );
}

async function executarComandoFinanceiro(operation, idempotencyKey, data, normalizarResultado) {
    const { url, tokenId, secret } = configuracao();
    if (!url || !tokenId || !secret) throw Object.assign(new Error('Gateway financeiro nao configurado.'), {
        code: 'FINANCE_GATEWAY_CONFIG_ERROR'
    });
    const path = '/finance/commands';
    const body = JSON.stringify({
        operation,
        idempotencyKey,
        data
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
    const canonical = [timestamp, nonce, 'POST', path, bodyHash].join('\n');
    const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
        const response = await fetch(`${url}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tokenId}`,
                'Content-Type': 'application/json',
                'X-Timestamp': timestamp,
                'X-Nonce': nonce,
                'X-Signature': signature
            },
            body,
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success !== true) {
            throw Object.assign(new Error(payload.detail || payload.error || 'Falha ao sincronizar fornecedor.'), {
                code: `FINANCE_GATEWAY_${String(payload.error || response.status).toUpperCase()}`,
                status: response.status
            });
        }
        const resultado = normalizarResultado(payload.result);
        if (!resultado || (typeof resultado === 'number' && (!Number.isSafeInteger(resultado) || resultado <= 0))) {
            throw Object.assign(new Error('Gateway retornou uma resposta financeira invalida.'), { code: 'FINANCE_GATEWAY_INVALID_RESPONSE' });
        }
        return resultado;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw Object.assign(new Error('Tempo limite ao sincronizar fornecedor.'), { code: 'FINANCE_GATEWAY_TIMEOUT' });
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

import crypto from 'node:crypto';

function configuracao() {
    return {
        url: String(process.env.FIREBIRD_GATEWAY_URL || '').trim().replace(/\/+$/, ''),
        tokenId: String(process.env.FIREBIRD_GATEWAY_TOKEN_ID || '').trim(),
        secret: String(process.env.FIREBIRD_GATEWAY_HMAC_SECRET || '').trim()
    };
}

export async function garantirFornecedorArquiteto({ nome, telefone, cpf }) {
    const { url, tokenId, secret } = configuracao();
    if (!url || !tokenId || !secret) throw Object.assign(new Error('Gateway financeiro nao configurado.'), {
        code: 'FINANCE_GATEWAY_CONFIG_ERROR'
    });
    const path = '/finance/commands';
    const cpfNormalizado = String(cpf || '').replace(/\D/g, '');
    const body = JSON.stringify({
        operation: 'ENSURE_ARCHITECT_SUPPLIER',
        idempotencyKey: `FORNECEDOR:CPF:${cpfNormalizado}`,
        data: { name: nome, phone: telefone || '', cpf: cpfNormalizado }
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
        const supplierId = Number(payload.result?.id);
        if (!Number.isSafeInteger(supplierId) || supplierId <= 0) {
            throw Object.assign(new Error('Gateway retornou fornecedor invalido.'), { code: 'FINANCE_GATEWAY_INVALID_RESPONSE' });
        }
        return { idFornecedor: supplierId, criado: payload.result?.created === true };
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw Object.assign(new Error('Tempo limite ao sincronizar fornecedor.'), { code: 'FINANCE_GATEWAY_TIMEOUT' });
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, verifySessionToken } from '../lib/session-token.js';

test('sessao assinada preserva as filiais permitidas ate expirar', () => {
    const segredoAnterior = process.env.CRM_SESSION_SECRET;
    process.env.CRM_SESSION_SECRET = 'segredo-de-teste-da-sessao';
    try {
        const token = createSessionToken({
            idfuncionario: 142,
            categoria: 'SU',
            filiaisPermitidas: ['01', ' 02 ', '01']
        });
        const sessao = verifySessionToken(token);
        assert.deepEqual(sessao.filiaisPermitidas, ['01', '02']);
        assert.equal(sessao.categoria, 'SU');
    } finally {
        if (segredoAnterior === undefined) delete process.env.CRM_SESSION_SECRET;
        else process.env.CRM_SESSION_SECRET = segredoAnterior;
    }
});

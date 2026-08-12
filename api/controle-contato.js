import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { executarManutencaoControleContato } from '../lib/contact-maintenance.js';

const STATUS = new Set(['PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO']);
const TIPOS = new Set(['WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM']);

function texto(valor, limite) {
    return String(valor ?? '').trim().slice(0, limite);
}

function numeroSessao(valor) {
    const numero = Number(valor);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function normalizarRegistro(linha) {
    if (!linha) return null;
    return {
        doctocliente: linha.doctocliente,
        nomeCliente: linha.nome_cliente,
        statusContato: linha.status_contato,
        tipoContato: linha.tipo_contato,
        observacao: linha.observacao || '',
        dataPrimeiroContato: linha.data_primeiro_contato,
        dataUltimoContato: linha.data_ultimo_contato,
        dataFinalizacao: linha.data_finalizacao,
        idfuncionario: linha.idfuncionario,
        idvendedor: linha.idvendedor,
        qtdeContato: linha.qtde_contato,
        dataUltimaAtualizacao: linha.data_ultima_atualizacao,
        finalizado: linha.status_contato === 'FINALIZADO'
    };
}

function responderErroBanco(res, error) {
    if (String(error?.message || '').includes('Contato finalizado nao pode ser alterado')) {
        return res.status(409).json({ error: 'Este contato foi finalizado e nao pode mais ser alterado.', code: 'CONTACT_FINALIZED' });
    }
    console.error('[controle-contato] falha', { code: error?.code || null, message: error?.message });
    return res.status(500).json({ error: 'Nao foi possivel salvar o controle de contato.' });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Metodo nao permitido.' });

    const session = requireRequestSession(req, res);
    if (!session) return;

    if (req.method === 'GET') {
        const documento = texto(req.query?.documento, 40);
        if (!documento) return res.status(400).json({ error: 'Documento do cliente nao informado.' });
        try {
            await executarManutencaoControleContato(db);
            const resultado = await db.query(
                'SELECT * FROM controle_contato WHERE doctocliente = $1 LIMIT 1',
                [documento]
            );
            return res.status(200).json({ contato: normalizarRegistro(resultado.rows[0]) });
        } catch (error) {
            return responderErroBanco(res, error);
        }
    }

    const documento = texto(req.body?.doctocliente, 40);
    const nomeCliente = texto(req.body?.nomeCliente, 180);
    const statusContato = texto(req.body?.statusContato, 30).toUpperCase();
    const tipoContato = texto(req.body?.tipoContato, 30).toUpperCase();
    const observacao = texto(req.body?.observacao, 10000);
    if (!documento || !nomeCliente) return res.status(400).json({ error: 'Documento e nome do cliente sao obrigatorios.' });
    if (!STATUS.has(statusContato)) return res.status(400).json({ error: 'Status de contato invalido.' });
    if (!TIPOS.has(tipoContato)) return res.status(400).json({ error: 'Tipo de contato invalido.' });

    const idfuncionario = numeroSessao(session.sub);
    const idvendedor = numeroSessao(session.idvendedor);
    if (!idfuncionario) return res.status(403).json({ error: 'Funcionario da sessao nao identificado.' });

    try {
        await executarManutencaoControleContato(db);
        const resultado = await db.query(`
            INSERT INTO controle_contato (
                doctocliente, nome_cliente, status_contato, tipo_contato, observacao,
                idfuncionario, idvendedor, qtde_contato
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
            ON CONFLICT (doctocliente) DO UPDATE SET
                nome_cliente = EXCLUDED.nome_cliente,
                status_contato = EXCLUDED.status_contato,
                tipo_contato = EXCLUDED.tipo_contato,
                observacao = EXCLUDED.observacao,
                idfuncionario = EXCLUDED.idfuncionario,
                idvendedor = EXCLUDED.idvendedor
            RETURNING *
        `, [documento, nomeCliente, statusContato, tipoContato, observacao, idfuncionario, idvendedor]);
        return res.status(200).json({ contato: normalizarRegistro(resultado.rows[0]) });
    } catch (error) {
        return responderErroBanco(res, error);
    }
}

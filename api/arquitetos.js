import { db } from '@vercel/postgres';
import { requireRequestSession } from '../lib/session-token.js';
import { normalizarArquiteto, normalizarArquitetoEntrada } from '../lib/architects.js';

function responderErro(res, error) {
    if (error?.code === '23505') {
        const campo = String(error?.constraint || '').includes('cpf') ? 'CPF' : 'registro no CAU';
        return res.status(409).json({ error: `Ja existe um arquiteto cadastrado com este ${campo}.` });
    }
    const status = Number(error?.statusCode) || 500;
    if (status >= 500) console.error('[arquitetos] falha', { code: error?.code || null, message: error?.message });
    return res.status(status).json({ error: status >= 500 ? 'Nao foi possivel acessar o cadastro de arquitetos.' : error.message });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Metodo nao permitido.' });
    const session = requireRequestSession(req, res);
    if (!session) return;

    try {
        if (req.method === 'GET') {
            const busca = String(req.query?.busca || '').trim().slice(0, 100);
            const somenteOpcoes = String(req.query?.modo || '').trim().toLowerCase() === 'filtro';
            if (somenteOpcoes) {
                const resultado = await db.query(`
                    SELECT id, nome, cpf, registro_cau
                      FROM arquiteto
                     WHERE ativo = TRUE
                     ORDER BY nome, id
                `);
                return res.status(200).json({ arquitetos: resultado.rows.map(linha => ({
                    id: Number(linha.id),
                    nome: linha.nome,
                    cpf: linha.cpf,
                    registroCau: linha.registro_cau
                })) });
            }
            const pagina = Math.max(1, Math.min(100000, Number.parseInt(req.query?.pagina, 10) || 1));
            const limite = Math.max(1, Math.min(100, Number.parseInt(req.query?.limite, 10) || 100));
            const offset = (pagina - 1) * limite;
            const termo = `%${busca}%`;
            const parametrosBusca = [busca, termo];
            const [resultado, contagem] = await Promise.all([
                db.query(`
                    SELECT *
                      FROM arquiteto
                     WHERE ativo = TRUE
                       AND ($1 = '' OR nome ILIKE $2 OR cpf LIKE $2 OR registro_cau ILIKE $2)
                     ORDER BY nome, id
                     LIMIT $3 OFFSET $4
                `, [...parametrosBusca, limite, offset]),
                db.query(`
                    SELECT COUNT(*)::INTEGER AS total
                      FROM arquiteto
                     WHERE ativo = TRUE
                       AND ($1 = '' OR nome ILIKE $2 OR cpf LIKE $2 OR registro_cau ILIKE $2)
                `, parametrosBusca)
            ]);
            const total = Number(contagem.rows[0]?.total || 0);
            return res.status(200).json({
                arquitetos: resultado.rows.map(normalizarArquiteto),
                paginacao: { pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) }
            });
        }

        const arquiteto = normalizarArquitetoEntrada(req.body);
        const idfuncionario = Number(session.sub);
        const idfilial = String(session.idfilial || '').trim().slice(0, 2);
        if (!Number.isSafeInteger(idfuncionario) || idfuncionario <= 0 || !idfilial) {
            return res.status(403).json({ error: 'Funcionario ou filial da sessao nao identificados.' });
        }
        const resultado = await db.query(`
            INSERT INTO arquiteto (
                nome, cpf, nascimento, registro_cau, telefone, telefone_alternativo, email,
                idfilial_cadastro, idfuncionario_cadastro
            ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9)
            RETURNING *
        `, [
            arquiteto.nome, arquiteto.cpf, arquiteto.nascimento, arquiteto.registroCau, arquiteto.telefone,
            arquiteto.telefoneAlternativo, arquiteto.email, idfilial, idfuncionario
        ]);
        return res.status(201).json({ arquiteto: normalizarArquiteto(resultado.rows[0]) });
    } catch (error) {
        return responderErro(res, error);
    }
}

import { findUserByLogin, LoginError } from '../lib/firebird-login.js';

export default async function handler(req, res) {
    // Configurações de CORS para permitir que o seu domínio acesse a API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });

    const usuario = normalizeText(req.body?.usuario);
    const senha = normalizeText(req.body?.senha);

    if (!usuario || !senha) {
        return res.status(400).json({ autorizado: false, erro: "Usuário e senha são obrigatórios." });
    }

    try {
        const user = await findUserByLogin(usuario, senha);

        if (!user) {
            return res.status(401).json({
                autorizado: false,
                mensagem: "Usuário ou senha inválidos."
            });
        }

        return res.status(200).json({
            autorizado: true,
            idfuncionario: user.idfuncionario,
            nomefuncionario: user.nomefuncionario,
            categoria: user.categoria,
            idfilial: user.idfilial
        });
    } catch (error) {
        console.error('Erro ao validar usuário:', error);
        const statusCode = error instanceof LoginError ? error.statusCode : 500;
        const message = error instanceof LoginError
            ? error.message
            : 'Não foi possível validar o usuário.';
        return res.status(statusCode).json({ autorizado: false, erro: message });
    }
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

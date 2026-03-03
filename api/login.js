const Firebird = require('node-firebird');
const crypto = require('crypto');

export default async function handler(req, res) {
    // Configurações de CORS para permitir que o seu domínio acesse a API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });

    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ autorizado: false, erro: "Usuário e senha são obrigatórios." });
    }

    // Gera o Hash MD5 da senha em minúsculas
    const senhaHash = crypto.createHash('md5').update(senha).digest('hex').toLowerCase();

    const options = {
        host: process.env.DB_HOST_FB,
        port: process.env.DB_PORT_FB,
        database: process.env.DB_PATH_FB,
        user: process.env.DB_USER_FB,
        password: process.env.DB_PASSWORD_FB,
        lowercase_keys: false,
        pageSize: 4096
    };

    // Usamos Promise para lidar com a natureza assíncrona do Firebird na Vercel
    return new Promise((resolve) => {
        Firebird.attach(options, function(err, db) {
            if (err) {
                res.status(500).json({ autorizado: false, erro: "Falha ao conectar no Firebird local." });
                return resolve();
            }

            // Query que busca os dados para o seu sistema de hierarquia
            // Importante: Mantive 'CATEGORIA' como o nome final da coluna
            const sql = `
                SELECT 
                    IDFUNCIONARIO AS ID_FUNCIONARIO, 
                    NOMEFUNCIONARIO AS NOME_FUNCIONARIO, 
                    CATEGORIA, 
                    IDFILIAL AS ID_FILIAL 
                FROM FUNCIONARIO 
                WHERE LOGIN = ? AND SENHAWEB = ? AND STATUS = 'A' AND CATEGORIA IN ('GR','SU','VD','DI')
            `;
            
            db.query(sql, [usuario, senhaHash], function(err, result) {
                db.detach();

                if (err) {
                    res.status(500).json({ autorizado: false, erro: "Erro na consulta ao Firebird." });
                    return resolve();
                }

                if (result && result.length > 0) {
                    // Retorno formatado para ser salvo no sessionStorage do navegador
                    res.status(200).json({ 
                        autorizado: true, 
                        idfuncionario: result[0].ID_FUNCIONARIO,
                        nomefuncionario: result[0].NOME_FUNCIONARIO,
                        categoria: result[0].CATEGORIA, // VD, GR, DI, SU
                        idfilial: result[0].ID_FILIAL
                    });
                } else {
                    res.status(401).json({ autorizado: false, mensagem: "Usuário ou senha inválidos." });
                }
                resolve();
            });
        });
    });
}

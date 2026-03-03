export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Aguardando código de autorização...");
  }

  try {
    const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.NUVEMSHOP_CLIENT_ID,
        client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
      }),
    });

    const data = await response.json();

    // Este é o Token que você vai usar para buscar os produtos!
    // DICA: Salve esse 'access_token' e o 'user_id' (Store ID)
    res.status(200).json({
      status: "Sucesso!",
      access_token: data.access_token,
      store_id: data.user_id,
      scope: data.scope
    });

  } catch (error) {
    res.status(500).json({ error: "Erro ao gerar token: " + error.message });
  }
}


// DADOS PARA AUTETICACAO DE LOGIN E NIVEL HIERARQUICO

const Firebird = require('node-firebird');
const crypto = require('crypto');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });

    const { usuario, senha } = req.body;
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

    Firebird.attach(options, function(err, db) {
        if (err) {
            return res.status(500).json({ autorizado: false, erro: "Falha ao conectar no Firebird." });
        }

        // QUERY ATUALIZADA: Busca os campos solicitados
        const sql = `
            SELECT 
                IDFUNCIONARIO AS ID_FUNCIONARIO, 
                NOMEFUNCIONARIO AS NOME_FUNCIONARIO, 
                CASTEGORIA AS CATEGORIA, 
                IDFILIAL AS ID_FILIAL 
            FROM FUNCIONARIO 
            WHERE LOGIN = ? AND SENHAWEB = ? AND STATUS = 'A' AND CATEGORIA IN ('GR','SU','VD','DI')
        `;
        
        db.query(sql, [usuario, senhaHash], function(err, result) {
            db.detach();

            if (err) {
                return res.status(500).json({ autorizado: false, erro: "Erro na consulta." });
            }

            if (result && result.length > 0) {
                // Retorna o objeto completo conforme solicitado
                return res.status(200).json({ 
                    autorizado: true, 
                    idfuncionario: result[0].ID_FUNCIONARIO,
                    nomefuncionario: result[0].NOME_FUNCIONARIO,
                    categoria: result[0].CATEGORIA, // VD, GR, DI, SU
                    idfilial: result[0].ID_FILIAL
                });
            } else {
                return res.status(401).json({ autorizado: false, mensagem: "Usuário ou senha inválidos." });
            }
        });
    });
}

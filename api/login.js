import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const Firebird = require('node-firebird');
const crypto = require('crypto');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const permissionsPaths = [
    path.join(__dirname, 'crm-permissions.json'),
    path.join(__dirname, '..', 'config', 'crm-permissions.json')
];

function carregarPermissoes() {
    const fallback = {
        allowedLoginCategories: ['GR', 'SU', 'VD', 'DI', 'CX'],
        scenarioEditorFuncionarioIds: []
    };

    try {
        const permissionsPath = permissionsPaths.find(caminho => fs.existsSync(caminho));
        const config = JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
        const categoriasLogin = config.allowedLoginCategories || config.categorias?.loginPermitido;
        const editoresCenarios = config.scenarioEditorFuncionarioIds || config.cenarios?.editoresIdFuncionario;
        const allowedLoginCategories = Array.isArray(categoriasLogin)
            ? categoriasLogin.map(categoria => String(categoria).trim().toUpperCase()).filter(Boolean)
            : fallback.allowedLoginCategories;
        const scenarioEditorFuncionarioIds = Array.isArray(editoresCenarios)
            ? editoresCenarios.map(id => String(id).trim()).filter(Boolean)
            : fallback.scenarioEditorFuncionarioIds;

        return {
            allowedLoginCategories: allowedLoginCategories.length ? allowedLoginCategories : fallback.allowedLoginCategories,
            scenarioEditorFuncionarioIds
        };
    } catch (error) {
        return fallback;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });

    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ autorizado: false, erro: 'Usuário e senha são obrigatórios.' });
    }

    const permissoes = carregarPermissoes();
    const categoriasPermitidas = permissoes.allowedLoginCategories;
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

    return new Promise((resolve) => {
        Firebird.attach(options, function(err, db) {
            if (err) {
                res.status(500).json({ autorizado: false, erro: 'Falha ao conectar no Firebird local.' });
                return resolve();
            }

            const placeholders = categoriasPermitidas.map(() => '?').join(',');
            const sql = `
                SELECT
                    IDFUNCIONARIO AS ID_FUNCIONARIO,
                    NOMEFUNCIONARIO AS NOME_FUNCIONARIO,
                    CATEGORIA,
                    IDFILIAL AS ID_FILIAL,
                    IDVENDEDOR AS ID_VENDEDOR
                FROM FUNCIONARIO
                WHERE LOGIN = ?
                  AND SENHAWEB = ?
                  AND STATUS = 'A'
                  AND CATEGORIA IN (${placeholders})
            `;

            db.query(sql, [usuario, senhaHash, ...categoriasPermitidas], function(err, result) {
                db.detach();

                if (err) {
                    res.status(500).json({ autorizado: false, erro: 'Erro na consulta ao Firebird.' });
                    return resolve();
                }

                if (result && result.length > 0) {
                    const idFuncionario = result[0].ID_FUNCIONARIO;
                    const podeEditarCenarios = permissoes.scenarioEditorFuncionarioIds.includes(String(idFuncionario));
                    res.status(200).json({
                        autorizado: true,
                        idfuncionario: idFuncionario,
                        nomefuncionario: result[0].NOME_FUNCIONARIO,
                        categoria: result[0].CATEGORIA,
                        idfilial: result[0].ID_FILIAL,
                        idvendedor: result[0].ID_VENDEDOR,
                        podeEditarCenarios,
                        canEditScenarios: podeEditarCenarios
                    });
                } else {
                    res.status(401).json({ autorizado: false, mensagem: 'Usuário ou senha inválidos.' });
                }
                resolve();
            });
        });
    });
}




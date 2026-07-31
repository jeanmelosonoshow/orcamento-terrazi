import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSessionToken } from '../lib/session-token.js';
import { executarConsultaFirebirdGateway, statusHttpErroConsulta } from '../lib/bi-gateway-client.js';
const require = createRequire(import.meta.url);
const crypto = require('crypto');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const permissionsPaths = [
    path.join(__dirname, 'crm-permissions.json'),
    path.join(__dirname, '..', 'config', 'crm-permissions.json')
];
const FIREBIRD_TIMEOUT_MS = 12000;

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

    try {
        const result = await executarConsultaFirebirdGateway(
            sql,
            [usuario, senhaHash, ...categoriasPermitidas],
            { operacao: 'login', timeoutMs: FIREBIRD_TIMEOUT_MS }
        );
        if (!result.length) {
            return res.status(401).json({ autorizado: false, mensagem: 'Usuário ou senha inválidos.' });
        }

        const idFuncionario = result[0].ID_FUNCIONARIO;
        const podeEditarCenarios = permissoes.scenarioEditorFuncionarioIds.includes(String(idFuncionario));
        const sessionUser = {
            idfuncionario: idFuncionario,
            categoria: result[0].CATEGORIA,
            idfilial: result[0].ID_FILIAL,
            idvendedor: result[0].ID_VENDEDOR
        };
        return res.status(200).json({
            autorizado: true,
            ...sessionUser,
            nomefuncionario: result[0].NOME_FUNCIONARIO,
            podeEditarCenarios,
            canEditScenarios: podeEditarCenarios,
            sessionToken: createSessionToken(sessionUser)
        });
    } catch (error) {
        const status = statusHttpErroConsulta(error);
        if (status >= 503) res.setHeader('Retry-After', '1');
        return res.status(status).json({
            autorizado: false,
            erro: status >= 503
                ? 'Banco temporariamente indisponível. Tente novamente.'
                : 'Erro ao consultar o Firebird.'
        });
    }
}

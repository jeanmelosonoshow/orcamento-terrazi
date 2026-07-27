import { db } from '@vercel/postgres';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Firebird = require('node-firebird');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const permissionsPath = path.join(__dirname, 'crm-permissions.json');


function carregarEditoresCenario() {
    try {
        const config = JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
        const ids = config.scenarioEditorFuncionarioIds || config.cenarios?.editoresIdFuncionario || [];
        return Array.isArray(ids) ? ids.map(id => String(id).trim()).filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

function usuarioPodeEditarCenario(usuario = {}) {
    const idFuncionario = String(usuario.idfuncionario || usuario.id_funcionario || usuario.IDFUNCIONARIO || '').trim();
    return Boolean(idFuncionario && carregarEditoresCenario().includes(idFuncionario));
}
function getFirebirdOptions() {
    return {
        host: process.env.DB_HOST_FB,
        port: process.env.DB_PORT_FB,
        database: process.env.DB_PATH_FB,
        user: process.env.DB_USER_FB,
        password: process.env.DB_PASSWORD_FB,
        lowercase_keys: false,
        pageSize: 4096
    };
}

function validarSqlLeitura(sql) {
    const texto = String(sql || '').trim();
    const normalizado = texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim().toLowerCase();
    if (!/^(select|with)\b/.test(normalizado)) return 'Use apenas consultas SELECT ou WITH.';
    if (normalizado.includes(';')) return 'Remova ponto e virgula. Execute apenas uma consulta por vez.';
    if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|execute|merge)\b/.test(normalizado)) {
        return 'A consulta de cenario permite apenas leitura.';
    }
    return '';
}

function normalizarLista(valor) {
    if (Array.isArray(valor)) return valor.map(item => String(item).trim()).filter(Boolean);
    return String(valor || '').split(',').map(item => item.trim()).filter(Boolean);
}

function prepararSql(sql, fonte, filtros = {}) {
    const valores = [];
    const marcador = () => fonte === 'postgres' ? `$${valores.length}` : '?';
    const adicionarValor = valor => {
        valores.push(valor || null);
        return marcador();
    };
    const adicionarLista = valor => {
        const lista = normalizarLista(valor);
        if (!lista.length) {
            valores.push('__SEM_VALOR__');
            return marcador();
        }
        return lista.map(item => adicionarValor(item)).join(',');
    };

    const mapa = {
        data_inicial: () => adicionarValor(filtros.dataInicial),
        data_final: () => adicionarValor(filtros.dataFinal),
        idfuncionario: () => adicionarValor(filtros.idfuncionario),
        idfilial: () => adicionarValor(filtros.idfilial),
        idvendedor: () => adicionarValor(filtros.idvendedor),
        filiais: () => adicionarLista(filtros.filiais),
        vendedores: () => adicionarLista(filtros.vendedores)
    };

    const texto = String(sql).replace(/:(data_inicial|data_final|idfuncionario|idfilial|idvendedor|filiais|vendedores)\b/g, (_, nome) => mapa[nome]());
    return { sql: texto, valores };
}

function extrairColunas(linhas) {
    if (!Array.isArray(linhas) || !linhas.length) return [];
    return Object.keys(linhas[0]);
}

function executarFirebird(sql, valores) {
    return new Promise((resolve, reject) => {
        Firebird.attach(getFirebirdOptions(), function(err, dbConn) {
            if (err) return reject(err);
            dbConn.query(sql, valores, function(queryErr, result) {
                dbConn.detach();
                if (queryErr) return reject(queryErr);
                resolve(Array.isArray(result) ? result.slice(0, 25) : []);
            });
        });
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' });

    const { fonte = 'firebird', sql, filtros = {}, usuario = {} } = req.body || {};
    if (!usuarioPodeEditarCenario(usuario)) return res.status(403).json({ error: 'Usuario sem permissao para testar cenarios.' });
    const erroValidacao = validarSqlLeitura(sql);
    if (erroValidacao) return res.status(400).json({ error: erroValidacao });

    const fonteNormalizada = String(fonte).toLowerCase() === 'postgres' ? 'postgres' : 'firebird';
    const preparado = prepararSql(sql, fonteNormalizada, filtros);

    try {
        let linhas = [];
        if (fonteNormalizada === 'postgres') {
            const client = await db.connect();
            try {
                const result = await client.query(preparado.sql, preparado.valores);
                linhas = result.rows.slice(0, 25);
            } finally {
                client.release();
            }
        } else {
            linhas = await executarFirebird(preparado.sql, preparado.valores);
        }

        res.status(200).json({
            colunas: extrairColunas(linhas),
            linhas: linhas.length,
            amostra: linhas.slice(0, 5)
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao executar consulta.', details: error.message });
    }
}


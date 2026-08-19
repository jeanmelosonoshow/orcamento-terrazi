import { emailClienteValido, normalizarEmailCliente } from './customer-identifiers.js';

export function somenteDigitos(valor, limite = 30) {
    return String(valor ?? '').replace(/\D/g, '').slice(0, limite);
}

export function cpfValido(valor) {
    const cpf = somenteDigitos(valor, 11);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const calcular = tamanho => {
        let soma = 0;
        for (let indice = 0; indice < tamanho; indice += 1) soma += Number(cpf[indice]) * (tamanho + 1 - indice);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };
    return calcular(9) === Number(cpf[9]) && calcular(10) === Number(cpf[10]);
}

export function normalizarCau(valor) {
    return String(valor ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);
}

export function normalizarArquitetoEntrada(dados = {}) {
    const arquiteto = {
        nome: String(dados.nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 180),
        cpf: somenteDigitos(dados.cpf, 11),
        registroCau: normalizarCau(dados.registroCau ?? dados.registro_cau),
        telefone: somenteDigitos(dados.telefone, 15),
        telefoneAlternativo: somenteDigitos(dados.telefoneAlternativo ?? dados.telefone_alternativo, 15),
        email: normalizarEmailCliente(dados.email).slice(0, 254)
    };
    if (!arquiteto.nome) throw Object.assign(new Error('Informe o nome do arquiteto.'), { statusCode: 400 });
    if (!cpfValido(arquiteto.cpf)) throw Object.assign(new Error('Informe um CPF valido para o arquiteto.'), { statusCode: 400 });
    if (!arquiteto.registroCau) throw Object.assign(new Error('Informe o registro no CAU.'), { statusCode: 400 });
    if (![10, 11].includes(arquiteto.telefone.length)) throw Object.assign(new Error('Informe o telefone principal com DDD.'), { statusCode: 400 });
    if (arquiteto.telefoneAlternativo && ![10, 11].includes(arquiteto.telefoneAlternativo.length)) {
        throw Object.assign(new Error('Informe o telefone alternativo com DDD.'), { statusCode: 400 });
    }
    if (!emailClienteValido(arquiteto.email)) throw Object.assign(new Error('Informe um e-mail valido para o arquiteto.'), { statusCode: 400 });
    return arquiteto;
}

export function normalizarArquiteto(linha) {
    if (!linha) return null;
    return {
        id: Number(linha.id),
        nome: linha.nome,
        cpf: linha.cpf,
        registroCau: linha.registro_cau,
        telefone: linha.telefone,
        telefoneAlternativo: linha.telefone_alternativo || '',
        email: linha.email,
        dataCadastro: linha.data_cadastro,
        idfilialCadastro: linha.idfilial_cadastro,
        ativo: linha.ativo !== false
    };
}

export function podeAlterarArquitetoOrcamento(session) {
    return session?.architectBudgetEditor === true;
}

export async function obterVinculoArquitetoOrcamento(cliente, orcamentoId, bloquear = false) {
    let resultado;
    try {
        resultado = await cliente.query(`
            SELECT ao.*, a.ativo
              FROM arquiteto_orcamento ao
              JOIN arquiteto a ON a.id = ao.arquiteto_id
             WHERE ao.orcamento_id = $1
             LIMIT 1
             ${bloquear ? 'FOR UPDATE OF ao' : ''}
        `, [orcamentoId]);
    } catch (error) {
        if (error?.code === '42P01') return null;
        throw error;
    }
    const linha = resultado.rows[0];
    if (!linha) return null;
    return {
        id: Number(linha.arquiteto_id),
        nome: linha.nome_arquiteto,
        cpf: linha.cpf_arquiteto,
        registroCau: linha.registro_cau_arquiteto,
        telefone: linha.telefone_arquiteto || '',
        email: linha.email_arquiteto || '',
        vinculadoEm: linha.data_vinculo,
        ativo: linha.ativo !== false
    };
}

export async function sincronizarArquitetoOrcamento(cliente, { orcamentoId, arquitetoId, alterar }, session) {
    const atual = await obterVinculoArquitetoOrcamento(cliente, orcamentoId, true);
    const idSolicitado = Number(arquitetoId);
    const possuiIdSolicitado = Number.isSafeInteger(idSolicitado) && idSolicitado > 0;

    if (atual && (!possuiIdSolicitado || atual.id === idSolicitado)) return atual;
    if (atual && (!alterar || !podeAlterarArquitetoOrcamento(session))) {
        throw Object.assign(new Error('O arquiteto deste orcamento nao pode ser alterado por este usuario.'), {
            statusCode: 403,
            code: 'ARCHITECT_LINK_LOCKED'
        });
    }
    if (!possuiIdSolicitado) return null;

    const resultadoArquiteto = await cliente.query('SELECT * FROM arquiteto WHERE id = $1 AND ativo = TRUE LIMIT 1', [idSolicitado]);
    const arquiteto = resultadoArquiteto.rows[0];
    if (!arquiteto) throw Object.assign(new Error('Arquiteto nao encontrado ou inativo.'), { statusCode: 404 });

    if (atual) await cliente.query("SELECT set_config('app.permitir_troca_arquiteto', 'true', TRUE)");
    await cliente.query(`
        INSERT INTO arquiteto_orcamento (
            orcamento_id, arquiteto_id, nome_arquiteto, cpf_arquiteto, registro_cau_arquiteto,
            telefone_arquiteto, email_arquiteto, idfuncionario_vinculo, idfilial_vinculo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (orcamento_id) DO UPDATE SET
            arquiteto_id = EXCLUDED.arquiteto_id,
            nome_arquiteto = EXCLUDED.nome_arquiteto,
            cpf_arquiteto = EXCLUDED.cpf_arquiteto,
            registro_cau_arquiteto = EXCLUDED.registro_cau_arquiteto,
            telefone_arquiteto = EXCLUDED.telefone_arquiteto,
            email_arquiteto = EXCLUDED.email_arquiteto,
            idfuncionario_vinculo = EXCLUDED.idfuncionario_vinculo,
            idfilial_vinculo = EXCLUDED.idfilial_vinculo,
            data_vinculo = CURRENT_TIMESTAMP
    `, [
        orcamentoId,
        arquiteto.id,
        arquiteto.nome,
        arquiteto.cpf,
        arquiteto.registro_cau,
        arquiteto.telefone,
        arquiteto.email,
        Number(session?.sub) || null,
        String(session?.idfilial || '').slice(0, 2) || null
    ]);
    return obterVinculoArquitetoOrcamento(cliente, orcamentoId);
}

export async function agendarSincronizacaoFornecedor(cliente, arquiteto) {
    const id = Number(arquiteto?.id);
    const nome = String(arquiteto?.nome || '').trim().replace(/\s+/g, ' ');
    const telefone = String(arquiteto?.telefone || '').replace(/\D/g, '').slice(0, 50);
    const cpf = String(arquiteto?.cpf || '').replace(/\D/g, '').slice(0, 11);
    if (!Number.isSafeInteger(id) || id <= 0 || !nome || cpf.length !== 11) return false;
    try {
        await cliente.query(`
            INSERT INTO fila_sincronizacao_fornecedor_arquiteto (
                arquiteto_id, nome_fornecedor, telefone_fornecedor, cpf_fornecedor,
                status_fila, proxima_tentativa_em
            ) VALUES ($1, LEFT($2, 60), NULLIF($3, ''), $4, 'PENDENTE', CURRENT_TIMESTAMP)
            ON CONFLICT (arquiteto_id) DO UPDATE SET
                nome_fornecedor = EXCLUDED.nome_fornecedor,
                telefone_fornecedor = EXCLUDED.telefone_fornecedor,
                cpf_fornecedor = EXCLUDED.cpf_fornecedor,
                status_fila = CASE
                    WHEN fila_sincronizacao_fornecedor_arquiteto.cpf_fornecedor = EXCLUDED.cpf_fornecedor
                     AND fila_sincronizacao_fornecedor_arquiteto.status_fila = 'CONCLUIDO'
                    THEN 'CONCLUIDO'
                    ELSE 'PENDENTE'
                END,
                firebird_idfornecedor = CASE
                    WHEN fila_sincronizacao_fornecedor_arquiteto.cpf_fornecedor = EXCLUDED.cpf_fornecedor
                    THEN fila_sincronizacao_fornecedor_arquiteto.firebird_idfornecedor
                    ELSE NULL
                END,
                fornecedor_criado = CASE
                    WHEN fila_sincronizacao_fornecedor_arquiteto.cpf_fornecedor = EXCLUDED.cpf_fornecedor
                    THEN fila_sincronizacao_fornecedor_arquiteto.fornecedor_criado
                    ELSE NULL
                END,
                proxima_tentativa_em = CURRENT_TIMESTAMP,
                bloqueado_ate = NULL,
                erro_ultima_tentativa = NULL,
                data_ultima_atualizacao = CURRENT_TIMESTAMP,
                data_conclusao = CASE
                    WHEN fila_sincronizacao_fornecedor_arquiteto.cpf_fornecedor = EXCLUDED.cpf_fornecedor
                    THEN fila_sincronizacao_fornecedor_arquiteto.data_conclusao
                    ELSE NULL
                END
        `, [id, nome, telefone, cpf]);
        await cliente.query(`
            UPDATE arquiteto a
               SET fornecedor_sync_status = CASE
                       WHEN f.status_fila = 'CONCLUIDO' AND f.firebird_idfornecedor IS NOT NULL
                       THEN 'SINCRONIZADO' ELSE 'PENDENTE'
                   END,
                   fornecedor_sync_erro = NULL,
                   fornecedor_sync_atualizado_em = CURRENT_TIMESTAMP,
                   firebird_idfornecedor = CASE
                       WHEN f.status_fila = 'CONCLUIDO' THEN f.firebird_idfornecedor ELSE NULL
                   END
              FROM fila_sincronizacao_fornecedor_arquiteto f
             WHERE a.id = $1
               AND f.arquiteto_id = a.id
               AND f.cpf_fornecedor = $2
        `, [id, cpf]);
        return true;
    } catch (error) {
        if (['42P01', '42703'].includes(error?.code)) return false;
        throw error;
    }
}

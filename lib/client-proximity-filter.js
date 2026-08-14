const DIRETIVA_CLIENTES_PROXIMOS = /\/\*\s*filtro\s*:\s*clientes_proximos\b([^*]*)\*\//i;
const RAIO_PADRAO_KM = 30;
const CAMPO_CEP_PADRAO = 'CEP';
const CACHE_TABLE = 'bi_geolocalizacao_cache';
const CACHE_SCHEMA_KEY = Symbol.for('terrazi.bi.geolocalizacao.schema');
const MAX_LOCALIDADES_POR_EXECUCAO = 600;
const CONCORRENCIA_GEOCODIFICACAO = 6;
const TIMEOUT_GEOCODIFICACAO_MS = 7000;

function erroProximidade(mensagem, code, status = 422) {
    const error = new Error(mensagem);
    error.code = code;
    error.status = status;
    return error;
}

function normalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

export function normalizarCep(valor) {
    const cep = String(valor || '').replace(/\D/g, '');
    return cep.length === 8 ? cep : '';
}

function obterCampo(linha, nome) {
    if (!linha) return undefined;
    if (Object.prototype.hasOwnProperty.call(linha, nome)) return linha[nome];
    const procurado = normalizarTexto(nome);
    const chave = Object.keys(linha).find(item => normalizarTexto(item) === procurado);
    return chave ? linha[chave] : undefined;
}

function limparNomeCampo(valor) {
    const campo = String(valor || '').trim().replace(/^"|"$/g, '');
    if (!/^[A-Za-z_][A-Za-z0-9_$ ]{0,62}$/.test(campo)) {
        throw erroProximidade(
            'Campo de CEP invalido na diretiva de clientes proximos.',
            'PROXIMITY_DIRECTIVE_INVALID'
        );
    }
    return campo;
}

export function obterConfiguracaoClientesProximos(sql) {
    const match = String(sql || '').match(DIRETIVA_CLIENTES_PROXIMOS);
    if (!match) return null;

    const configuracao = {
        campoCep: CAMPO_CEP_PADRAO,
        raioKm: RAIO_PADRAO_KM
    };
    const opcoes = String(match[1] || '').trim();
    if (!opcoes) return configuracao;

    opcoes.split('|').map(item => item.trim()).filter(Boolean).forEach(item => {
        const partes = item.match(/^([a-z_]+)\s*:\s*(.+)$/i);
        if (!partes) {
            throw erroProximidade(
                'Diretiva de clientes proximos invalida. Use campo_cep: CEP e raio_km: 30.',
                'PROXIMITY_DIRECTIVE_INVALID'
            );
        }
        const nome = partes[1].toLowerCase();
        const valor = partes[2].trim();
        if (nome === 'campo_cep') configuracao.campoCep = limparNomeCampo(valor);
        else if (nome === 'raio_km') configuracao.raioKm = Number(String(valor).replace(',', '.'));
        else {
            throw erroProximidade(
                `Opcao desconhecida na diretiva de clientes proximos: ${nome}.`,
                'PROXIMITY_DIRECTIVE_INVALID'
            );
        }
    });

    if (!Number.isFinite(configuracao.raioKm) || configuracao.raioKm < 1 || configuracao.raioKm > 300) {
        throw erroProximidade(
            'O raio de clientes proximos deve estar entre 1 e 300 km.',
            'PROXIMITY_DIRECTIVE_INVALID'
        );
    }
    return configuracao;
}

export function sqlPossuiFiltroClientesProximos(sql) {
    return DIRETIVA_CLIENTES_PROXIMOS.test(String(sql || ''));
}

export function calcularDistanciaKm(origem, destino) {
    const latitudeOrigem = Number(origem?.latitude);
    const longitudeOrigem = Number(origem?.longitude);
    const latitudeDestino = Number(destino?.latitude);
    const longitudeDestino = Number(destino?.longitude);
    if (![latitudeOrigem, longitudeOrigem, latitudeDestino, longitudeDestino].every(Number.isFinite)) {
        return null;
    }
    const radianos = graus => graus * Math.PI / 180;
    const deltaLatitude = radianos(latitudeDestino - latitudeOrigem);
    const deltaLongitude = radianos(longitudeDestino - longitudeOrigem);
    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(radianos(latitudeOrigem))
        * Math.cos(radianos(latitudeDestino))
        * Math.sin(deltaLongitude / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function chaveLocalidade(linha, campoCep) {
    const cidade = normalizarTexto(obterCampo(linha, 'CIDADE'));
    const bairro = normalizarTexto(obterCampo(linha, 'BAIRRO'));
    const cep = normalizarCep(obterCampo(linha, campoCep));
    if (cidade || bairro) return `LOCAL:${cep.slice(0, 2)}|${cidade}|${bairro}`;
    return cep ? `FAIXA_CEP:${cep.slice(0, 5)}` : '';
}

async function garantirTabelaCache(db) {
    if (!globalThis[CACHE_SCHEMA_KEY]) {
        globalThis[CACHE_SCHEMA_KEY] = db.query(`
            CREATE TABLE IF NOT EXISTS ${CACHE_TABLE} (
                chave VARCHAR(320) PRIMARY KEY,
                tipo VARCHAR(20) NOT NULL,
                cep_referencia VARCHAR(8),
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                cidade VARCHAR(160),
                bairro VARCHAR(160),
                uf VARCHAR(2),
                status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
                origem VARCHAR(40),
                erro_ultima_consulta TEXT,
                data_proxima_tentativa TIMESTAMPTZ,
                data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT bi_geo_status_check CHECK (status IN ('OK', 'SEM_COORDENADAS', 'ERRO')),
                CONSTRAINT bi_geo_coordenadas_check CHECK (
                    (status <> 'OK') OR
                    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
                )
            )
        `).catch(error => {
            globalThis[CACHE_SCHEMA_KEY] = null;
            throw error;
        });
    }
    await globalThis[CACHE_SCHEMA_KEY];
}

async function carregarCache(db, chaves) {
    const unicas = Array.from(new Set(chaves.filter(Boolean)));
    if (!unicas.length) return new Map();
    const resultado = await db.query(`
        SELECT chave, cep_referencia, latitude, longitude, cidade, bairro, uf,
               status, data_proxima_tentativa
          FROM ${CACHE_TABLE}
         WHERE chave = ANY($1::text[])
    `, [unicas]);
    return new Map((resultado.rows || []).map(linha => [linha.chave, linha]));
}

async function salvarCache(db, itens) {
    if (!itens.length) return;
    for (let inicio = 0; inicio < itens.length; inicio += 100) {
        const lote = itens.slice(inicio, inicio + 100);
        const valores = [];
        const linhas = lote.map((item, indice) => {
            const base = indice * 12;
            valores.push(
                item.chave, item.tipo, item.cepReferencia || null,
                item.latitude ?? null, item.longitude ?? null,
                item.cidade || null, item.bairro || null, item.uf || null,
                item.status, item.origem || 'BRASILAPI_CEP_V2',
                item.erro || null, item.dataProximaTentativa || null
            );
            return `(${Array.from({ length: 12 }, (_, posicao) => '$' + (base + posicao + 1)).join(',')})`;
        }).join(',');
        await db.query(`
            INSERT INTO ${CACHE_TABLE} (
                chave, tipo, cep_referencia, latitude, longitude, cidade, bairro, uf,
                status, origem, erro_ultima_consulta, data_proxima_tentativa
            ) VALUES ${linhas}
            ON CONFLICT (chave) DO UPDATE SET
                tipo = EXCLUDED.tipo,
                cep_referencia = EXCLUDED.cep_referencia,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                cidade = EXCLUDED.cidade,
                bairro = EXCLUDED.bairro,
                uf = EXCLUDED.uf,
                status = EXCLUDED.status,
                origem = EXCLUDED.origem,
                erro_ultima_consulta = EXCLUDED.erro_ultima_consulta,
                data_proxima_tentativa = EXCLUDED.data_proxima_tentativa,
                data_ultima_atualizacao = CURRENT_TIMESTAMP
        `, valores);
    }
}

function cachePodeSerConsultado(item) {
    if (!item) return true;
    if (item.status === 'OK') return false;
    if (!item.data_proxima_tentativa) return true;
    return new Date(item.data_proxima_tentativa).getTime() <= Date.now();
}

async function consultarBrasilApi(cep, fetchImpl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_GEOCODIFICACAO_MS);
    const base = String(process.env.BI_PROXIMITY_GEOCODER_URL || 'https://brasilapi.com.br/api/cep/v2')
        .replace(/\/+$/, '');
    try {
        const response = await fetchImpl(`${base}/${cep}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                status: 'SEM_COORDENADAS',
                erro: payload?.message || `CEP nao localizado (${response.status}).`,
                dataProximaTentativa: new Date(Date.now() + 7 * 86400000)
            };
        }
        const latitude = Number(payload?.location?.coordinates?.latitude);
        const longitude = Number(payload?.location?.coordinates?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return {
                status: 'SEM_COORDENADAS',
                cidade: payload?.city,
                bairro: payload?.neighborhood,
                uf: payload?.state,
                erro: 'O servico de CEP nao retornou coordenadas.',
                dataProximaTentativa: new Date(Date.now() + 30 * 86400000)
            };
        }
        return {
            status: 'OK', latitude, longitude,
            cidade: payload?.city, bairro: payload?.neighborhood, uf: payload?.state
        };
    } catch (error) {
        return {
            status: 'ERRO',
            erro: error?.name === 'AbortError' ? 'Tempo limite ao localizar CEP.' : error?.message,
            dataProximaTentativa: new Date(Date.now() + 60 * 60000)
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function mapearConcorrente(itens, limite, tarefa) {
    const resultados = new Array(itens.length);
    let proximo = 0;
    const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
        while (proximo < itens.length) {
            const indice = proximo++;
            resultados[indice] = await tarefa(itens[indice], indice);
        }
    });
    await Promise.all(workers);
    return resultados;
}

async function geocodificarPendencias(db, pendencias, cache, fetchImpl) {
    const consultar = pendencias.filter(item => cachePodeSerConsultado(cache.get(item.chave)));
    if (consultar.length > MAX_LOCALIDADES_POR_EXECUCAO) {
        throw erroProximidade(
            `O relatorio encontrou ${consultar.length} bairros ainda sem indice geografico. O limite por atualizacao e ${MAX_LOCALIDADES_POR_EXECUCAO}.`,
            'PROXIMITY_INDEX_TOO_LARGE'
        );
    }
    const resultados = await mapearConcorrente(consultar, CONCORRENCIA_GEOCODIFICACAO, async item => {
        let resultado = null;
        for (const cep of item.ceps.slice(0, 3)) {
            resultado = await consultarBrasilApi(cep, fetchImpl);
            if (resultado.status === 'OK') return { ...item, ...resultado, cepReferencia: cep };
        }
        return { ...item, ...resultado, cepReferencia: item.ceps[0] };
    });
    const validos = resultados.filter(Boolean);
    await salvarCache(db, validos);
    validos.forEach(item => cache.set(item.chave, {
        chave: item.chave,
        cep_referencia: item.cepReferencia,
        latitude: item.latitude,
        longitude: item.longitude,
        cidade: item.cidade,
        bairro: item.bairro,
        uf: item.uf,
        status: item.status,
        data_proxima_tentativa: item.dataProximaTentativa
    }));
}

async function obterFiliaisReferencia(executarFirebird, session, contexto) {
    const categoria = normalizarTexto(session?.categoria);
    const idFuncionario = String(session?.sub || '').trim();
    let sql = `
        SELECT F.IDFILIAL, F.NOMEFILIAL, F.CIDADE, F.BAIRRO, F.CEP, F.UF
          FROM FILIAL F
         WHERE COALESCE(F.CEP, '') <> ''
    `;
    const valores = [];
    if (categoria === 'SU') {
        sql += ' AND F.IDSUPERVISOR = CAST(? AS INTEGER)';
        valores.push(idFuncionario);
    } else if (categoria !== 'DI') {
        sql += ` AND EXISTS (
            SELECT 1 FROM FUNCIONARIO FU
             WHERE FU.IDFUNCIONARIO = CAST(? AS INTEGER)
               AND FU.IDFILIAL = F.IDFILIAL
               AND FU.STATUS = 'A'
        )`;
        valores.push(idFuncionario);
    }
    sql += ' ORDER BY F.IDFILIAL';
    let filiais = await executarFirebird(sql, valores, {
        operacao: 'filiais-clientes-proximos',
        timeoutMs: 20000,
        limite: 200,
        permitirFallbackCharset: true,
        cacheTtlMs: 300000,
        cacheStaleMs: 900000
    });
    if (['DI', 'SU'].includes(categoria) && contexto.filiaisTodos === false) {
        const selecionadas = new Set((Array.isArray(contexto.filiais) ? contexto.filiais : [])
            .map(item => String(item).trim()));
        filiais = filiais.filter(filial => selecionadas.has(String(obterCampo(filial, 'IDFILIAL')).trim()));
    }
    if (!filiais.length) {
        throw erroProximidade(
            'Nenhuma filial autorizada com CEP foi encontrada para calcular clientes proximos.',
            'PROXIMITY_BRANCH_NOT_FOUND'
        );
    }
    return filiais;
}

export async function aplicarFiltroClientesProximos({
    db,
    executarFirebird,
    linhas,
    session,
    contexto,
    configuracao,
    fetchImpl = fetch
}) {
    const registros = Array.isArray(linhas) ? linhas : [];
    if (!registros.length) {
        return {
            linhas: [],
            metadata: {
                raioKm: configuracao.raioKm,
                clientesAnalisados: 0,
                clientesProximos: 0,
                clientesSemCep: 0,
                localidadesSemCoordenadas: 0,
                aproximacao: 'bairro'
            }
        };
    }
    const possuiCampoCep = Object.keys(registros[0]).some(chave => normalizarTexto(chave) === normalizarTexto(configuracao.campoCep));
    if (!possuiCampoCep) {
        throw erroProximidade(
            `A consulta precisa retornar o campo ${configuracao.campoCep} para usar clientes proximos.`,
            'PROXIMITY_CEP_FIELD_NOT_FOUND'
        );
    }

    await garantirTabelaCache(db);
    const filiais = await obterFiliaisReferencia(executarFirebird, session, contexto);
    const grupos = new Map();
    let clientesSemCep = 0;
    registros.forEach(linha => {
        const cep = normalizarCep(obterCampo(linha, configuracao.campoCep));
        if (!cep) {
            clientesSemCep += 1;
            return;
        }
        const chave = chaveLocalidade(linha, configuracao.campoCep);
        if (!chave) return;
        if (!grupos.has(chave)) grupos.set(chave, { chave, tipo: 'LOCALIDADE', ceps: [] });
        if (!grupos.get(chave).ceps.includes(cep)) grupos.get(chave).ceps.push(cep);
    });
    const pendenciasFiliais = filiais.map(filial => ({
        chave: `CEP:${normalizarCep(obterCampo(filial, 'CEP'))}`,
        tipo: 'FILIAL',
        ceps: [normalizarCep(obterCampo(filial, 'CEP'))]
    })).filter(item => item.ceps[0]);
    const pendencias = [...pendenciasFiliais, ...grupos.values()];
    const cache = await carregarCache(db, pendencias.map(item => item.chave));
    await geocodificarPendencias(db, pendencias, cache, fetchImpl);

    const filiaisLocalizadas = filiais.map(filial => {
        const cep = normalizarCep(obterCampo(filial, 'CEP'));
        const geo = cache.get(`CEP:${cep}`);
        return geo?.status === 'OK' ? {
            idfilial: String(obterCampo(filial, 'IDFILIAL') || '').trim(),
            nomefilial: String(obterCampo(filial, 'NOMEFILIAL') || '').trim(),
            latitude: Number(geo.latitude),
            longitude: Number(geo.longitude)
        } : null;
    }).filter(Boolean);
    if (!filiaisLocalizadas.length) {
        throw erroProximidade(
            'Nao foi possivel localizar o CEP das filiais autorizadas. Revise o CEP cadastrado em FILIAL.',
            'PROXIMITY_BRANCH_COORDINATES_NOT_FOUND'
        );
    }

    const localidadesSemCoordenadas = new Set();
    let clientesSemCoordenadas = 0;
    const proximos = [];
    registros.forEach(linha => {
        const chave = chaveLocalidade(linha, configuracao.campoCep);
        const geo = cache.get(chave);
        if (!chave || geo?.status !== 'OK') {
            if (chave) localidadesSemCoordenadas.add(chave);
            if (chave) clientesSemCoordenadas += 1;
            return;
        }
        let filialMaisProxima = null;
        let distanciaMaisCurta = Number.POSITIVE_INFINITY;
        filiaisLocalizadas.forEach(filial => {
            const distancia = calcularDistanciaKm(geo, filial);
            if (distancia !== null && distancia < distanciaMaisCurta) {
                distanciaMaisCurta = distancia;
                filialMaisProxima = filial;
            }
        });
        if (filialMaisProxima && distanciaMaisCurta <= configuracao.raioKm) {
            proximos.push({
                ...linha,
                DISTANCIA_KM: Number(distanciaMaisCurta.toFixed(1)),
                IDFILIAL_PROXIMA: filialMaisProxima.idfilial,
                FILIAL_PROXIMA: filialMaisProxima.nomefilial
            });
        }
    });
    proximos.sort((a, b) => Number(a.DISTANCIA_KM) - Number(b.DISTANCIA_KM));

    return {
        linhas: proximos,
        metadata: {
            raioKm: configuracao.raioKm,
            clientesAnalisados: registros.length,
            clientesProximos: proximos.length,
            clientesSemCep,
            clientesSemCoordenadas,
            localidadesSemCoordenadas: localidadesSemCoordenadas.size,
            filiaisConsideradas: filiaisLocalizadas.map(filial => ({
                idfilial: filial.idfilial,
                nomefilial: filial.nomefilial
            })),
            aproximacao: 'bairro'
        }
    };
}

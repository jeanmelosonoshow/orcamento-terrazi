-- Cache geografico usado pela diretiva /* filtro: clientes_proximos */.
-- A aplicacao tambem cria esta tabela automaticamente caso ela ainda nao exista.
CREATE TABLE IF NOT EXISTS bi_geolocalizacao_cache (
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
);

CREATE INDEX IF NOT EXISTS idx_bi_geo_status_tentativa
    ON bi_geolocalizacao_cache (status, data_proxima_tentativa);

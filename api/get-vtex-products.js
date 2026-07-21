function limparHtml(valor = '') {
  return String(valor || '').replace(/<[^>]*>/g, '').trim();
}

function primeiroValor(valor) {
  if (Array.isArray(valor)) return valor.find(Boolean) || '';
  return valor || '';
}

function obterPreco(item) {
  const seller = item?.sellers?.find(s => s?.commertialOffer?.AvailableQuantity > 0) || item?.sellers?.[0];
  const offer = seller?.commertialOffer || {};
  return Number(offer.Price || offer.ListPrice || 0);
}

function obterSkuReferencia(item, produto) {
  return item?.referenceId?.[0]?.Value || item?.itemId || produto?.productReference || produto?.productId || 'S/ SKU';
}

function obterSkuId(item, produto) {
  return item?.itemId || produto?.productId || '';
}

function selecionarItemProduto(produto, termoBusca = '') {
  const items = Array.isArray(produto?.items) ? produto.items : [];
  if (items.length === 0) return {};

  const termo = String(termoBusca || '').trim().toLowerCase();
  if (!termo) return items[0];

  return items.find(item => {
    const refId = String(item?.referenceId?.[0]?.Value || '').toLowerCase();
    const itemId = String(item?.itemId || '').toLowerCase();
    const name = String(item?.name || item?.nameComplete || '').toLowerCase();
    return refId === termo || itemId === termo || refId.includes(termo) || itemId.includes(termo) || name.includes(termo);
  }) || items[0];
}

function lerQuantidadeEstoque(estoque) {
  if (!estoque) return 0;
  if (estoque.hasUnlimitedQuantity || estoque.unlimitedQuantity) return Number.POSITIVE_INFINITY;

  const available = estoque.availableQuantity ?? estoque.available ?? estoque.quantityAvailable;
  if (Number.isFinite(Number(available))) return Math.max(0, Number(available));

  const total = Number(estoque.totalQuantity ?? estoque.quantity ?? estoque.total ?? 0);
  const reserved = Number(estoque.reservedQuantity ?? estoque.reserved ?? 0);
  return Math.max(0, total - reserved);
}

function obterQuantidadeDisponivelWarehouse(inventory, warehouseId) {
  const targetWarehouse = String(warehouseId || '').trim().toLowerCase();
  const balance = Array.isArray(inventory?.balance)
    ? inventory.balance
    : Array.isArray(inventory)
      ? inventory
      : [];

  if (balance.length === 0 && inventory && typeof inventory === 'object') {
    return lerQuantidadeEstoque(inventory);
  }

  const estoque = balance.find(item => String(item?.warehouseId || item?.warehouseID || item?.id || '').trim().toLowerCase() === targetWarehouse);
  return lerQuantidadeEstoque(estoque);
}

async function consultarJson(url, headers) {
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const details = await response.text();
    return { ok: false, status: response.status, details };
  }
  return { ok: true, data: await response.json() };
}

async function resolverSkuIdPorReferencia({ baseUrl, headers, refId }) {
  const referencia = String(refId || '').trim();
  if (!referencia) return '';

  const url = `${baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitidbyrefid/${encodeURIComponent(referencia)}`;
  const result = await consultarJson(url, headers);
  if (!result.ok) return '';

  if (typeof result.data === 'number' || typeof result.data === 'string') return String(result.data);
  return String(result.data?.Id || result.data?.id || result.data?.SkuId || result.data?.skuId || '');
}

async function buscarEstoqueWarehouse({ baseUrl, headers, skuId, warehouseId }) {
  if (!skuId || !warehouseId) return 0;

  const warehouseUrl = `${baseUrl}/api/logistics/pvt/inventory/items/${encodeURIComponent(skuId)}/warehouses/${encodeURIComponent(warehouseId)}`;
  const warehouseResult = await consultarJson(warehouseUrl, headers);
  if (warehouseResult.ok) return obterQuantidadeDisponivelWarehouse(warehouseResult.data, warehouseId);

  const skuUrl = `${baseUrl}/api/logistics/pvt/inventory/skus/${encodeURIComponent(skuId)}`;
  const skuResult = await consultarJson(skuUrl, headers);
  if (skuResult.ok) return obterQuantidadeDisponivelWarehouse(skuResult.data, warehouseId);

  console.error(`Erro ao buscar estoque VTEX do SKU ${skuId}: warehouse ${warehouseResult.status} - ${warehouseResult.details}; sku ${skuResult.status} - ${skuResult.details}`);
  return 0;
}

function formatarEstoqueFdc(quantity) {
  if (quantity === Number.POSITIVE_INFINITY) return 'Sob Consulta';
  return quantity > 0 ? quantity : 'Consulte disponibilidade';
}

function mapearProdutoVtex(produto, item, estoqueWarehouse = 0) {
  const sku = obterSkuReferencia(item, produto);
  const image = item?.images?.[0]?.imageUrl || produto.items?.flatMap(i => i.images || [])?.[0]?.imageUrl || 'https://via.placeholder.com/300';

  return {
    id: produto.productId || item?.itemId || sku,
    sku,
    name: produto.productName || item?.nameComplete || item?.name || 'Produto sem nome',
    description: limparHtml(produto.description || produto.metaTagDescription || ''),
    price: obterPreco(item),
    stock: formatarEstoqueFdc(estoqueWarehouse),
    image,
    category: primeiroValor(produto.categories) || primeiroValor(produto.categoriesIds) || 'Geral',
    published: true
  };
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `https://${req.headers.host}`);
  const q = searchParams.get('q') || '';

  const rawAccountName = process.env.SONOSHOW_VTEX_ACCOUNT_NAME || process.env.VTEX_ACCOUNT_NAME || '';
  const environment = String(process.env.SONOSHOW_VTEX_ENVIRONMENT || process.env.VTEX_ENVIRONMENT || 'vtexcommercestable').trim().replace(/^\.+|\.+$/g, '');
  const accountName = rawAccountName
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.myvtex\.com(?:\.br)?$/i, '')
    .replace(/\.vtexcommercestable\.com\.br$/i, '')
    .replace(/\.vtexcommercebeta\.com\.br$/i, '')
    .split('/')[0]
    .split('.')[0];
  const appKey = process.env.SONOSHOW_VTEX_APP_KEY || process.env.VTEX_APP_KEY;
  const appToken = process.env.SONOSHOW_VTEX_APP_TOKEN || process.env.VTEX_APP_TOKEN;
  const salesChannel = process.env.SONOSHOW_VTEX_SALES_CHANNEL || process.env.VTEX_SALES_CHANNEL || '';
  const warehouseId = process.env.SONOSHOW_VTEX_WAREHOUSE_ID || process.env.VTEX_WAREHOUSE_ID || 'ESTOQUE_CD_FDC';

  if (!accountName) {
    return res.status(500).json({ error: 'Configuração faltando: SONOSHOW_VTEX_ACCOUNT_NAME não definido na Vercel.' });
  }

  const params = new URLSearchParams({ _from: '0', _to: '49' });
  if (q.trim()) params.set('ft', q.trim());
  if (salesChannel) params.set('sc', salesChannel);

  const baseUrl = `https://${accountName}.${environment}.com.br`;
  const url = `${baseUrl}/api/catalog_system/pub/products/search?${params.toString()}`;
  const headers = { Accept: 'application/json' };

  if (appKey && appToken) {
    headers['X-VTEX-API-AppKey'] = appKey.trim();
    headers['X-VTEX-API-AppToken'] = appToken.trim();
  }

  try {
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const details = await response.text();
      console.error(`Erro da VTEX: ${response.status} - ${details}`);
      return res.status(response.status).json({ error: 'Erro na VTEX', details, accountName, environment });
    }

    const data = await response.json();
    const products = Array.isArray(data)
      ? await Promise.all(data.map(async produto => {
          const item = selecionarItemProduto(produto, q);
          const skuReferencia = obterSkuReferencia(item, produto);
          const skuId = obterSkuId(item, produto) || await resolverSkuIdPorReferencia({ baseUrl, headers, refId: skuReferencia });
          const estoqueWarehouse = await buscarEstoqueWarehouse({ baseUrl, headers, skuId, warehouseId });
          return mapearProdutoVtex(produto, item, estoqueWarehouse);
        }))
      : [];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos VTEX:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar produtos VTEX', message: error.message, accountName, environment });
  }
}


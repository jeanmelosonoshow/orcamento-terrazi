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

function obterSkuId(item, produto) {
  return item?.itemId || produto?.productId || '';
}

function obterQuantidadeDisponivelWarehouse(inventory, warehouseId) {
  const balance = Array.isArray(inventory?.balance) ? inventory.balance : [];
  const estoque = balance.find(item => String(item?.warehouseId || '').trim() === warehouseId);
  if (!estoque) return 0;
  if (estoque.hasUnlimitedQuantity) return Number.POSITIVE_INFINITY;

  const total = Number(estoque.totalQuantity || 0);
  const reserved = Number(estoque.reservedQuantity || 0);
  return Math.max(0, total - reserved);
}

async function buscarEstoqueWarehouse({ baseUrl, headers, skuId, warehouseId }) {
  if (!skuId || !warehouseId) return 0;

  const response = await fetch(`${baseUrl}/api/logistics/pvt/inventory/skus/${encodeURIComponent(skuId)}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(`Erro ao buscar estoque VTEX do SKU ${skuId}: ${response.status} - ${details}`);
    return 0;
  }

  const inventory = await response.json();
  return obterQuantidadeDisponivelWarehouse(inventory, warehouseId);
}

function formatarEstoqueFdc(quantity) {
  if (quantity === Number.POSITIVE_INFINITY) return 'Sob Consulta';
  return quantity > 0 ? quantity : 'Consulte disponibilidade';
}

function mapearProdutoVtex(produto, estoqueWarehouse = 0) {
  const item = produto.items?.[0] || {};
  const sku = item.referenceId?.[0]?.Value || item.itemId || produto.productReference || produto.productId || 'S/ SKU';
  const image = item.images?.[0]?.imageUrl || produto.items?.flatMap(i => i.images || [])?.[0]?.imageUrl || 'https://via.placeholder.com/300';

  return {
    id: produto.productId || item.itemId || sku,
    sku,
    name: produto.productName || item.nameComplete || item.name || 'Produto sem nome',
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
          const item = produto.items?.[0] || {};
          const skuId = obterSkuId(item, produto);
          const estoqueWarehouse = await buscarEstoqueWarehouse({ baseUrl, headers, skuId, warehouseId });
          return mapearProdutoVtex(produto, estoqueWarehouse);
        }))
      : [];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos VTEX:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar produtos VTEX', message: error.message, accountName, environment });
  }
}

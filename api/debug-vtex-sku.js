function normalizarAccountName(rawAccountName = '') {
  return String(rawAccountName || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.myvtex\.com(?:\.br)?$/i, '')
    .replace(/\.vtexcommercestable\.com\.br$/i, '')
    .replace(/\.vtexcommercebeta\.com\.br$/i, '')
    .split('/')[0]
    .split('.')[0];
}

async function consultarTextoJson(url, headers) {
  const response = await fetch(url, { method: 'GET', headers });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (error) { json = null; }
  return {
    url,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: json ?? text
  };
}

function resumirProduto(produto) {
  return {
    productId: produto?.productId,
    productName: produto?.productName,
    productReference: produto?.productReference,
    linkText: produto?.linkText,
    items: Array.isArray(produto?.items) ? produto.items.map(item => ({
      itemId: item?.itemId,
      name: item?.name,
      nameComplete: item?.nameComplete,
      referenceId: item?.referenceId,
      ean: item?.ean,
      sellers: Array.isArray(item?.sellers) ? item.sellers.map(seller => ({
        sellerId: seller?.sellerId,
        sellerName: seller?.sellerName,
        availableQuantity: seller?.commertialOffer?.AvailableQuantity,
        price: seller?.commertialOffer?.Price,
        listPrice: seller?.commertialOffer?.ListPrice
      })) : []
    })) : []
  };
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `https://${req.headers.host}`);
  const ref = searchParams.get('ref') || searchParams.get('q') || '42949';

  const accountName = normalizarAccountName(process.env.SONOSHOW_VTEX_ACCOUNT_NAME || process.env.VTEX_ACCOUNT_NAME || '');
  const environment = String(process.env.SONOSHOW_VTEX_ENVIRONMENT || process.env.VTEX_ENVIRONMENT || 'vtexcommercestable').trim().replace(/^\.+|\.+$/g, '');
  const appKey = process.env.SONOSHOW_VTEX_APP_KEY || process.env.VTEX_APP_KEY;
  const appToken = process.env.SONOSHOW_VTEX_APP_TOKEN || process.env.VTEX_APP_TOKEN;
  const warehouseId = process.env.SONOSHOW_VTEX_WAREHOUSE_ID || process.env.VTEX_WAREHOUSE_ID || 'ESTOQUE_CD_FDC';

  if (!accountName) {
    return res.status(500).json({ error: 'Account name nao configurado.' });
  }

  const baseUrl = `https://${accountName}.${environment}.com.br`;
  const headers = { Accept: 'application/json' };
  if (appKey && appToken) {
    headers['X-VTEX-API-AppKey'] = appKey.trim();
    headers['X-VTEX-API-AppToken'] = appToken.trim();
  }

  const searchUrl = `${baseUrl}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(ref)}&_from=0&_to=49`;
  const refIdUrl = `${baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitidbyrefid/${encodeURIComponent(ref)}`;

  const searchResult = await consultarTextoJson(searchUrl, headers);
  const refIdResult = await consultarTextoJson(refIdUrl, headers);

  const produtos = Array.isArray(searchResult.body) ? searchResult.body : [];
  const skusEncontrados = [];
  produtos.forEach(produto => {
    (produto.items || []).forEach(item => {
      skusEncontrados.push({
        productId: produto.productId,
        productName: produto.productName,
        productReference: produto.productReference,
        itemId: item.itemId,
        name: item.name,
        nameComplete: item.nameComplete,
        referenceId: item.referenceId,
        ean: item.ean
      });
    });
  });

  const skuIds = new Set();
  skusEncontrados.forEach(item => {
    if (item.itemId) skuIds.add(String(item.itemId));
  });
  if (refIdResult.ok && (typeof refIdResult.body === 'number' || typeof refIdResult.body === 'string')) {
    skuIds.add(String(refIdResult.body));
  }
  if (refIdResult.ok && refIdResult.body && typeof refIdResult.body === 'object') {
    [refIdResult.body.Id, refIdResult.body.id, refIdResult.body.SkuId, refIdResult.body.skuId].filter(Boolean).forEach(id => skuIds.add(String(id)));
  }

  const inventoryResults = [];
  for (const skuId of skuIds) {
    inventoryResults.push({
      skuId,
      warehouse: await consultarTextoJson(`${baseUrl}/api/logistics/pvt/inventory/items/${encodeURIComponent(skuId)}/warehouses/${encodeURIComponent(warehouseId)}`, headers),
      bySku: await consultarTextoJson(`${baseUrl}/api/logistics/pvt/inventory/skus/${encodeURIComponent(skuId)}`, headers)
    });
  }

  return res.status(200).json({
    ref,
    accountName,
    environment,
    warehouseId,
    search: {
      ok: searchResult.ok,
      status: searchResult.status,
      url: searchResult.url,
      productsCount: produtos.length,
      products: produtos.map(resumirProduto)
    },
    skuByReference: refIdResult,
    skusEncontrados,
    inventoryResults
  });
}

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

function obterEstoque(item) {
  const seller = item?.sellers?.find(s => s?.commertialOffer) || item?.sellers?.[0];
  const quantity = seller?.commertialOffer?.AvailableQuantity;
  return Number.isFinite(Number(quantity)) ? Number(quantity) : 'Sob Consulta';
}

function mapearProdutoVtex(produto) {
  const item = produto.items?.[0] || {};
  const sku = item.referenceId?.[0]?.Value || item.itemId || produto.productReference || produto.productId || 'S/ SKU';
  const image = item.images?.[0]?.imageUrl || produto.items?.flatMap(i => i.images || [])?.[0]?.imageUrl || 'https://via.placeholder.com/300';

  return {
    id: produto.productId || item.itemId || sku,
    sku,
    name: produto.productName || item.nameComplete || item.name || 'Produto sem nome',
    description: limparHtml(produto.description || produto.metaTagDescription || ''),
    price: obterPreco(item),
    stock: obterEstoque(item),
    image,
    category: primeiroValor(produto.categories) || primeiroValor(produto.categoriesIds) || 'Geral',
    published: true
  };
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `https://${req.headers.host}`);
  const q = searchParams.get('q') || '';

  const accountName = process.env.VTEX_ACCOUNT_NAME;
  const environment = process.env.VTEX_ENVIRONMENT || 'vtexcommercestable';
  const appKey = process.env.VTEX_APP_KEY;
  const appToken = process.env.VTEX_APP_TOKEN;
  const salesChannel = process.env.VTEX_SALES_CHANNEL || '';

  if (!accountName) {
    return res.status(500).json({ error: 'Configuração faltando: VTEX_ACCOUNT_NAME não definido na Vercel.' });
  }

  const params = new URLSearchParams({ _from: '0', _to: '99' });
  if (q.trim()) params.set('ft', q.trim());
  if (salesChannel) params.set('sc', salesChannel);

  const url = `https://${accountName}.${environment}.com.br/api/catalog_system/pub/products/search?${params.toString()}`;
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
      return res.status(response.status).json({ error: 'Erro na VTEX', details });
    }

    const data = await response.json();
    const products = Array.isArray(data) ? data.map(mapearProdutoVtex) : [];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos VTEX:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar produtos VTEX', message: error.message });
  }
}

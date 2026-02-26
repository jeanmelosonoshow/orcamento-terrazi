export default async function handler(req, res) {
  const { q } = req.query; 

  const storeId = process.env.NUVEMSHOP_STORE_ID;
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;

  try {
    // Buscamos os produtos. A query 'q' filtra por nome ou SKU (que a Nuvemshop aceita na busca)
    const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/products?q=${q || ''}`, {
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'User-Agent': 'GeradorOrcamento (seuemail@exemplo.com)'
      }
    });

    if (!response.ok) {
        throw new Error(`Erro Nuvemshop: ${response.status}`);
    }

    const data = await response.json();

    // Mapeamos os dados trazendo TUDO o que você precisa em uma única pancada
    const products = data.map(p => ({
      id: p.id,
      sku: p.variants[0]?.sku || 'S/ SKU', // SKU para busca técnica
      name: p.name.pt,
      description: p.description ? p.description.pt : '', // Descrição completa para a IA
      price: p.variants[0]?.price || "0.00",
      stock: p.variants[0]?.stock ?? 0, // Estoque atual
      image: p.images[0]?.src || '', // Foto principal
      // Caso precise de mais fotos, p.images é um array
    }));

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
  }
}

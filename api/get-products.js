export default async function handler(req, res) {
   // 1. Forma moderna de ler a URL para evitar o erro [DEP0169]
  const { searchParams } = new URL(req.url, `https://${req.headers.host}`);
  const q = searchParams.get('q') || '';

  const storeId = process.env.NUVEMSHOP_STORE_ID;
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;

  // Log de depuração (aparecerá no painel da Vercel)
  console.log(`Iniciando busca para a loja ${storeId} com o termo: ${q}`);

  if (!accessToken || !storeId) {
    return res.status(500).json({ error: "Configuração faltando: Token ou StoreID não definidos na Vercel." });
  }

  try {
    const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/products?q=${encodeURIComponent(q)}`, {
      method: 'GET',
      headers: {
        'Authentication': `bearer ${accessToken.trim()}`,
        'User-Agent': 'TerraziOrcamentos (contato@terrazi.com.br)',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro da Nuvemshop: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: "Erro na Nuvemshop", details: errorText });
    }

    const data = await response.json();

    // Se a API retornar algo que não seja um array, tratamos aqui
    if (!Array.isArray(data)) {
      return res.status(200).json([]);
    }

    const products = data.map(p => ({
      id: p.id,
      sku: p.variants[0]?.sku || 'S/ SKU',
      name: p.name.pt || p.name.es || 'Produto sem nome',
      description: p.description ? p.description.pt : '',
      price: p.variants[0]?.price || "0.00",
      stock: p.variants[0]?.stock ?? 0,
      image: p.images[0]?.src || '',
    }));

    res.status(200).json(products);

  } catch (error) {
    console.error("Erro catastrófico na API:", error);
    res.status(500).json({ error: 'Erro interno no servidor', message: error.message });
  }
}

export default async function handler(req, res) {
  // Pegando o termo de busca que virá do seu site
  const { q } = req.query; 

  const storeId = process.env.NUVEMSHOP_STORE_ID;
  const accessToken = process.env.NUVEMSHOP_TOKEN;

  try {
    const response = await fetch(`https://api.tiendanube.com/v1/${storeId}/products?q=${q || ''}`, {
      headers: {
        'Authentication': `bearer ${accessToken}`,
        'User-Agent': 'GeradorOrcamento (seuemail@exemplo.com)'
      }
    });

    const data = await response.json();

    // Aqui filtramos apenas o que o arquiteto precisa ver:
    // Nome, Descrição, Preço, Foto Principal e Estoque
    const products = data.map(p => ({
      id: p.id,
      name: p.name.pt,
      description: p.description ? p.description.pt : '',
      price: p.variants[0].price,
      stock: p.variants[0].stock,
      image: p.images[0]?.src || '',
      link: p.handle ? `https://sualoja.com.br/produtos/${p.handle.pt}` : ''
    }));

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
}

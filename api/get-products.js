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

      if (!Array.isArray(data)) {
          return res.status(200).json([]);
      }
      
      // FILTRO E MAPEAMENTO NO BACKEND
   // Filtramos e mapeamos em uma única passada para melhor performance
         const products = data
             .filter(p => p.published === true) // Garante que SÓ o que é visível passe
             .map(p => {
                 // Selecionamos a variante principal
                 const mainVariant = p.variants && p.variants.length > 0 ? p.variants[0] : null;
         
                 return {
                     id: p.id,
                     // Fallback para SKU caso não exista na variante
                     sku: mainVariant?.sku || 'S/ SKU',
                     // Prioridade para Português, depois Espanhol, depois Nome Genérico
                     name: p.name?.pt || p.name?.es || p.name || 'Produto sem nome',
                     // Tratamento robusto para descrição (remove tags HTML se necessário no futuro)
                     description: p.description?.pt || p.description?.es || (typeof p.description === 'string' ? p.description : ""),
                     // Garante que o preço seja tratado como número ou string formatada
                     price: mainVariant?.price || "0.00",
                     // Estoque: Nuvemshop usa null para "infinito", então convertemos para texto ou 0
                     stock: mainVariant?.stock !== null ? mainVariant?.stock : "Consultar",
                     // Imagem: Pega a primeira ou uma placeholder se estiver sem foto
                     image: p.images && p.images.length > 0 ? p.images[0].src : 'https://via.placeholder.com/300',
                     // Mantemos a flag para o frontend
                     published: p.published 
                 };
             });
         
         res.status(200).json(products);

  } catch (error) {
    console.error("Erro catastrófico na API:", error);
    res.status(500).json({ error: 'Erro interno no servidor', message: error.message });
  }
}

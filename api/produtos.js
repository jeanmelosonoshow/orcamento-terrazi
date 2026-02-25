
// api/produtos.js
export default async function handler(req, res) {
  const { page = 1, per_page = 30 } = req.query;
  
  const response = await fetch(`https://api.tiendanube.com/v1/${process.env.NUVEI_USER_ID}/products?page=${page}&per_page=${per_page}`, {
    headers: {
      'Authentication': `bearer ${process.env.NUVEI_ACCESS_TOKEN}`,
      'User-Agent': 'Terrazi Orçamentos (contato@seudominio.com)'
    }
  });

  const data = await response.json();
  res.status(200).json(data);
}

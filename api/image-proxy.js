export default async function handler(req, res) {
  const rawUrl = req.query?.url;
  const imageUrl = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

  if (!imageUrl) {
    return res.status(400).json({ error: 'URL da imagem não informada.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (error) {
    return res.status(400).json({ error: 'URL da imagem inválida.' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Protocolo de imagem não permitido.' });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Não foi possível carregar a imagem.' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'O endereço informado não retornou uma imagem.' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Erro no proxy de imagem:', error);
    return res.status(500).json({ error: 'Erro ao carregar imagem.' });
  }
}
import { put } from '@vercel/blob';
import { requireRequestSession } from '../lib/session-token.js';

const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024;

function nomeSeguro(valor) {
  const base = String(valor || 'produto-personalizado')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'produto-personalizado';
}

function pareceJpeg(buffer) {
  return buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const session = requireRequestSession(req, res);
  if (!session) return;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Armazenamento de imagens ainda não está disponível.' });
  }

  const dataBase64 = String(req.body?.dataBase64 || '');
  if (!dataBase64 || dataBase64.length > Math.ceil(TAMANHO_MAXIMO_BYTES * 4 / 3) + 16) {
    return res.status(413).json({ error: 'A imagem enviada excede o limite permitido.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Conteúdo da imagem inválido.' });
  }

  if (!buffer.length || buffer.length > TAMANHO_MAXIMO_BYTES || !pareceJpeg(buffer)) {
    return res.status(415).json({ error: 'Envie uma imagem válida nos formatos aceitos.' });
  }

  const filial = nomeSeguro(session.idfilial || 'sem-filial');
  const arquivo = nomeSeguro(req.body?.fileName).replace(/\.[^.]+$/, '') || 'produto-personalizado';
  const pathname = `orcamentos/personalizados/${filial}/${Date.now()}-${arquivo}.jpg`;

  try {
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
      cacheControlMaxAge: 31536000
    });

    return res.status(201).json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType
    });
  } catch (error) {
    console.error('Erro ao enviar imagem de produto personalizado:', error);
    return res.status(502).json({ error: 'Não foi possível armazenar a imagem. Tente novamente.' });
  }
}

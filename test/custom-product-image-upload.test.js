import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ler = caminho => readFile(new URL(caminho, import.meta.url), 'utf8');

test('produto personalizado oferece arquivo, galeria, camera e URL', async () => {
  const script = await ler('../public/script.js');

  assert.match(script, /data-custom-image-file[^>]+accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif/);
  assert.match(script, /data-custom-image-camera[^>]+accept="image\/\*" capture="environment"/);
  assert.match(script, /Galeria \/ arquivo/);
  assert.match(script, /Tirar foto/);
  assert.match(script, /data-custom-image-url/);
  assert.match(script, /event\.dataTransfer\?\.files\?\.\[0\]/);
});

test('imagem e reduzida antes do envio e exibe o andamento', async () => {
  const script = await ler('../public/script.js');

  assert.match(script, /IMAGEM_PRODUTO_DIMENSAO_MAXIMA = 1600/);
  assert.match(script, /IMAGEM_PRODUTO_TAMANHO_UPLOAD_MAXIMO = 1\.5 \* 1024 \* 1024/);
  assert.match(script, /canvas\.toBlob/);
  assert.match(script, /Preparando imagem\.\.\./);
  assert.match(script, /Enviando imagem\.\.\./);
  assert.match(script, /fetch\('\/api\/upload-imagem-produto'/);
});

test('API protege o Blob com sessao, tamanho e validacao JPEG', async () => {
  const api = await ler('../api/upload-imagem-produto.js');

  assert.match(api, /requireRequestSession\(req, res\)/);
  assert.match(api, /BLOB_READ_WRITE_TOKEN/);
  assert.match(api, /TAMANHO_MAXIMO_BYTES = 2 \* 1024 \* 1024/);
  assert.match(api, /pareceJpeg\(buffer\)/);
  assert.match(api, /access: 'public'/);
  assert.match(api, /addRandomSuffix: true/);
  assert.match(api, /orcamentos\/personalizados/);
});

test('formularios carregam a versao atualizada do fluxo de imagem', async () => {
  const formularios = await Promise.all([
    ler('../public/index.html'),
    ler('../public/index-sonoshow.html')
  ]);

  for (const html of formularios) {
    assert.match(html, /script\.js\?v=20261027-upload-imagem-blob-3/);
  }
});

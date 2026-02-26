export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  const apiKeysString = process.env.GEMINI_API_KEY || "";
  const apiKeys = apiKeysString.split(',').map(k => k.trim()).filter(k => k);

  if (apiKeys.length === 0) {
    return res.status(200).json({ summary: "" });
  }

  if (req.method !== 'POST') return res.status(405).send();
  const { description, productName } = req.body;

  // Função interna para tentar cada chave
  async function tryGenerate(index) {
    if (index >= apiKeys.length) {
      return ""; // Esgotou todas as chaves, retorna vazio
    }

    const currentKey = apiKeys[index];
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentKey}`;

    try {
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extraia dados técnicos (Dimensões, Materiais e Diferenciais) em tópicos. Produto: ${productName}. Descrição: ${description}`
            }]
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 }
        })
      });

      const data = await response.json();

      // Se der erro de quota ou qualquer erro do Google, tenta a PRÓXIMA chave
      if (data.error) {
        console.error(`Chave ${index} falhou: ${data.error.message}`);
        return tryGenerate(index + 1);
      }

      // Se der certo, retorna o texto
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }

      return tryGenerate(index + 1);

    } catch (err) {
      return tryGenerate(index + 1);
    }
  }

  const result = await tryGenerate(0);
  return res.status(200).json({ summary: result });
}

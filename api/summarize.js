export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  // Lista de chaves separadas por vírgula na Vercel
  const apiKeysString = process.env.GEMINI_API_KEY || "";
  const apiKeys = apiKeysString.split(',').map(k => k.trim()).filter(k => k);

  if (apiKeys.length === 0) {
    return res.status(200).json({ summary: "" });
  }

  if (req.method !== 'POST') return res.status(405).send();
  const { description, productName } = req.body;

  // Limpeza básica para evitar enviar HTML muito pesado para a IA
  const descriptionLimpa = description ? description.replace(/<[^>]*>?/gm, '') : "";

  // Função interna para tentar cada chave silenciosamente
  async function tryGenerate(index) {
    if (index >= apiKeys.length) {
      console.error("Todas as chaves da IA falharam.");
      return ""; // Retorna vazio para acionar o Fallback no script.js
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
              text: `Aja como arquiteto. Extraia dados técnicos (Dimensões, Materiais e Diferenciais) em tópicos curtos. Se não houver dados, responda 'Sem dados'. Produto: ${productName}. Descrição: ${descriptionLimpa}`
            }]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
        })
      });

      const data = await response.json();

      // Caso a chave atual esteja sem cota ou dê erro, pula para a próxima
      if (data.error) {
        console.warn(`Chave index ${index} indisponível. Tentando próxima...`);
        return tryGenerate(index + 1);
      }

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

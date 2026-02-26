export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  // 1. Pega a string de chaves e transforma em uma Array
  const apiKeysString = process.env.GEMINI_API_KEY || "";
  const apiKeys = apiKeysString.split(',').map(k => k.trim());

  if (apiKeys.length === 0 || !apiKeys[0]) {
    return res.status(500).json({ error: 'Nenhuma chave configurada.' });
  }

  // 2. Escolhe uma chave aleatória do pool
  const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

  if (req.method !== 'POST') return res.status(405).send();

  const { description, productName } = req.body;

  try {
    // Usando v1beta e gemini-1.5-flash (mais estável para cotas grátis)
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${selectedKey}`;

    const response = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Extraia dados técnicos (Dimensões, Materiais e Diferenciais) em tópicos.
            Produto: ${productName}
            Descrição: ${description}`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      // Se der erro de cota, avisamos qual chave falhou para diagnóstico
      const obscuredKey = selectedKey.substring(0, 6) + "..." + selectedKey.slice(-4);
      return res.status(200).json({ 
        summary: `Limite atingido na chave ${obscuredKey}. Tente novamente em instantes.`,
        error: data.error.message 
      });
    }

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({ summary: data.candidates[0].content.parts[0].text });
    }

    return res.status(200).json({ summary: "Descrição processada. Verifique os dados." });

  } catch (err) {
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });
  }

  // Mantemos o GET para diagnóstico se precisar futuramente
  if (req.method === 'GET') {
    return res.status(200).json({ status: "API Ativa", modelo: "gemini-2.5-flash" });
  }

  if (req.method === 'POST') {
    const { description, productName } = req.body;

    try {
      // Atualizado para v1 estável e modelo gemini-2.5-flash
      const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Você é um assistente técnico para arquitetos. 
              Extraia os dados técnicos do produto: ${productName}. 
              Baseie-se nesta descrição: ${description}. 
              Retorne APENAS tópicos curtos de: Dimensões, Materiais, Acabamentos e Cores. 
              Seja direto e não use linguagem de marketing.` 
            }] 
          }],
          generationConfig: {
            temperature: 0.1, // Menor temperatura = resposta mais técnica e precisa
            maxOutputTokens: 800
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        return res.status(data.error.code || 500).json({ error: 'Erro no Gemini', details: data.error.message });
      }

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return res.status(200).json({ summary: data.candidates[0].content.parts[0].text });
      }

      return res.status(500).json({ error: 'Resposta da IA em formato inesperado.' });

    } catch (err) {
      return res.status(500).json({ error: 'Falha na conexão com a IA', message: err.message });
    }
  }
}

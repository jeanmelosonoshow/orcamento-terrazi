export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey = process.env.GEMINI_API_KEY;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { description, productName } = req.body;

  try {
    // Usando a versão v1beta e o modelo 2.0-flash que apareceu na sua lista
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Extraia dados técnicos (Dimensões, Materiais e Diferenciais) do produto abaixo em tópicos curtos. 
            Produto: ${productName}
            Descrição: ${description}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      // Se der erro de cota novamente, saberemos aqui
      return res.status(data.error.code || 500).json({ 
        summary: `Erro Google: ${data.error.message}`,
        details: data.error
      });
    }

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({ summary: data.candidates[0].content.parts[0].text });
    } 

    return res.status(200).json({ summary: "IA não retornou texto.", raw: data });

  } catch (err) {
    return res.status(500).json({ summary: `Erro conexão: ${err.message}` });
  }
}

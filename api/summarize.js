export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey = process.env.GEMINI_API_KEY;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { description, productName } = req.body;

  // Se a descrição vier vazia aqui, o problema é no script.js
  if (!description || description.length < 5) {
      return res.status(200).json({ summary: "ERRO: A descrição chegou vazia na API. Verifique o get-products." });
  }

  try {
    // Mude de 2.5-flash para 1.5-flash
    const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Extraia APENAS dados técnicos (Dimensões, Materiais e Diferenciais) do produto abaixo em tópicos curtos. 
            Ignore textos de marketing. Se não houver dados técnicos, responda 'Sem dados'.
            
            Produto: ${productName}
            Descrição: ${description}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500
        },
        // Desativa todos os filtros que costumam dar falso-positivo em móveis
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await response.json();

    // Diagnóstico: Se o Google der erro
    if (data.error) {
      return res.status(500).json({ summary: `Erro Google: ${data.error.message}` });
    }

    // Diagnóstico: Se a IA bloquear a resposta por "Safety"
    if (data.candidates && data.candidates[0].finishReason === "SAFETY") {
        return res.status(200).json({ summary: "Bloqueado pelo filtro de segurança do Google." });
    }

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return res.status(200).json({ summary: data.candidates[0].content.parts[0].text });
    } 

    return res.status(200).json({ summary: "A IA não conseguiu processar este texto.", debug: data });

  } catch (err) {
    return res.status(500).json({ summary: `Erro conexão: ${err.message}` });
  }
}

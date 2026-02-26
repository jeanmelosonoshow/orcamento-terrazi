export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { description, productName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada na Vercel' });
  }

  const prompt = `
    Você é um especialista em especificações técnicas para arquitetos.
    Produto: ${productName}
    Descrição: ${description}
    Resuma em tópicos técnicos (Dimensões, Materiais, Acabamentos). Seja minimalista.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    // Verificação de segurança para evitar o "undefined"
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const aiText = data.candidates[0].content.parts[0].text;
      res.status(200).json({ summary: aiText });
    } else {
      console.error("Resposta inesperada da IA:", data);
      res.status(500).json({ error: 'A IA não devolveu um formato válido', details: data });
    }

  } catch (error) {
    res.status(500).json({ error: 'Erro ao chamar Gemini', message: error.message });
  }
}

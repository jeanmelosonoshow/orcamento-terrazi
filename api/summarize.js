export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { description, productName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  const prompt = `
    Você é um especialista em especificações técnicas para arquitetos e designers de interiores.
    Sua tarefa é ler a descrição de um produto de e-commerce e transformá-la em um "Briefing Técnico" elegante e minimalista.
    
    Produto: ${productName}
    Descrição Bruta: ${description}

    REGRAS:
    1. Seja objetivo e profissional.
    2. Extraia: Dimensões (altura, largura, profundidade), Materiais, Acabamentos e Cores.
    3. Se houver detalhes sobre voltagem ou instalação, inclua de forma concisa.
    4. Formate a resposta em tópicos (bullet points) curtos.
    5. Não use frases de marketing como "O melhor produto para sua casa".
    6. Se a descrição for pobre, apenas liste os dados técnicos encontrados.
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
    
    // Extraindo o texto gerado pela IA
    const aiText = data.candidates[0].content.parts[0].text;

    res.status(200).json({ summary: aiText });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar resumo de IA', details: error.message });
  }
}

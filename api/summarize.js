export default async function handler(req, res) {
  // Isso garante que o navegador saiba que é um dado técnico e não uma página
  res.setHeader('Content-Type', 'application/json');
  
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ 
        erro: "Chave não encontrada", 
        dica: "Verifique se a variável GEMINI_API_KEY foi adicionada no painel da Vercel e se você fez um novo Deploy depois disso." 
    });
  }

  // Se for GET (navegador), lista os modelos
  if (req.method === 'GET') {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ erro: err.message });
    }
  }

  // Se for POST (botão do site), faz o resumo
  if (req.method === 'POST') {
    const { description, productName } = req.body;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Resumo técnico para arquitetos: ${productName}. Descrição: ${description}` }] }]
        })
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erro no formato";
      return res.status(200).json({ summary: text });
    } catch (err) {
      return res.status(500).json({ erro: err.message });
    }
  }
}

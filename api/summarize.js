export default async function handler(req, res) {
  // Forçar cabeçalhos de JSON para evitar que o navegador interprete errado
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { description, productName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // Log para você ver no painel da Vercel se os dados estão chegando
  console.log("Recebido para resumo:", productName);

  if (!apiKey) {
    return res.status(500).json({ error: 'Erro: Variável GEMINI_API_KEY não encontrada no sistema.' });
  }

  try {
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Resuma tecnicamente para arquitetos (dimensões, materiais, cores) em tópicos: Produto: ${productName}. Descrição: ${description}` }] }]
      })
    });

    const data = await response.json();

    // Se o Google devolver erro (ex: chave inválida), ele vem dentro do JSON
    if (data.error) {
      console.error("Erro retornado pelo Google:", data.error);
      return res.status(data.error.code || 500).json({ 
        error: 'O Google Gemini recusou a chamada.', 
        details: data.error.message 
      });
    }

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const aiText = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ summary: aiText });
    } 

    return res.status(500).json({ error: 'IA respondeu mas o formato é desconhecido.', raw: data });

  } catch (err) {
    console.error("Erro na execução da função:", err);
    return res.status(500).json({ error: 'Falha crítica na função summarize', message: err.message });
  }
}

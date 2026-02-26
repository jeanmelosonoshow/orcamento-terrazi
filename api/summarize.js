export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Variável GEMINI_API_KEY não configurada na Vercel.' });
  }

  // --- FUNÇÃO DE DIAGNÓSTICO (GET) ---
  // Se você acessar orcamento.vercel.app/api/summarize direto no navegador
  if (req.method === 'GET') {
    try {
      const listURL = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
      const response = await fetch(listURL);
      const data = await response.json();
      
      return res.status(200).json({
        message: "Lista de modelos liberados para o seu Token",
        models: data.models ? data.models.map(m => m.name) : data
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao listar modelos', details: err.message });
    }
  }

  // --- FUNÇÃO DE RESUMO (POST) ---
  if (req.method === 'POST') {
    const { description, productName } = req.body;

    try {
      // Tentando a versão estável v1
      const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Produto: ${productName}. Descrição: ${description}. Instrução: Resumo técnico para arquitetos (medidas, material, cor) em tópicos.` 
            }] 
          }]
        })
      });

      const data = await response.json();

      if (data.error) {
        return res.status(data.error.code || 500).json({ error: 'Erro no Gemini', details: data.error });
      }

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return res.status(200).json({ summary: data.candidates[0].content.parts[0].text });
      }

      return res.status(500).json({ error: 'Formato de resposta inesperado', raw: data });

    } catch (err) {
      return res.status(500).json({ error: 'Falha na execução', message: err.message });
    }
  }
}

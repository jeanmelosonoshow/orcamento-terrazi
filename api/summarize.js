export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const apiKey = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') {
    return res.status(200).json({ status: "Online", model: "gemini-2.5-flash" });
  }

  if (req.method !== 'POST') return res.status(405).send();

  const { description, productName } = req.body;

  try {
    // Usando o endpoint oficial v1 com o modelo da sua lista
    const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Você é um assistente técnico especializado em mobiliário de alto padrão para arquitetos. 
            Sua tarefa é ler a descrição de um produto e extrair apenas os dados técnicos reais.
                  
                  PRODUTO: ${productName}
                  DESCRIÇÃO: ${description}
                  
                  INSTRUÇÕES:
                  1. Retorne os dados em tópicos (bullet points).
                  2. Foque exclusivamente em:
                     - Dimensões (Largura, Profundidade, Altura).
                     - Materiais (ex: Madeira Maciça, MDF, Metal).
                     - Acabamentos/Diferenciais (ex: Corrediça telescópica, Fecho toque).
                  3. Se encontrar informações de "Características" e "Dimensões" na descrição, priorize-as.
                  4. NÃO inclua textos de marketing ou frases como "levar sofisticação para sua casa".
                  5. Responda apenas com os tópicos técnicos.`
          }]
        }],
        // Configurações para garantir que ele responda de forma mais solta e técnica
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        },
        // Desativando filtros que podem causar o bloqueio da resposta técnica
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await response.json();

    // Log de segurança para você ver no painel da Vercel
    console.log("Resposta completa do Gemini:", JSON.stringify(data));

    // A estrutura de resposta dos modelos 2.x costuma ser esta:
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const aiText = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ summary: aiText });
    } 
    
    // Se cair aqui, a IA bloqueou por algum motivo de segurança ou falta de dados
    return res.status(200).json({ 
      summary: "Informação técnica indisponível na descrição original. Por favor, preencha manualmente." 
    });

  } catch (err) {
    console.error("Erro na summarize:", err);
    return res.status(500).json({ error: "Erro interno", details: err.message });
  }
}

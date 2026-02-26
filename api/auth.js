export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Aguardando código de autorização...");
  }

  try {
    const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.NUVEMSHOP_CLIENT_ID,
        client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
      }),
    });

    const data = await response.json();

    // Este é o Token que você vai usar para buscar os produtos!
    // DICA: Salve esse 'access_token' e o 'user_id' (Store ID)
    res.status(200).json({
      status: "Sucesso!",
      access_token: data.access_token,
      store_id: data.user_id,
      scope: data.scope
    });

  } catch (error) {
    res.status(500).json({ error: "Erro ao gerar token: " + error.message });
  }
}

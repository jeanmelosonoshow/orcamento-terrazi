export default async function handler(req, res) {
  const { code } = req.query; // A Nuvemshop envia ?code=...

  if (!code) {
    return res.status(400).send("Código não encontrado.");
  }

  try {
    // 1. Aqui fazemos a troca do CODE pelo TOKEN
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

    // 2. O 'data.access_token' é o que você vai salvar na Vercel!
    console.log("Seu Access Token é:", data.access_token);

    res.status(200).json({ 
      message: "Sucesso!", 
      token: data.access_token,
      store_id: data.user_id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

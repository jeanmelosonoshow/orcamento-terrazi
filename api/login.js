import { db } from '@vercel/postgres';

export default async function handler(req, res) {
  // Apenas aceita requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { usuario, senha } = req.body;

  // Validação básica
  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const client = await db.connect();

  try {
    // Consulta o funcionário pelo "login" ou "usuario" (ajuste o nome da coluna se necessário)
    // Supondo que a sua tabela de funcionários tenha: idfuncionario, nomefuncionario, senha, categoria, idfilial
    const { rows } = await client.query(
      'SELECT idfuncionario, nomefuncionario, categoria, idfilial FROM funcionarios WHERE login = $1 AND senha = $2',
      [usuario, senha]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const usuarioEncontrado = rows[0];

    // Retorna os dados para o frontend salvar no sessionStorage
    return res.status(200).json(usuarioEncontrado);

  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  } finally {
    client.release();
  }
}

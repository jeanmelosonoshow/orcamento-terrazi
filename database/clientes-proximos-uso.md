# Clientes proximos da filial

## Como ativar

Inclua esta diretiva em qualquer lugar do SQL do relatorio de tabela:

```sql
/* filtro: clientes_proximos */
```

A consulta precisa retornar `CEP`, `CIDADE` e `BAIRRO`. O raio padrao e 30 km.

Para personalizar:

```sql
/* filtro: clientes_proximos | campo_cep: "CEP CLIENTE" | raio_km: 40 */
```

## Colunas adicionadas

Depois do filtro, o motor acrescenta:

- `DISTANCIA_KM`: distancia aproximada ate a filial mais proxima.
- `IDFILIAL_PROXIMA`: codigo da filial considerada.
- `FILIAL_PROXIMA`: nome da filial considerada.

Essas colunas podem ser escolhidas normalmente em **Colunas exibidas**. Exemplo:

```text
NOME,
BAIRRO,
CIDADE,
DISTANCIA_KM AS "DISTANCIA (KM)",
FILIAL_PROXIMA AS "FILIAL MAIS PROXIMA"
```

## Regras de acesso

- Diretor: filiais selecionadas no filtro; com **Todas**, considera todas.
- Supervisor: somente filiais sob sua supervisao, respeitando a selecao visivel.
- Gerente, vendedor e caixa: filial vinculada ao funcionario autenticado.

Quando mais de uma filial estiver disponivel, cada cliente e comparado com todas e fica associado a mais proxima.

## Precisao e desempenho

O calculo usa a formula de Haversine. Para evitar milhares de consultas externas, clientes do mesmo bairro e cidade compartilham uma coordenada aproximada. O CEP da filial e localizado individualmente.

As coordenadas ficam em `bi_geolocalizacao_cache` no PostgreSQL. Na primeira abertura de bairros ainda desconhecidos, o carregamento pode levar mais tempo; nas seguintes, o cache e reutilizado.

CEPs invalidos ou sem coordenadas nao entram silenciosamente no raio. O relatorio informa quantos clientes ou localidades nao puderam ser localizados.

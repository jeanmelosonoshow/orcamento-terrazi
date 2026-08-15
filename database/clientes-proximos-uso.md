# Clientes proximos da filial

## Como ativar

Inclua esta diretiva em qualquer lugar do SQL do relatorio principal de tabela ou da consulta de detalhe:

```sql
/* filtro: clientes_proximos */
```

A consulta precisa retornar `CEP`, `CIDADE` e `BAIRRO`. O raio padrao e 30 km.

Se o `RETURNS` declara `CEP`, a diretiva deve usar exatamente esse nome:

```sql
/* filtro: clientes_proximos | campo_cep: CEP | raio_km: 30 */
```

Nao use `campo_cep: "CEP CLIENTE"` a menos que a consulta realmente retorne uma coluna com esse alias.

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

No relatorio principal, use os botoes de seta na etapa de mapeamento para definir a ordem. Isso tambem permite intercalar campos enriquecidos do PostgreSQL, por exemplo colocar `CONTATO.STATUS_CONTATO` imediatamente depois de `NOME`.

As colunas criadas pelo motor aceitam as mesmas diretivas de icone. Como elas nao fazem parte do SQL Firebird, associe a diretiva por um comentario `AS`:

```sql
/* icon:fa-route | color:#175CD3 | background:#EAF2FF | size:18px | position:before */ /* AS DISTANCIA_KM */
/* icon:fa-store | color:#2E6F40 | background:#E9FBEF | size:18px | position:before */ /* AS FILIAL_PROXIMA */
```

Campos herdados do controle de contato tambem podem ser referenciados com ou sem o prefixo:

```sql
/* icon:fa-check-double | color:#123865 | position:before */ /* AS CONTATO.STATUS_CONTATO */
```

No relatorio principal, execute novamente o teste da consulta. Os campos acrescentados aparecerao na etapa de mapeamento e podem ser definidos como linha, valor ou ignorados.

## Regras de acesso

- Diretor: filiais selecionadas no filtro; com **Todas**, considera todas.
- Supervisor: somente filiais sob sua supervisao, respeitando a selecao visivel.
- Gerente, vendedor e caixa: filial vinculada ao funcionario autenticado.

Quando mais de uma filial estiver disponivel, cada cliente e comparado com todas e fica associado a mais proxima.

## Precisao e desempenho

O calculo usa a formula de Haversine. Para evitar milhares de consultas externas, clientes do mesmo bairro e cidade compartilham uma coordenada aproximada. O CEP da filial e localizado individualmente.

As coordenadas ficam em `bi_geolocalizacao_cache` no PostgreSQL. Na primeira abertura de bairros ainda desconhecidos, o carregamento pode levar mais tempo; nas seguintes, o cache e reutilizado.

Bases grandes sao tratadas em duas etapas. Primeiro o motor localiza as cidades e elimina as claramente distantes. Depois indexa ate 120 bairros novos por atualizacao. Os bairros restantes usam temporariamente a coordenada da cidade e entram automaticamente nas proximas atualizacoes, sem bloquear o relatorio. O tamanho do lote pode ser alterado pela variavel `BI_PROXIMITY_INDEX_BATCH`, entre 20 e 600.

O motor considera `RJ` como UF padrao, unificando bairros e cidades que aparecam com faixas diferentes de CEP. Filiais de outro estado nao entram no calculo e CEPs identificados fora do RJ sao sinalizados como inconsistentes. Para uma expansao futura, a UF pode ser alterada pela variavel `BI_PROXIMITY_UF`.

CEPs invalidos ou sem coordenadas nao entram silenciosamente no raio. O relatorio informa quantos clientes ou localidades nao puderam ser localizados.

-- Migração de estrutura do PostgreSQL de produção.
-- Execute com psql a partir da raiz do projeto, após gerar um backup.
-- Os arquivos chamados abaixo são os mesmos usados na homologação e foram
-- escritos para serem reaplicáveis (CREATE/ALTER ... IF NOT EXISTS).
\set ON_ERROR_STOP on

\echo '01/10 - Cenários do CRM'
\ir dashboard-scenarios.sql

\echo '02/10 - Negociação, saídas e contatos de orçamento'
\ir negociacao-orcamento.sql

\echo '03/10 - Controle de contatos'
\ir controle-contato.sql

\echo '04/10 - Arquitetos e vínculos com orçamentos'
\ir arquitetos.sql

\echo '05/10 - Pagamentos e fila de comissões'
\ir comissao-arquiteto.sql

\echo '06/10 - Fornecedores de arquitetos'
\ir fornecedor-arquiteto.sql

\echo '07/10 - Catálogo financeiro assinado'
\ir catalogo-financeiro.sql

\echo '08/10 - Operações financeiras PAGAR'
\ir pagar-catalogo-operacoes.sql

\echo '09/10 - Cache de geolocalização'
\ir clientes-proximos.sql

\echo '10/10 - Índice de acesso vendedor/orçamento'
\ir vendedor-orcamento-acesso.sql

\echo 'Migração concluída com sucesso.'

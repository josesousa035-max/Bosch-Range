# Changelog

## 3.0.0 — 2026-10-29

- Navegação principal em Planear, Os meus passeios, Evolução e A minha bicicleta; mapa/perfil e resultados ocupam a área principal, sem bloco promocional.
- Seleção bidirecional mapa ↔ altitude por aresta/fração, marcadores sincronizados, interpolação, pin, progresso por teclado/toque e escolha de passagem em sobreposições.
- Parser/preparação GPX em worker; cancelamento de importações obsoletas, índice espacial, desenho reduzido e preservação de cotas originais/intervalos sem dados.
- Planos versionados com snapshot imutável; resultados reais e revisões separados, duplicação, nova simulação ligada e eliminação confirmada.
- Erro previsto−observado em p.p., métricas/exclusões explícitas, calibração anterior preservada e limitada a previsões novas.
- Migração aditiva IndexedDB v3 e backup v2, com leitura de v1 e preservação de conflitos locais.
- Worker incluído no precache PWA e gerador Mac atualizado para 3.0.0. Sem alterações às equações físicas nem afirmação de validação empírica/DMG.


## 2.1.0 — 2026-10-27

- Biblioteca local GPX com deduplicação por geometria verificada, pesquisa, renomeação e variantes.
- Recuperação automática de percurso, parâmetros, etapas, rascunho, tema e modo avançado; estado de gravação e proteção contra entradas inválidas.
- Migração IndexedDB v1→v2 sem apagar stores existentes e aviso para janelas antigas que bloqueiem a atualização.
- Backup JSON completo versionado, pré-visualização, importação transacional, conflitos que preservam registos locais e reposição opcional de definições/sessão.
- Validação dos dados aninhados e teste de rollback perante falha de escrita; sem alterar as equações físicas.
- Service worker atualizado e gerador Mac com nome do DMG a partir da versão do projeto. A compilação nativa continua por validar no macOS.


## 2.0.0 — 2026-10-26

- Implementação independente sobre repositório que só continha README; sem acesso ao código Amflow original.
- Interface PT-PT com sete módulos, temas claro/escuro e parâmetros simples/avançados.
- Física segmentada, velocidade viável, modos aproximados, corte de assistência, energia utilizável, SOC/reserva e PowerMore combinado.
- GPX local validado, filtros conservadores, perfil, traçado sem cartografia, subidas e piso editável.
- Comparação de modos/condições e etapas com recargas hipotéticas.
- IndexedDB, snapshots de passeios, importação/exportação JSON, previsões guardadas e calibração regularizada com baseline/reposição.
- PWA de produção e testes matemáticos/GPX/persistência/E2E; resultados em docs/TEST_REPORT.md.
- Sem especificações oficiais falsamente confirmadas nem promessa de precisão empírica.

### Empacotamento macOS — preparado

- Wrapper Swift/AppKit/WKWebView, recursos locais e servidor estático limitado a loopback.
- Gerador Apple Silicon com ícone, assinatura ad hoc e criação/verificação de DMG em macOS.
- Variante desktop sem service worker e teste de browser dedicado.
- Compilação Swift, diálogos nativos e DMG continuam por executar num Mac; sem notarização nem publicação.

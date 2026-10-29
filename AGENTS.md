# Instruções persistentes — Bosch Range Lab

- Este repositório é uma implementação independente. Apenas README existia na auditoria; o código Amflow/ChatGPT Sites não está disponível. Não afirme ter auditado ou migrado esse código.
- Trabalhe no checkout existente. Cada tarefa cloud é isolada; não crie worktrees salvo pedido explícito.
- Interface e documentação em português de Portugal. Sem telemetria, autenticação obrigatória ou envio de GPX. Não publique código/dados sem autorização.
- Primeiro leia docs/ENERGY_MODEL.md e docs/BOSCH_SOURCES.md para alterações físicas. Mantenha cálculo em src/core, independente de React. Unidades explícitas.
- Não apresente os pressupostos Cube 2027 como especificações oficiais verificadas. Não presuma 120 Nm configurados, compatibilidade PowerMore ou curvas Bosch proprietárias.
- Conserve baseline e snapshot de cada atividade. Não use validação para escolher parâmetros. Calibração sintética não significa validação empírica.
- Não há regeneração. Mecânica e eletricidade são distintas. Energia restante é ≥0; procura pode exceder disponibilidade e tem de ser sinalizada. Velocidade pode exceder 25 km/h, mas assistência não.
- Entradas GPX/JSON são não confiáveis: limites de tamanho, coordenadas, segmentos, entidades XML e números finitos. Não injete HTML a partir de ficheiros.
- Instalar: `npm ci --cache /tmp/bosch-npm-cache` na cloud; `npm ci` no Mac. Node ≥22.12; lockfile versionado.
- Validar: `npm test`, `npm run build`, `npm run test:e2e`. E2E usa dist de produção e porta 4173; config escolhe /usr/bin/chromium ou browser Playwright. Para instalar browser: `npx playwright install chromium` se rede permitir.
- Reporte testes efetivamente executados, sem confundir suites sintéticas com dados de campo. Atualize docs/TEST_REPORT.md quando necessário.
- Service worker só em produção. Altere a versão CACHE em public/sw.js quando alterar recursos numa nova distribuição. Não dependa de processos vivos de tarefas anteriores.
- IndexedDB conserva atividades e histórico. Preserve importação idempotente por ID. Não destrua dados ao repor parâmetros.
- Mantenha acessibilidade por teclado, labels de campos, modo escuro e largura móvel de 390 px sem overflow global.

- Desde 2.1: IndexedDB schema v2, com migração aditiva e biblioteca routes. Nunca elimine stores para corrigir migrações bloqueadas.
- Backup completo em src/core/backup.ts (formato versionado), distinto do JSON legado de atividades. Restauro preserva conflitos locais e só substitui preferências/sessão por opção explícita. Valide antes de escrever e aborte toda a transação em falhas.
- Sessão/preferências são guardadas juntas; evite regressões em autosave durante restauros e não marque alterações novas como guardadas quando termina uma gravação antiga.
- Verificar a variante desktop: `npm run test:desktop-web`; depois `npm run build` para deixar dist no modo web/PWA. A suite desktop Chromium não verifica Swift/macOS.

- Desde 3.0: quatro áreas principais; schema IndexedDB v3 acrescenta journeys. Backup de escrita v2, leitura v1/v2; não perder revisões ou snapshots.
- Não recompute forecasts históricos. completeJourney/updateJourneyNotes só alteram resultado/notas; duplicação/nova simulação criam novo ID/parentId. Legados mantêm Wh originais; chegada reconstruída não é medição nem previsão historicamente guardada.
- TrackExplorer partilha seleção por aresta/fração; não associe arrays simplificados por índice. Respeite gaps e altitudes null/zero/negativas. Atualize range controlado de forma síncrona; hover pode usar RAF.
- Parsing/preparação em gpx.worker; qualquer async/IndexedDB posterior deve voltar a verificar o token de importação antes de atualizar a rota. Cache PWA tem de incluir o chunk do worker.
- Erro de chegada = previsto − observado (35−27=+8 p.p., otimista). Ausência de observação é null. Não misture p.p. com Wh ou inclua automaticamente registos incompatíveis.
- Autorizações de publicação são dadas pelo utilizador em cada tarefa; nunca altere visibilidade nem ative Pages como efeito implícito de um push de código.

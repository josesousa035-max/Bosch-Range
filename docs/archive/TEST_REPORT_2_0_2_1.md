# Relatório de testes — 26 de outubro de 2026

Ambiente efetivamente utilizado: Linux cloud, Node v24.19.0, npm 11.9.0, Vitest 3.2.7, Vite 7.3.7 e Chromium do sistema através de Playwright. Versões exatas das dependências no package-lock.json. O código original só continha README: não existia suite anterior para executar.

## Resultados executados

| Verificação | Resultado |
|---|---|
| Instalação inicial e reinstalação `npm ci --offline --cache /tmp/bosch-npm-cache --no-audit --no-fund` | 152 pacotes instalados; lockfile preservado |
| `npm test` | **40 testes passaram**, 3 ficheiros, zero falhas, zero skips |
| Física e bateria | 21 testes passaram |
| GPX, cotas, filtros e etapas | 11 testes passaram |
| IndexedDB, importação e calibração | 8 testes passaram |
| `npm run build` | TypeScript e bundle de produção passaram |
| `npm run test:e2e` | **5 testes passaram**, Chromium, 1 worker, zero skips |
| Dev server na porta 5173 | Arranque concluído; HTTP 200 e título Bosch Range Lab 2.0 verificado |
| `git diff --check` | Sem erros de whitespace nos ficheiros versionados alterados |
| Consulta oficial Cube/Bosch | Bloqueada: HTTP 403 no túnel de rede; conteúdo não verificado |
| `npm audit --omit=dev` | Bloqueado: endpoint de advisories HTTP 403; não é uma auditoria de segurança concluída |
| Download Playwright Chromium | Bloqueado em cdn.playwright.dev; usado Chromium já instalado sem desativar verificações TLS |

A primeira instalação falhou por cache npm não gravável em /home/agent/.npm. Correção: cache em /tmp/bosch-npm-cache. Reinstalação pelo lockfile foi realizada; nenhum token/credencial foi necessário. A tentativa opcional de instalar um formatador foi bloqueada pela rede; não é dependência nem requisito da aplicação.

## Evidência física e regressão

- mgh: 100 kg elevados 100 m correspondem a **27,2406944 Wh mecânicos**.
- Rolamento em plano: 100 kg e Crr=0,01 produzem 9,80665 N.
- Arrasto com vento contrário e distinção de temperatura; força integrada na rampa coincide com mgh + rolamento + arrasto, sem dupla contagem.
- Soma das contribuições mecânicas humana e do motor igual à procura, distinção elétrica/mecânica e limite de eficiência efetiva de 98% após calibração.
- Redução de velocidade quando falta potência, rejeição de movimento inviável, corte aos 25 km/h e descida acima dessa velocidade sem assistência.
- Sem regeneração, SOC parcial, saúde/derating, reserva e esgotamento interpolados, energia restante não negativa e monotónica.
- PowerMore com SOC distinto e capacidade combinada; modos com condições controladas; determinismo e rejeição de NaN/Infinity/terreno herdado inválido/distância extrema.
- GPX com distância equatorial conhecida, subida/descida conhecidas, impulso altimétrico, ruído pequeno e subida prolongada preservada, cotas incompletas, namespace, rte, tracks descontínuos, segurança XML, importação repetida e conservação por etapas.
- Cotas absolutas de tracks separados não inventam subida entre tracks nem ligam o perfil sobre o intervalo omitido.
- IndexedDB grava/recupera preferências e snapshots. JSON repetido não duplica IDs; importação inválida não deixa gravações parciais.
- Calibração sintética: mínimo de dados, exclusão de SOC pouco discriminante, limites/regularização, separação treino/validação, melhoria de MAE/MAPE sintéticos e histórico de reposição.

Exemplo reproduzível de saída, **não medição real**: defaults + percurso manual 40 km/800 m/compactado → procura **282,984985 Wh**, duração **2,461501 h**, chegada **62,765134%**, restante **477,015015 Wh**. A UI arredonda; o perfil manual assume também 800 m de descida. Este exemplo é um registo de regressão, não evidência de precisão em campo.

## E2E de produção

1. Simulador manual, gravação de previsão, tabela Eco/Turbo e etapas; sem exceções JS durante esse percurso de UI.
2. Importação de fixtures/coastal-synthetic.gpx, **40 m de subida**, traçado e altimetria, edição de piso e reimportação sem duplicar segmentos.
3. Preferência de massa e passeio persistem após reload; exportação JSON; calibração permanece desativada com apenas um passeio de teste.
4. Smartphone 390×844 sem overflow global em dashboard/simulador; tema escuro a 1440 px. Screenshot local em test-results/dashboard-dark.png (na verdade o ecrã do simulador escuro).
5. Instalação real do service worker no preview; modo offline do browser, reload, cálculo manual e importação GPX sem ligação.

As primeiras execuções encontraram um filtro que removia uma pequena subida real e um valor aerodinâmico de referência impreciso; ambos corrigidos antes da passagem final. E2E detetou seletores que incluíam ícones decorativos: marcaram-se como aria-hidden e ajustou-se a seleção do estado local. A compilação inicial também detetou tipos de seleções e configuração Node no ficheiro Playwright; corrigidos, sem ignorar erros TypeScript ou desativar assertions.

## O que não foi validado

- Precisão preditiva em passeios reais: **zero atividades reais disponibilizadas**. Os passeios sintéticos e de UI não são calibração empírica.
- Especificações efetivas Cube 2027, potência/binário configurados, modos disponíveis e compatibilidade/montagem PowerMore.
- MacBook Air M2, Safari, iOS, Android físico e instalação PWA no sistema operativo; as instruções Mac são fornecidas, não execução comprovada nesse hardware.
- Cobertura probabilística das bandas de incerteza, mapas externos, FIT/TCX, integrações de contas, distribuição real dos modos, testes de carga em GPX no limite e validação assistiva completa.
- Publicação, distribuição pública ou restauração do snapshot numa nova tarefa: não executadas.

## Reprodução

Na raiz do checkout: `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`. No Mac descarregue antes o browser com `npx playwright install chromium` se necessário. Na cloud use a cache indicada acima. O E2E inicia/termina o seu preview na porta 4173; não execute outro servidor nessa porta durante a suite. Veja README para execução interativa.

## Aditamento — empacotamento Mac

- `bash -n scripts/build-macos.sh 'Criar instalador Mac.command'`: passou.
- Info.plist analisado por plistlib e identificadores/versão mínima/ícone verificados: passou.
- Gerador executado em Linux: rejeitou corretamente a plataforma com código 1 e mensagem explícita; não simulou a criação de um DMG.
- Após alterações de empacotamento, os 40 testes do núcleo e o build passaram.
- `npm run test:desktop-web`: **1 teste passou** em Chromium, com GPX, armazenamento persistente, zero service workers e zero pedidos externos no fluxo testado.
- O teste anterior valida somente os recursos web compilados para desktop. Compilação Swift, arranque WKWebView, seleção/download nativos, ícone ICNS, codesign e hdiutil **não executados**, por ausência de macOS/SDK Apple.
- A versão nativa tem origem/armazenamento próprios e não importa automaticamente dados do browser. O instalador não está assinado com Developer ID nem notarizado.

## Versão 2.1 — 27 de outubro de 2026

Implementação de continuidade dos dados, sem alterar src/core/model.ts ou as equações físicas.

| Comando/verificação executada | Resultado |
|---|---|
| `npm test` | **54 passaram**, 5 ficheiros: 21 físicos, 11 GPX, 8 armazenamento/calibração, 13 biblioteca/backup, 1 migração v1→v2 |
| `npm run build` | TypeScript e bundle passaram antes da tentativa final de reinstalação |
| `npm run test:e2e` | **8 passaram**, incluindo os 5 anteriores e 3 novos cenários de biblioteca/backup |
| `npm run test:desktop-web` | **1 passou**, incluindo GPX, recuperação da sessão, persistência, exportação do backup, ausência de service worker e de pedidos externos |
| Scripts macOS e Info.plist | Sintaxe bash validada; versão de bundle 2.1.0; criação nativa não executada |
| Reinstalação final `npm ci --offline` | Falhou: cache /tmp já não continha tarballs necessários (`ENOTCACHED`) |
| Reinstalação normal / acesso HTTPS ao registo | Bloqueados pela política de rede atual: registry.npmjs.org respondeu 403 no túnel; não se desativaram TLS ou checksums |

Os resultados de testes acima foram obtidos **antes** da tentativa de reinstalação. A reinstalação removeu as dependências anteriores e ficou bloqueada; por isso a execução futura de Vitest/Vite nesta máquina requer repor o acesso ao registo e executar npm ci. Não se afirma que uma reinstalação limpa final passou. A configuração lida nesta fase tinha apenas Cube/Bosch, sem presets de package managers. Foi guardada no rascunho a adição de registry.npmjs.org, preservando esses dois domínios; guardar o rascunho não aplica nem publica a política.

Para não deixar a aplicação dependente dessa instalação, adicionou-se `scripts/preview-built.mjs`, que serve o bundle já compilado usando apenas Node. Verificou-se sintaxe com `node --check`, arranque e seis respostas HTTP: GET 200, HEAD 200 sem corpo, traversal codificado 403, POST 405, recurso inexistente 404 e Host indevido 403. Este preview é limitado a 127.0.0.1; não substitui o servidor de desenvolvimento.

Depois do bloqueio, uma verificação independente no Chromium de sistema, controlado diretamente por CDP/WebSocket nativo do Node (sem módulos npm), confirmou no **build desktop incluído**: importação GPX, alteração do piso, recuperação após reload, exportação do backup completo, restauro numa segunda instância de browser com perfil isolado e ausência de service worker. Todos esses controlos passaram. Esta é uma verificação adicional do build existente, não uma nova execução da suite Playwright nem uma recompilação de produção.

### O que os novos testes verificaram

- Migração real desde um banco v1 com preferências, previsões e registo legado; nenhum store antigo foi apagado.
- Deduplicação com nomes e ordem de propriedades diferentes; resolução de colisão de índice sem substituir outra geometria.
- Renomeação e remoção da biblioteca sem apagar sessão ou snapshots de passeios.
- Sessão inválida não reescreve parâmetros/sessão válidos.
- Round-trip de todos os grupos, importação repetida e conflitos que preservam snapshots locais.
- Reposição de definições/sessão só por opção explícita.
- Dados aninhados inválidos, IDs repetidos, versão futura, tamanho excessivo e sobreposição treino/validação rejeitados.
- Falha de escrita simulada na segunda parte do restauro aborta também a atividade que já tinha sido inserida na mesma transação. É teste de rollback, não uma medição de quota real.
- Browser: biblioteca com pesquisa, renomeação, variantes de piso, reload sem ligação, largura móvel e transferência entre dois contextos independentes sem apagar passeio do destino.

### Continua por validar

Compilação/instalação DMG, Swift/WKWebView e Safari reais; limites máximos de desempenho/quota; reinstalação npm nesta cloud após aplicação da política; especificações oficiais do hardware e precisão energética em passeios reais. O backup não é encriptado nem sincronização automática entre dispositivos. Fecho forçado pode interromper gravações pendentes: aguardar “Sessão guardada”.

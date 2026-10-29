# Relatório de testes — Bosch Range Lab 3.0

**Execução: 29 de outubro de 2026.** Linux cloud, Node v24.19.0, npm 11.9.0, Vitest 3.2.7, Vite 7.3.7 e Chromium instalado no sistema. Versões exatas no package-lock.json. Os relatórios 2.0/2.1 ficam preservados em [arquivo](archive/TEST_REPORT_2_0_2_1.md).

## Resultados finais efetivamente executados

| Verificação | Resultado |
|---|---|
| `npm ci --cache /tmp/bosch-npm-cache --no-audit --no-fund` | **Passou**, 163 pacotes instalados numa reinstalação limpa pelo lockfile |
| `npm test` | **74 passaram**, 7 ficheiros, zero falhas/skips |
| `npm run build` | **Passou**, TypeScript strict e bundle Vite de produção |
| `npm run test:e2e` | **9 passaram**, Chromium, 1 worker, zero skips, cerca de 25 s nesta execução |
| `npm run test:desktop-web` | **1 passou**, bundle desktop sem service worker, fluxo GPX→plano→resultado; não é teste do wrapper macOS |
| `npm run build` após desktop | **Passou**, dist deixado na variante web/PWA |
| `npm audit --omit=dev --audit-level=moderate` | **0 vulnerabilidades conhecidas reportadas** nas dependências de produção; não equivale a auditoria completa |
| `bash -n scripts/build-macos.sh 'Criar instalador Mac.command'` | **Passou**, sintaxe apenas |
| `git diff --check` | Sem erros de whitespace nos ficheiros verificados |

Não havia comando de lint dedicado no projeto. A tipagem foi verificada pelo build; Prettier foi usado como ferramenta de formatação, sem o apresentar como análise funcional. A rede npm que bloqueou a entrega 2.1 já permitiu a instalação nesta sessão; não foi necessário desativar TLS, assinaturas ou checksums.

## Testes unitários e integração

- **21 físicos:** mgh, forças/arrasto, energia elétrica vs mecânica, conservação, corte de assistência, velocidade viável, ausência de regeneração, capacidade/SOC/reserva/PowerMore, determinismo e entradas inválidas. Equações anteriores preservadas.
- **12 GPX:** distância/subida/descida conhecidas, ruído/impulso, cotas incompletas, namespaces, rte, tracks separados, XML/coordenadas inválidos, reimportação e etapas. Coordenadas exigem atributos GPX, não elementos arbitrários com os mesmos nomes.
- **9 explorador:** tolerância de 1 cm para distância/interpolação, zero/cotas negativas, nulls, ausência de ligação entre tracks, circuitos, sobreposições, energia compatível, cota original/processada e 30 000 pontos. Foi acrescentada verificação de que a continuidade não puxa a seleção para segmentos vizinhos errados numa linha muito densa.
- **10 passeios:** snapshot independente, revisões de resultados, duplicação, 35−27=+8 p.p., resultado ausente, exclusões, Wh aproximados/medidos, percentagens, backup v2/v1 e migração idempotente de atividades legadas, incluindo eliminação sem reaparecer.
- **13 backup/biblioteca:** round-trip, conflitos/duplicados, opções de restauro, dados inválidos, tamanho, transação e rollback perante falha de escrita simulada.
- **8 armazenamento/calibração:** persistência, importação legada, limites/regularização, separação treino/validação e reposição histórica.
- **1 migração estrutural:** IndexedDB v1→v3 preserva stores e registos existentes.

## Browser: 9 cenários

1. Manual→Guardar plano→reload→resultado→alterar capacidade→reabrir previsão original; duplicação e Evolução. Sem exceções JavaScript nesse fluxo.
2. Dados manuais inválidos impedem guardar; GPX inválido mantém o percurso anterior.
3. Fluxo completo a **390×844**, contexto com toque: perfil, mapa, teclado/range, plano e conclusão. Sem overflow global.
4. A/B, etapas, massa/preferências e modo escuro persistem.
5. Mapa↔perfil, fixação, libertação, zoom e Home/End partilham distância e não recentram.
6. Sem elevação não aparece zero inventado; sobreposição oferece seleção explícita de outra passagem.
7. Backup v2 entre dois contextos de browser isolados, preservando plano local, observação real e preferências até opção explícita de substituição.
8. PWA: instalação, rede desligada, primeira importação GPX offline usando o worker precached e reabertura com seleção disponível.
9. **50 000 pontos:** navegação durante processamento, exploração sem aumentar o contador local `bosch-range:simulate` e corrida entre importação grande antiga e pequena nova. O cenário completo demorou cerca de 5 s nesta máquina; isto não é um SLA para outros equipamentos.

A variante desktop foi testada adicionalmente em Chromium, com o service worker desativado e zero pedidos externos no fluxo verificado.

## Falhas encontradas e corrigidas

- O range controlado com estado adiado por RAF podia repor o valor antigo durante Home/End. Passou a atualizar a seleção de forma síncrona no slider; hover mantém RAF.
- Um seletor de teste capturava o valor de um marcador antes da atualização do frame. A verificação passou a aguardar igualdade dinâmica dos dois marcadores.
- A automação tentava clicar num ponto fora da viewport; passou a enquadrar o SVG antes da interação. As assertions foram preservadas.
- A correspondência densa passou a comparar mínimos locais ao longo do traçado, distinguindo segmentos adjacentes de passagens sobrepostas.
- A nova versão de schema exigiu atualizar a expectativa da migração de v2 para v3, mantendo as verificações de dados preservados.
- O precache inicial não incluía automaticamente o worker. A instalação passou a incluir o chunk do worker, validado no teste offline.

## Limitações e verificações não executadas

- **Swift/AppKit/WKWebView, DMG, instalação/notarização Apple e Safari/macOS real não foram executados em Linux.** A emulação móvel Chromium não é um iPhone/Android físico.
- Não há passeios reais suficientes nem validação empírica da precisão, cobertura estatística dos intervalos ou avaliação externa do modelo. Exemplos de testes não são medições reais nem dados seed da aplicação.
- Configuração efetiva Cube 2027, binário/potência e compatibilidade PowerMore continuam por confirmar oficialmente.
- O mapa é um traçado geográfico offline, sem tiles/cartografia/navegação de fundo. Não se fez benchmark de todos os GPX, antimeridiano ou memória/quota máximas de smartphones.
- O teste de falha de escrita é simulado; não se esgotou deliberadamente o disco do utilizador. Encerramento forçado pode interromper gravações pendentes.
- Publicação de código no GitHub é separada de implantação de um site. Não foram alteradas visibilidade nem configurações de Pages. O commit remoto é confirmado pelo fluxo de entrega, não por este relatório de execução local.

## Reproduzir

```sh
npm ci
npm test
npm run build
npm run test:e2e
npm run test:desktop-web
npm run build
```

E2E necessita Chromium (`npx playwright install chromium` no Mac, ou CHROMIUM_PATH). Evite servidores já ativos nas portas 4173/4174. Fixtures GPX e dados dos testes são sintéticos e identificados; nenhum passeio pessoal é publicado.

# Bosch Range Lab 3.0

Planeador independente de autonomia e-MTB, em português de Portugal, com exploração GPX sincronizada, previsões físicas e comparação com passeios reais. Perfil inicial Cube Stereo Hybrid ONE44 HPC SLX 800, bateria **800 Wh nominais**. Sem conta, telemetria, serviços pagos ou envio de percursos.

**Limites:** as curvas de assistência e eficiência são aproximações, não firmware Bosch. A configuração Cube 2027 e a compatibilidade PowerMore continuam por confirmar oficialmente. Não existe validação de precisão em campo nem garantia de concluir um percurso com a energia prevista.

## Arrancar no MacBook Air M2 ou na cloud

Instale Node.js **24 LTS** (mínimo 22.12). Na pasta do projeto:

```sh
npm ci
npm run dev
```

Abra o endereço apresentado no Terminal. Na cloud, se a cache predefinida não for gravável, use `npm ci --cache /tmp/bosch-npm-cache`. O registo `registry.npmjs.org` tem de estar permitido para instalar dependências.

Produção/PWA:

```sh
npm run build
npm run preview
```

A primeira abertura online instala os recursos, incluindo o worker GPX. Depois, a importação, cálculo, consulta e persistência podem funcionar sem Internet. O modo dev não instala o service worker. Os dados pertencem à origem/browser: mudar porta ou passar para WKWebView não os transfere automaticamente.

## Fluxo completo

1. **Planear:** importe um GPX local ou introduza distância/subida manualmente. Ajuste condições, assistência, potência humana disponível, carga e reserva.
2. Explore o mapa e o perfil. A previsão atualiza-se com os parâmetros; entradas inválidas mostram erro e impedem guardar.
3. Introduza nome/data e escolha **Guardar plano**. Ficam guardados o percurso, parâmetros, capacidades estimadas, previsão e versões. Esta cópia não é recalculada quando mudar a bicicleta ou a calibração.
4. Depois da volta, abra **Os meus passeios**, procure o registo e escolha **Registar resultado**. Introduza carga final observada, distância real, assistência usada e eventuais recargas/trocas/alterações de condições.
5. Consulte previsão e observação lado a lado. O erro é **previsto − observado**, em pontos percentuais: **35% − 27% = +8 p.p.**, previsão otimista.
6. **Evolução:** quantidade de resultados comparáveis, erro absoluto médio em p.p., tendência e motivos de exclusão. Registos planeados não equivalem a consumo zero.
7. **A minha bicicleta:** massas, bateria, pneus/rolamento, parâmetros físicos avançados, PowerMore opcional, backup e preferências.

Em Planear, a comparação A/B, cenários, biblioteca, etapas e pisos por segmento ficam em secções expansíveis. A configuração simples mantém as escolhas frequentes acessíveis. Os pneus/pressão continuam representados por um fator de rolamento aproximado, não por uma fórmula universal inventada.

## Mapa ↔ altitude

O mapa é um **traçado geográfico local sem cartografia de fundo**: não necessita de tiles nem envia coordenadas. Não é um navegador de orientação no terreno.

- Desktop: mova o ponteiro junto da linha ou sobre o perfil. Clique para fixar; **Libertar seleção** volta ao hover.
- Telemóvel: toque na linha; toque/arraste no perfil ou na barra de progresso.
- Teclado: foque **Posição no percurso** e use setas/Home/End. O mesmo segmento e a mesma fração controlam os dois marcadores.
- Zoom e deslocação são explícitos; mover a seleção não recentra o mapa.
- Em sobreposições, mantém-se a continuidade da seleção; os botões de quilómetros permitem escolher outra passagem.
- O painel mostra distância, **altitude processada**, original quando diferente, indicação de interpolação e **bateria prevista**, apenas com uma curva compatível.
- Zero e cotas negativas são válidos. Altitude ausente aparece como indisponível; o perfil mantém lacunas e não liga tracks separados.

A importação/preparação corre num Web Worker. A geometria completa é indexada uma vez; o desenho é reduzido mantendo referências aos dados completos. Hover não analisa novamente o GPX nem executa o modelo energético. Limites: 12 MB e 100 000 pontos. Ver [método e decisões](docs/GPX_EXPLORER.md).

## Histórico, versões e backup

Planos têm estados **Planeado** e **Concluído**, pesquisa, filtros e ordenação. Pode editar notas/resultados, duplicar e eliminar com confirmação. Cada alteração de resultado guarda uma revisão; não muda o snapshot previsto. **Simular novamente** cria uma nova simulação ligada à anterior quando guardar.

A migração IndexedDB v1/v2→v3 é aditiva. Atividades 2.1 são preservadas no store original e migradas uma vez. Nos registos antigos só se preservam como originais os valores efetivamente existentes: a chegada reconstituída é identificada e excluída das métricas em p.p.; não se inventa uma curva energética antiga.

Em A minha bicicleta, **Exportar backup completo** inclui planos, resultados, revisões, rotas, dados anteriores, calibração, definições e sessão. O formato v2 aceita também backups v1. Pré-visualização e validação antecedem o restauro; IDs existentes preservam dados locais, sem sobrescrita silenciosa. Repor definições/sessão é uma opção explícita. Até 50 MB por ficheiro.

**O backup contém coordenadas/dados pessoais e não é encriptado.** Guarde-o num local privado. Limpar dados do browser ou usar modo privado pode apagar IndexedDB. Aguarde **Sessão guardada** antes de fechar; o autosave não garante sobreviver a um encerramento forçado. Consulte [formato e política](docs/DATA_AND_BACKUPS.md).

## Testar

```sh
npm test
npm run build
npm run test:e2e
npm run test:desktop-web
npm run build
```

Playwright usa `/usr/bin/chromium` na cloud quando disponível. No Mac, instale o browser com `npx playwright install chromium`; pode definir `CHROMIUM_PATH`. E2E usa preview nas portas 4173/4174 e deve correr sem outro servidor nessas portas. `test:desktop-web` verifica o bundle sem service worker em Chromium, **não Swift/WKWebView macOS**. [Relatório de resultados executados](docs/TEST_REPORT.md).

## Aplicação Mac e DMG

Com Apple Command Line Tools (`xcode-select --install`) e Node instalados, execute **Criar instalador Mac.command** ou `npm run package:mac`. Resultado esperado: `release/Bosch-Range-Lab-3.0.0-Apple-Silicon.dmg`. macOS 13+, Apple Silicon/M2.

O wrapper e o gerador estão incluídos; **a compilação Swift, o DMG e os diálogos nativos ainda não foram testados em macOS**. Assinatura ad hoc, sem Developer ID/notarização. Não desative as proteções do Mac. [Instruções](docs/MACOS_DMG.md).

`node scripts/preview-built.mjs` abre um bundle já existente com apenas Node, sem instalar pacotes; não compila código. As versões compiladas são geradas com `npm run build` e não são versionadas no Git.

## Documentação

[Arquitetura](docs/ARCHITECTURE.md) · [Modelo físico](docs/ENERGY_MODEL.md) · [GPX e seleção](docs/GPX_EXPLORER.md) · [Planos e resultados](docs/JOURNEYS.md) · [Fontes](docs/BOSCH_SOURCES.md) · [Calibração](docs/CALIBRATION.md) · [Testes](docs/TEST_REPORT.md) · [Changelog](CHANGELOG.md).

Não existe código Amflow/ChatGPT Sites neste repositório; a auditoria inicial está em docs/AUDIT.md. Esta implementação é independente e não tem afiliação à Bosch ou Cube. Não se implementaram integrações privadas Flow/Kiox/Komoot, FIT/TCX, treino de rede neuronal, navegação por mapas de fundo ou infraestrutura externa.

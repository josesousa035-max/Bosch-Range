# Fases e evolução

## Fase 0 — Auditoria

Concluída no material disponível: checkout main com commit inicial e apenas README. Sem framework, dependências, testes, algoritmos ou referências Amflow a migrar. Original ChatGPT Sites inacessível. README inicial preservado em docs/AUDIT.md. Verificação documental Cube/Bosch bloqueada pela rede; perfil identificado como fornecido e não confirmado.

## Fases 1–3 — Fundação, física e GPX

Implementadas: React/TypeScript/Vite, módulos físicos, bateria, corte de assistência, perfis aproximados dependentes do declive, redução de velocidade, GPX com validação e filtros, análise de cotas, subidas, segmentos e piso editável. Testes matemáticos e casos de regressão. Consulte TEST_REPORT para resultados executados.

## Fase 4 — Interface

Implementados sete módulos, temas claro/escuro, gráficos locais, traçado sem cartografia externa, cenários e divisão por distância em etapas com/sem recarga hipotética. Painel simples/avançado. Histórico de simulações e preferências locais.

## Fase 5 — Atividades e calibração

Implementados registo manual, GPX associado, importação/exportação JSON idempotente, snapshots, comparação original/observado, fator regularizado, reserva de validação e histórico/reposição. **Pendente validação quantitativa real**, dependente de passeios medidos suficientes. Distribuição de modos, FIT/TCX e edição detalhada de atividades ficam para evolução.

## Fase 6 — Qualidade e distribuição

Build de produção, testes unitários/integração e E2E, service worker, documentação e execução em Mac. Resultados exatos em docs/TEST_REPORT.md. Nada publicado automaticamente.

## Próximos trabalhos com evidência necessária

- Confirmar ficha oficial Cube 2027, massa medida, configuração e modos disponíveis; compatibilidade PowerMore com fabricante.
- Recolher passeios medidos variados, incluindo potência humana e condições; avaliar erros em amostra independente e substituir bandas heurísticas por cobertura medida.
- Testar Safari/macOS/iOS e instalação PWA física; teste de campo, acessibilidade assistiva e percursos muito extensos.
- Limites de binário/cadência e eficiência por ponto de operação apenas com dados sustentáveis.
- Melhorar filtros com corpus de GPX real e benchmarks; mapa de fundo opcional sem envio de percursos.
- Eventual extração de ecrãs React para módulos menores à medida que evoluem.


## Versão 2.1 — continuidade e proteção dos dados

Implementadas biblioteca GPX com variantes/deduplicação, recuperação de sessão e backup completo transferível com restauro validado e sem substituir conflitos locais. Migração aditiva de armazenamento. Os resultados efetivos estão no aditamento 2.1 do relatório de testes. Próxima melhoria de precisão depende de observações reais: não substituir a recolha de dados por promessas de calibração automática.


## Versão 3.0 — exploração e ciclo previsto/real

Implementados quatro módulos, seleção mapa/perfil, worker GPX, planos imutáveis, revisões do resultado, métricas em p.p., exclusões e backup v2 com migração v3. Testes de browser incluem o fluxo completo em desktop e 390 px, importação offline e 50 000 pontos. Resultados efetivos em TEST_REPORT.md.

Continuam dependentes de evidência externa: precisão em campo, configuração Cube/Bosch, compatibilidade PowerMore, Swift/DMG/Safari/macOS físico. O traçado não substitui cartografia/navegação. Não se adicionou sincronização remota nem promessa de aprendizagem quantitativamente validada.

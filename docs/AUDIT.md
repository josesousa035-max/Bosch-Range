# Auditoria — 26 de outubro de 2026

Repositório: josesousa035-max/Bosch-Range, branch main. HEAD inicial `283709a37580e1b73fb66e14d50032f69e9e5517`.

Estado inicial limpo. Único ficheiro versionado: README.md, conteúdo:

```
# Bosch-Range
Calculo do range bicicleta elétricas Bosch
```

Não existiam aplicação Amflow, framework, manifests, lockfiles, CI, testes, curvas de consumo ou interface. Logo, não é possível avaliar a qualidade matemática nem preservar funcionalidades de uma aplicação cujo código não foi disponibilizado. Não foi assumido acesso ao ChatGPT Sites. Não se detetaram referências Amflow obsoletas além da descrição do pedido. O original externo foi preservado: nenhuma operação foi executada nesse projeto.

Estratégia executada: nova implementação no repositório Bosch independente, React/TypeScript, física isolada, testes com resultados conhecidos, estado local e ausência de APIs privadas. A auditoria não comprova especificações de hardware: ver BOSCH_SOURCES.md.

## Auditoria da evolução 3.0 — 29 de outubro de 2026

O checkout já continha o código local 2.1, apesar de o HEAD remoto ainda ser o commit inicial com README. Confirmaram-se React/TypeScript/Vite, motor físico, GPX, SVG, IndexedDB, biblioteca, backup, comparação e calibração. Faltavam previsão→resultado com snapshots e interação mapa↔altitude. Reutilizaram-se esses módulos; adicionaram-se worker/parser XML adequado ao worker, geometria indexada, journeys e uma interface de quatro áreas. Não se presumiu acesso ao ChatGPT Sites nem se descartaram os registos existentes.

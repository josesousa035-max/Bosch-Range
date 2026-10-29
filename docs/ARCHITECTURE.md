# Arquitetura

Aplicação estática local-first. React 19/TypeScript, Vite, IndexedDB através de idb; gráficos e traçado em SVG, XML através de DOMParser do browser. Sem backend, serviços pagos, mapas remotos ou código executado dos ficheiros importados. DOMParser não resolve entidades externas no browser; DTD/ENTITY são rejeitados adicionalmente. Não se adicionou biblioteca XML genérica com dependências/transporte desnecessários.

- `src/core/model.ts`: tipos, validação, forças, modelo de modos aproximado, velocidade viável, integração de energia e bateria, percurso agregado.
- `src/core/gpx.ts`: XML, distância haversine, rumo, limpeza conservadora, cotas, subidas e etapas.
- `src/core/storage.ts`: esquema IndexedDB v2 com migração aditiva desde v1, snapshots de atividades, preferências, previsões recentes, importação transacional e ajustes.
- `src/core/calibration.ts`: ajuste determinístico de um único parâmetro e métricas com reserva independente.
- `src/components/Charts.tsx`: gráficos SVG acessíveis por nome, curva energética/altimétrica e traçado local. O traçado não é cartografia de navegação.
- `src/App.tsx`: sete ecrãs, formulários validados pelo motor antes de cálculo/gravação, efeitos de persistência e apresentação dos diagnósticos.
- `public/sw.js`: cache dos recursos de produção após a primeira instalação. Fetch network-first com fallback local, sem envio de dados IndexedDB. Scripts/estilos do HTML inicial são precached.
- `tests`: Vitest/jsdom com fake-indexeddb; Playwright em Chromium para aplicação compilada, incluindo offline.

## Estado e privacidade

A simulação é derivada de settings + Route; a UI memoiza cálculos. Preferências válidas são guardadas com debounce. Dados em IndexedDB `bosch-range-lab`: object stores settings, activities, adjustments e routes. Um passeio guarda percurso, parâmetros, energia prevista original e origem da observação (Wh declarados ou aproximação por SOC). Importação JSON usa IDs como chave e transação única: uma atividade inválida bloqueia a importação, não deixa gravações parciais. Exportação é iniciada pelo utilizador e cria ficheiro local.

A preferência de tema usa localStorage; pode ser alterada em Definições no móvel. Modo escuro não envolve chamadas de rede. Fontes são fontes do sistema, sem Google Fonts. A aplicação não carrega analytics nem tiles externos. Abrir explicitamente ligações oficiais usa o browser do utilizador.

## Offline e distribuição

O service worker não é ativado por Vite dev. Build/preview são necessários para testar offline. IndexedDB e caches pertencem à origem (scheme/host/port); mudar porta/origem não migra dados. Exportar antes de mudanças. A publicação não foi executada. Atualizações exigem bump de CACHE para invalidar recursos antigos; não apagar IndexedDB. Cache não substitui backup.

## Escala e limites

GPX até 12 MB/100 000 pontos e JSON até 20 MB/2000 atividades. Processamento síncrono: ficheiros no limite podem bloquear temporariamente o thread principal. Piso editável paginado (100 segmentos/página). Sem worker ou geometria GIS pesada nesta versão. Não se ligam intervalos entre tracks, nem se interpola altitude desconhecida como se fosse medida.

Os ecrãs foram concentrados numa composição React para a primeira entrega. O núcleo não importa React e pode evoluir para worker sem alterar as equações. Evolução possível: separar ecrãs, virtualizar curvas extensas e versionar exportações; não há promessa de suporte a formatos externos não implementados.


## Persistência e backup na 2.1

`src/core/workspace.ts` valida sessão e percursos aninhados e cria a identidade canónica da geometria. `src/core/backup.ts` gere o formato versionado, snapshots de leitura e restauro transacional. `RouteLibrary` e `BackupPanel` são componentes separados da composição principal. O autosave escreve definições e sessão em conjunto; usa gerações para uma conclusão antiga não indicar que alterações mais recentes já estão gravadas. Pausa o autosave durante restauros e guarda primeiro as preferências locais pendentes quando não se pediu a sua substituição.

Ver docs/DATA_AND_BACKUPS.md para limites, conflitos, privacidade e compatibilidade com o formato legado de atividades. O modelo físico permanece inalterado.

## Versão 3.0 — navegação, exploração e passeios

A interface principal foi reorganizada em quatro áreas: Planear, Os meus passeios, Evolução e A minha bicicleta. `TrackExplorer` controla a seleção partilhada e só atualiza estado local durante hover, sem executar o motor. `JourneyHistory` apresenta planos/resultados e edições; não recalcula previsões históricas.

- `src/core/explorer.ts`: preparação canónica, projeção local, índice espacial, pesquisa binária e interpolação.
- `src/core/gpx.worker.ts`: parsing/preparação em worker, com cancelamento por intenção na interface.
- `src/core/gpx.ts`: parser GPX reutilizado com fast-xml-parser para funcionar sem DOMParser no worker; suporta tracks, routes e namespaces. Modelo/filtros existentes preservados.
- `src/core/journeys.ts`: snapshots versionados, resultados/revisões, métricas em p.p., exclusões, adaptador de calibração e migração de atividades.
- IndexedDB **v3**, adicionando journeys, sem apagar os stores anteriores. Backup completo **v2**, compatível na leitura com v1.
- O service worker inclui o chunk de parsing no precache. O bundle desktop continua sem service worker.

As comparações A/B, cenários e etapas são memoizadas por percurso/parâmetros. O desenho reduzido mantém índices dos dados completos; seleção usa segmento/fração, não os índices da linha simplificada. Original e processado das cotas são distintos. Ver GPX_EXPLORER.md e JOURNEYS.md.

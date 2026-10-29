# Exploração GPX sincronizada — 3.0

## Representação partilhada

`prepareTrack` produz vértices, arestas contínuas e distância acumulada. Cada aresta guarda índices dos seus extremos, distância inicial/comprimento e correspondência com o segmento do modelo. A seleção é **{edge, fraction}**, não o índice de um array de desenho. `positionAt` calcula coordenadas e altitude a partir dos mesmos extremos. Perfil, marcador no traçado, painel e barra usam esse objeto único.

As distâncias são haversine (R=6 371 000 m), horizontais, como no motor. Uma tolerância de 0,05 m verifica a correspondência com os segmentos energéticos; se não houver compatibilidade, não se apresenta bateria nesse ponto. A curva de Wh é interpolada por distância e limitada a [0,100%]. É previsão, nunca telemetria.

Para altitude entre extremos conhecidos, `h(t)=h0+t(h1-h0)`. Zero/negativos são válidos. Se faltar um extremo, o interior fica indisponível; um extremo conhecido mantém a sua cota. Não há interpolação por interrupções de tracks. Em fronteiras com a mesma distância acumulada, a aresta selecionada preserva o lado do intervalo. Perfis usam movimentos M entre fragmentos; não inventam uma rampa entre tracks.

`ele` é a cota processada; `originalEle` conserva a cota XML antes de filtros. O método de filtragem anterior foi preservado: correção de impulsos isolados, remoção de picos GPS, espaçamento mínimo aproximado de 10 m e histerese altimétrica de 2 m. Equações e limites em ENERGY_MODEL.md. Na migração de dados anteriores, cotas originais não disponíveis não são reconstruídas como medições.

## Proximidade, circuitos e cruzamentos

A geometria completa é projetada num traçado SVG local, com correção aproximada pela latitude. Sem tiles externos; não se apresenta como cartografia de navegação. O enquadramento é adequado a rotas locais; não é uma projeção GIS global, especialmente no antimeridiano.

Uma grelha espacial de células de 32 unidades limita as arestas candidatas ao ponteiro. Projeta-se a posição sobre cada aresta candidata, limitando t a [0,1]. Primeiro identificam-se mínimos locais de distância ao longo da sequência de arestas, para não confundir segmentos adjacentes de uma linha densamente amostrada com passagens distintas. Entre candidatos geometricamente equivalentes (até 3 unidades), escolhe-se o mais próximo da distância anteriormente selecionada. As alternativas com distâncias suficientemente distintas são mostradas por quilómetro, permitindo escolher outra volta/passagem. Não se troca arbitrariamente para a primeira ocorrência das mesmas coordenadas.

A procura por distância é binária. O progresso acessível funciona com setas, Home e End. Alterações do slider atualizam estado de imediato: adiar o estado de um range controlado permitia ao browser repor o valor anterior antes do RAF, defeito detetado e corrigido em E2E. Hover tem atualização por requestAnimationFrame; não altera parâmetros ou executa o motor.

## Desenho e interação

O mapa desenha cerca de 4000 vértices por amostragem com referências aos índices completos; preserva fronteiras de fragmentos e lacunas de altitude. A seleção continua a pesquisar todas as arestas, mesmo quando o vértice não foi desenhado. A simplificação pode reduzir curvas muito pequenas no desenho: não altera distância, cota ou energia calculadas.

O perfil fica imediatamente abaixo e tem a mesma largura. Hover em ambos atualiza a seleção. Clique fixa; clique/toque noutro ponto escolhe uma posição nova. Perfil suporta captura de pointer para arrasto. Zoom, enquadramento e deslocação são controlos explícitos; não há recenter por hover/slider. A seleção é reinicializada quando muda o traçado.

## Worker e validação

`gpx.worker.ts` executa parsing/preparação fora do thread principal. `fast-xml-parser` substitui DOMParser para permitir o parser reutilizável no worker; versão exata no lockfile, auditoria de dependências de produção reportada em TEST_REPORT.md. Sem fetch de GPX ou envio de dados.

Rejeitam-se XML inválido, DTD/ENTITY, raiz que não seja gpx, atributos de coordenadas inválidos, elevações não finitas e limites de tamanho/quantidade anteriores. Há suporte a trk/trkseg/trkpt, rte/rtept e namespaces. Tracks separados permanecem separados. Pontos sem movimento não criam arestas artificiais.

Cada intenção de importação tem um token crescente. A nova intenção termina o worker anterior; após leituras/IndexedDB volta-se a verificar o token antes de mudar o percurso. Selecionar o modo manual também cancela uma importação em curso. Um ficheiro antigo mais lento não pode sobrepor-se ao novo.

O service worker de produção inclui também o chunk do worker no precache. Assim, uma primeira instalação concluída permite importar GPX offline mesmo que ainda não tenha aberto um GPX online.

## Testes e limites

Fixtures verificam distâncias/cotas conhecidas com tolerância de 1 cm, interpolation, tracks separados, ausência de altitude, zero/negativos, circuito e passagem repetida. Browser testa ambos os sentidos, fixação, zoom, teclado, toque e 390 px. O teste grande usa 50 000 pontos; o unitário usa 30 000. A marca local Performance API `bosch-range:simulate` permite comprovar que o contador não aumenta durante hover; não é telemetria e não é enviado.

Não foram testados todos os GPX reais, limites de memória de smartphones físicos nem WKWebView/Safari macOS. IndexedDB/structured-clone de ficheiros grandes ainda pode criar pausas curtas após o worker. O desenho sem cartografia e os filtros têm limitações explícitas; não garantem relevo verdadeiro nem adequação do caminho.

# Dados locais, biblioteca e backups — versão 2.1

## Recuperar o trabalho

A aplicação guarda automaticamente, após cerca de 400 ms sem alterações, os parâmetros e a sessão em IndexedDB: ecrã ativo, GPX, pisos por segmento, distância/subida manuais, etapas/cargas/recargas, rascunho do passeio, tema e modo avançado. O indicador **Sessão guardada** só aparece após a transação concluída. Entradas inválidas não substituem o último estado válido.

Existe uma tentativa adicional de gravação ao ocultar/fechar a página, mas nenhum browser garante que termina uma escrita durante um encerramento forçado ou falha do sistema. Aguarde o indicador antes de fechar. A sessão é recuperação local, não substitui um backup fora do browser.

## Biblioteca GPX

No **Planeador GPX**, cada importação válida é guardada automaticamente. Pode procurar por nome, abrir, renomear e remover da biblioteca. Reimportar geometria igual mantém o registo local, mesmo com um nome de ficheiro diferente. A identidade utiliza distâncias, cotas, rumos, piso, separações e pontos GPS normalizados; não o nome/avisos. Um hash serve apenas para localizar candidatos: compara-se a identidade completa antes de deduplicar, resolvendo colisões sem substituir percursos diferentes.

Editar o piso altera o percurso da sessão, sem reescrever os passeios históricos. Use **Guardar percurso atual** para guardar uma variante; se for igual, não se duplica. Remover da biblioteca não remove a sessão ativa nem snapshots de atividades. Até 1000 percursos na biblioteca; os ficheiros mantêm os limites GPX anteriores.

## Exportar backup completo

Em **Definições → Backup completo e transferência**, escolha **Exportar backup completo**. Antes de exportar, a aplicação guarda as alterações válidas da sessão. Uma transação de leitura captura todos os grupos num estado coerente.

Inclui:

- Definições físicas e fator de calibração aplicado.
- Sessão atual, tema e rascunho de passeio ainda não gravado como atividade.
- Biblioteca de percursos e snapshots GPX dos passeios.
- Atividades, suas observações e previsões originais.
- Histórico dos ajustes de calibração, incluindo IDs de treino/validação.
- As 10 previsões recentes guardadas.

O JSON contém coordenadas e dados pessoais. **Não é encriptado.** A aplicação não o envia para servidores; guardar numa pasta sincronizada é uma escolha sua, externa à aplicação. Mantenha uma cópia privada fora do browser e não a publique em issues/repositórios.

## Restaurar noutro browser ou na aplicação Mac

1. Abra Definições e escolha **Selecionar backup**.
2. Confirme a data, versão e quantidades na pré-visualização. Selecionar o ficheiro ainda não modifica os dados.
3. Por omissão, são acrescentados apenas registos ausentes. Um ID existente preserva o snapshot local, mesmo quando o backup tem conteúdo diferente. Não se eliminam dados locais. IDs repetidos no próprio ficheiro são rejeitados.
4. Se pretender recuperar os parâmetros e a sessão do ficheiro, assinale **Restaurar também definições e sessão (substitui as atuais)**. Sem essa opção, preservam-se inclusive alterações válidas locais ainda pendentes de gravação.
5. Escolha **Restaurar backup**. Os dados são validados novamente e importados numa única transação. Uma falha de escrita aborta todos os registos do restauro. As previsões recentes são combinadas e limitadas às 10 mais recentes.

Repetir o mesmo restauro não duplica atividades, percursos ou ajustes. O ficheiro não é sincronização bidirecional nem tem resolução automática de versões: registos com IDs diferentes continuam distintos. Históricos podem referenciar passeios entretanto removidos; preservam-se como registo do ajuste anterior, não como prova de validação atual.

O JSON antigo de **Exportar JSON** em Os meus passeios continua suportado nesse módulo. É apenas de atividades e tem a semântica anterior de atualizar IDs existentes. **Não é um backup completo** e não deve ser escolhido no seletor de backups. As interfaces têm nomes e formatos diferentes de propósito.

## Formato e limites

- `format: "bosch-range-lab-backup"`, `version: 1`, `appVersion: "2.1.0"`, `createdAt`.
- `settings`, `workspace` (pode ser null), `activities`, `routes`, `adjustments`, `simulations`.
- Ficheiro até 50 MB; 2000 atividades, 1000 percursos, 10 000 ajustes e 10 previsões por backup.
- Recusa versões desconhecidas, números não finitos, coordenadas/pisos inválidos, estruturas incompletas e sobreposição de treino/validação nos ajustes.
- Se a união dos registos exceder os limites do restauro, a operação é recusada sem importação parcial. Se os dados locais excederem 50 MB, a exportação completa avisa e não cria um ficheiro que não consiga voltar a importar. Não foi implementado particionamento de backups.
- Processamento local e síncrono na validação: ficheiros muito grandes podem pausar a interface. Quota e retenção efetiva dependem do browser; modo privado/limpeza de dados pode removê-los.

## Migração e versões

IndexedDB evoluiu de v1 para v2, adicionando o object store `routes`. Os stores anteriores não são apagados nem reescritos durante a migração. A sessão passa a ser guardada no store settings. Se uma janela antiga bloquear a atualização, a aplicação pede para fechar as outras janelas; não apague o armazenamento para resolver esse aviso.

Browser, origem/porta e WKWebView nativo têm armazenamentos próprios. A transferência é feita pelo backup, não automaticamente. Não volte a usar uma compilação antiga que só conheça o schema v1 sobre a mesma origem já migrada: mantenha a versão atual. O service worker foi versionado para a atualização web; o bundle desktop continua sem service worker.

A recuperação foi testada em Chromium e fake-indexeddb. A transferência real em Safari/WKWebView macOS, o DMG e a instalação nativa continuam por validar num Mac. Estes mecanismos não validam a precisão energética em passeios reais.

## Atualização 3.0

O backup de escrita passa a **version: 2**, appVersion 3.0.0, acrescentando `journeys` com snapshots, resultados e revisões. Leitura de backups **v1 e v2**; versões desconhecidas continuam rejeitadas. O schema IndexedDB é **v3** e a nova migração apenas adiciona o store journeys. Os parâmetros físicos continuam os anteriores.

O seletor está agora em **A minha bicicleta**. Ao importar um backup antigo, as atividades são preservadas e convertidas de forma idempotente em registos legados, com as limitações históricas identificadas. A previsão original não é substituída por uma simulação atual. IDs de planos/passeios existentes também mantêm os registos locais. Limite: 2000 journeys por backup/restauro e o mesmo teto de 50 MB.

A migração v3 não torna possível abrir o mesmo armazenamento com uma aplicação antiga que só conheça v1/v2; mantenha o código atual. A secção de versões anteriores acima descreve a entrega 2.1, não o formato de escrita atual.

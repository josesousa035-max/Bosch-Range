# Planos, resultados e evolução — 3.0

## Plano imutável

Store `journeys`, schema IndexedDB v3. Cada registo tem ID estável, nome/data/criação/atualização/notas, estado planned/completed, parentId opcional, previsão e resultado separado. A previsão inclui percurso completo e identidade/versionamento, settings, capacidade utilizável estimada (separada da nominal), SOC inicial, reserva, massa/piso/assistência, consumo, chegada, duração, intervalo heurístico e curva energética compacta.

O algoritmo continua `physics-2.0.0`; a alteração de UI não representa uma alteração das equações. A versão da calibração regista o modelo de perdas e o fator aplicado. `formatVersion=1` identifica o formato do passeio, distinto do backup v2 e do schema IndexedDB v3.

`createJourney` clona e grava a previsão. Os únicos métodos de edição do registo alteram notas/resultado; nunca recalculam o forecast. `duplicateJourney` dá novo ID e parentId, preserva snapshot, remove o resultado e cria plano. Simular novamente leva o percurso/parâmetros ao planeador, usando o fator de calibração atual e criando novo registo ligado ao guardar. O anterior não é substituído.

Distância/subida têm origem explícita: gpx calculado/processado, manual, ou legacy. GPX incompleto não mostra subida como se estivesse determinada. As restantes capacidades, massas, eficiência e modos mantêm as hipóteses e limites anteriores; 800 Wh continuam nominais, não uma medição utilizável.

## Resultado real e erro

Resultado é um objeto separado: SOC início/fim, distância real, modo efetivo, Wh efetivamente medidos opcionais, observações e flags de recarga, troca, configuração, percurso ou condições alteradas. Percentagens [0,100]; aumento do SOC exige assinalar recarga/troca. Cada gravação acrescenta uma revisão com data, sem apagar a observação anterior.

`erro = SOC_previsto_à_chegada − SOC_observado_à_chegada`. Positivo = otimista, negativo = conservador. Exemplo de teste: 35−27=+8 p.p. Ausência de resultado = null, nunca consumo zero.

Quando não há Wh medidos, `Wh_estimados = capacidade_considerada × (SOC_início_real−SOC_fim_real)/100`. A apresentação identifica que é uma aproximação, não medição. Se houver recarga, troca, aumento inexplicável ou duas baterias com SOC combinado desconhecido, não se infere energia a partir do SOC. Wh declarados como medidos são identificados como tal, sem validar a qualidade do dispositivo externo.

## Métricas comparáveis

Só resultados concluídos sem incompatibilidades entram em MAE p.p./viés: excluem-se recarga, troca, configuração diferente, percurso alterado ou distância diferente mais de 5%, modo diferente, condições assinaladas como relevantes, SOC inicial diferente mais de 1 p.p., PowerMore com SOC combinado não confirmado e GPX sem altimetria completa. São regras conservadoras de comparabilidade, não um classificador estatístico. Todos os motivos aparecem em Evolução; os registos continuam no histórico.

Com menos de 8 resultados comparáveis mostra-se “Amostra ainda pequena”. Não há promessa de precisão. A calibração anterior em Wh foi reutilizada: adaptador de novos passeios elegíveis + atividades legadas originais sem duplicação. O fator é aplicado explicitamente e só influencia simulações novas; o histórico de ajustes continua exportável. Treino/validação permanecem separados como antes. Não se introduziu ajuste automático nem rede neuronal.

## Migração e eliminação

V3 adiciona journeys sem apagar stores v1/v2. Atividades antigas são migradas de forma idempotente com ID `legacy-<id anterior>`. Preservam-se o consumo previsto original e os parâmetros. Como não guardavam uma chegada/curva originais, a chegada reconstruída é assinalada, não entra nas métricas em p.p., e a bateria por ponto fica indisponível. Não se inventam intervalos históricos ou amostras energéticas antigas.

Eliminar pede confirmação. Se for uma atividade migrada, remove também o seu registo legado para não reaparecer na próxima migração. Outros snapshots e percursos da biblioteca não são apagados. Renomear/remover rotas da biblioteca não muda previsões guardadas.

## Backup

Backup completo v2 inclui journeys e revisões, mantendo os grupos anteriores. Backups v1 continuam aceites e as atividades antigas são migradas após restauro. A validação acontece antes de escrever; todos os grupos do restauro usam a mesma transação. IDs locais existentes prevalecem. Não é sincronização bidirecional nem substituição silenciosa. Definições/sessão só se repõem por escolha explícita.

Dados pessoais são exclusivamente locais e o JSON não é encriptado. Limite de 50 MB; snapshots grandes podem alcançar esse limite. Não há particionamento automático. Veja DATA_AND_BACKUPS.md e TEST_REPORT.md para resultados e limites efetivamente verificados.

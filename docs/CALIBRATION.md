# Calibração progressiva

Objetivo: corrigir um desvio persistente sem sobreajustar poucos passeios ou inventar curvas Bosch. Apenas um parâmetro ajustável automaticamente: multiplicador `k` da energia elétrica de tração, com baseline k=1. Não se mudam massas, gravidade, Crr e CdA simultaneamente. Estes não seriam identificáveis a partir de SOC agregado.

Cada atividade guarda parâmetros completos, percurso, previsão original k=1, energia elétrica de tração original `M`, auxiliares `A`, observação `Y` e origem. Duração fornece velocidade média alvo; se o modelo reduzir a velocidade por potência, a previsão usa a duração modelada. Média observada não permite reconstruir perfil de potência, pausas ou distribuição de modos. Previsão registada não é uma medição.

`Y` é Wh introduzidos como efetivamente medidos, ou aproximação `capacidade_efetiva × (SOC_início-SOC_final)`. Wh medidos são preferíveis. Com PowerMore, SOC agregado não identifica descarga individual: exige-se Wh totais medidos para registar. Campos SOC continuam metadados de principal; não são tratados como telemetria Bosch.

## Elegibilidade e ajuste

- Energia de tração prevista >10 Wh e observação >20 Wh.
- SOC apenas elegível quando diferença ≥15 pontos percentuais (reduz efeito de quantização).
- Mínimo 3 passeios elegíveis de treino; abaixo disso k=1 e estado “dados insuficientes”.
- Com ≥8 elegíveis, ordenar por data/ID e reservar cada quarto passeio para avaliação. Não são usados no ajuste. Esta reserva intercalada não é teste prospectivo; antes de alegar precisão, usar também futuros passeios não vistos.

Por passeio de treino:

```
r_i = clamp((Y_i - A_i) / M_i; 0,7; 1,3)
w_i = 1 (Wh medidos) ou 0,35 (SOC aproximado)
k = clamp((3 × 1 + soma(w_i × r_i)) / (3 + soma(w_i)); 0,7; 1,3)
```

É uma média ponderada regularizada em torno do modelo físico, equivalente a minimizar erros quadráticos nas razões com prior de peso 3. Não é otimização em Wh nem rede neuronal. Com 3 medições extremas, limite inicial do ajuste é ±15%; com apenas um passeio não há ajuste. O cálculo é refeito deterministicamente sobre os dados, não acumulado multiplicativamente. Aplicar novamente o mesmo conjunto dá o mesmo k. Observações extremas são limitadas, não apagam silenciosamente passeios.

Aplicação explícita na UI; guarda instante, IDs de treino/validação, razão e fator. O modelo original permanece e “Repor modelo de fábrica” regista k=1, sem apagar atividades. Exportação de atividades inclui snapshots originais; o histórico de ajustes não está incluído no formato JSON legado de passeios, mas é incluído no backup completo versionado da aplicação (desde 2.1).

## Avaliação

Para cada passeio reservado: previsão `max(k, η/0,98) M + A` (limite físico de eficiência efetiva 98%), erro = previsão - observado. MAE em Wh, MAPE = média(|erro|/Y) em %, e viés médio em Wh; compara k=1 com fator proposto. Sem reservados, mostra indisponibilidade de avaliação, nunca zero como precisão perfeita. Mesmo 8 passeios produzem apenas 2 reservados: insuficiente para afirmar precisão robusta.

A calibração na aplicação está **implementada e testada em dados sintéticos**, mas **não validada quantitativamente em campo**. Não existem passeios reais disponibilizados. Não se promete melhoria universal: diferenças podem ser vento, potência humana errada, erro GPX, SOC ou mudança de terreno. Se o erro reservado piorar, não aplicar o ajuste e investigar os dados. Não foram estimadas bandas probabilísticas a partir de observações reais.

## Integração 3.0

O método de ajuste numérico anterior foi reutilizado. A área Evolução acrescenta métricas **em pontos percentuais de chegada**, separadas do MAE/MAPE **em Wh** do calibrador. Novos passeios entram no adaptador de calibração apenas se forem comparáveis e houver energia observada justificável; flags de recarga/troca/configuração/percurso/condições e diferenças relevantes de SOC inicial/modo/distância excluem-nos. PowerMore sem SOC combinado confirmado não entra.

Atividades antigas continuam disponíveis ao calibrador original em Wh sem duplicar as correspondentes journeys migradas. A percentagem de chegada legada, quando reconstituída, não entra nas novas métricas em p.p. Ajustar o fator não reescreve nenhum snapshot já guardado. Versões, intervalos heurísticos e validação empírica continuam explícitos; nenhum dado de demonstração é incluído automaticamente.

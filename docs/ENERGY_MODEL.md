# Modelo energético v2.0

Modelo quase-estático determinístico, aproximado e aberto a calibração. Não é o algoritmo Bosch. Distâncias de entrada horizontais em m; cotas em m; massa em kg; velocidades internas em m/s; potência em W; energia em Wh; temperatura em °C; ângulos de rumo em graus. Sem calibração empírica validada.

## Segmento e forças

Para distância horizontal `d`, diferença de cota `h`, `grade=h/d`, `θ=atan(grade)` e comprimento percorrido `L=hypot(d,h)`:

```
F_g = m g sin(θ)
F_rr = Crr m g cos(θ)
ρ(T) = 1,225 × 288,15 / (273,15 + T)
v_rel = v + w cos(vento_proveniente - rumo)
F_a = 0,5 ρ CdA v_rel |v_rel|
P_necessária = max(0, (F_g + F_rr + F_a) v)
t_horas = L / v / 3600
E_mecânica = P_necessária t_horas
```

`g=9,80665 m/s²`. Assim `F_g L /3600 = mgh/3600` exatamente: a gravidade não volta a ser somada como um termo separado. A distância GPS apresentada é horizontal (haversine, raio 6 371 000 m). A duração integra o comprimento inclinado. Não se aproxima `h` como energia a acrescentar a uma força que já contém gravidade.

Aerodinâmica assinada permite vento de cauda superior à velocidade; potência resultante nunca negativa. Descida/vento favorável podem reduzir necessidade a zero. Energia negativa é dissipada, nunca recuperada para a bateria. Rumo do GPX é calculado entre pontos; sem GPX, rumo Norte assumido. Não há vento lateral nem previsão meteorológica.

Crr iniciais: asfalto 0,007; compactado 0,014; gravilha 0,021; trilho 0,032; lama 0,055. Multiplicador de pneus/pressão/condição 0,4–3. Estes são pressupostos plausíveis de engenharia, não medições dos pneus reais. CdA=0,60 m², editável. Densidade considera apenas temperatura, sem altitude/pressão/humidade.

## Ciclista, modos e velocidade

Potência humana disponível: parâmetro em W (perfis 65/90/130/180 W, ou valor personalizado). Partilha aproxima preferência de assistência; não assume que o ciclista fornece a sua potência nominal mesmo quando a procura é mínima.

Relações comportamentais aproximadas em função do declive positivo `q=max(grade,0)`:

- Eco: `r=0,60`.
- Tour+: `r=min(2,4; 0,9+12q)`.
- eMTB: `r=min(3,4; 1,5+15q)`.
- Turbo: `r=3,4`.

Multiplicadas por `assistanceScale` editável. São curvas inventariadas como **aproximações deste modelo**, não especificações de firmware. Modos dinâmicos não são tratados como fatores constantes. Não existe simulação de cadência, torque por rotação ou reação ao pedal. Sem cadência/transmissão, não seria justificável converter Nm em potência limite real.

`cutoff(km/h)=clamp(25-km/h,0,1)`: assistência plena até 24, transição linear até 25, zero acima. Esta transição é uma hipótese numérica. A bicicleta pode exceder 25 km/h sem assistência.

```
P_disponível(v) = P_humana + min(P_motor_max, P_humana × r) × cutoff(v)
```

Se o ritmo pretendido exige mais, bisseção (60 iterações) procura uma velocidade viável entre zero e a pretendida. Velocidade menor que 0,15 m/s é rejeitada: não se inventa duração infinita. Limites de binário podem tornar uma subida mais difícil do que esta solução prevê; a UI avisa quando reduz a velocidade. Não se modela empurrar a bicicleta.

Para a velocidade calculada, a partilha preferida é `P_h_pref=min(P_humana,P_necessária/(1+r×cutoff))`. Motor é o mínimo entre necessidade restante, limite mecânico e assistência permitida. Ciclista completa a procura restante, limitado à potência disponível. A soma mecânica é testada. Eficiência é combinada de motor/transmissão; potência humana é efetiva à roda por simplificação.

## Energia elétrica e capacidade

```
E_pedido = (P_motor / η × max(k_calibração, η/0,98) + P_aux) × t_horas
f_frio = max(0,70; 1 - max(0;20-T)×0,007)
capacidade_efetiva = (Wh_main + Wh_ext) × SOH × utilizável × f_frio
E_inicial = (Wh_main×SOC_main + Wh_ext×SOC_ext) × SOH × utilizável × f_frio
reserva_Wh = capacidade_efetiva × reserva_percentual
E_restante = max(0; E_inicial - soma(E_pedido))
```

Percentagens/frações convertidas para [0,1] antes das multiplicações. Utilizável inicial 95%, SOH 100%; temperatura 20 °C; η=0,75; auxiliares 4 W. A eficiência efetiva é limitada a 98%, mesmo se a calibração e uma eficiência manual alta sugerirem ganho impossível. São estimativas, não reservas internas ou medições Bosch. Temperatura reduz energia estimada, não simula aquecimento ou efeito na descarga em tempo real. Não existe derating por calor.

PowerMore desligado por omissão; quando ativo acrescenta 250 Wh nominais com SOC próprio. Saúde/derating comuns são uma simplificação. Não se reparte consumo nem energia restante por bateria; a estratégia real de gestão Bosch não está documentada aqui. Chegada em % refere-se à capacidade efetiva combinada, não necessariamente ao valor que um display real irá mostrar.

Procura total pode exceder energia inicial; consumo físico disponível é limitado a esta. A curva restante satura em zero. Localizam-se reserva e esgotamento por interpolação energética linear dentro do segmento. Depois do esgotamento, potência/duração calculadas mantêm assistência contrafactual para quantificar a procura: **não são uma previsão de condução real com bateria vazia**. Autonomia restante extrapola Wh/km deste mesmo percurso, sem garantia para terrenos diferentes.

## Manual, GPX e filtragem

Manual: 100 segmentos, metade da distância em subida e metade em descida simétricas, subida acumulada fornecida. Desnível não ultrapassa 200 m/km, ou 40% na metade ascendente. Não conhece posição de subidas, descidas finais nem cotas reais; o perfil é sintético. É uma aproximação de uma saída com retorno à altitude inicial.

GPX: máximo 12 MB / 100 000 pontos, XML gpx válido, trkseg ou rte; latitude/longitude finitas, cotas -500 a 9000 m. DTD e ENTITY são rejeitados antes de DOMParser. Não se ligam segmentos de tracks independentes. Segmentos com salto >5 km ou declive >60% são rejeitados; ficheiros incompatíveis devem ser corrigidos explicitamente.

Filtros, nesta ordem:

1. Impulso altimétrico isolado: mediana de três apenas se cotas vizinhas diferem <5 m e desvio da cota central excede `max(25 m, 0,25 × menor distância aos vizinhos)`. Regista aviso de correção. Pode alterar uma rampa real muito curta/íngreme: confirme o perfil.
2. Picos GPS que se afastam >300 m e regressam a <50 m da posição anterior são removidos. Sem timestamps/velocidade temporal, não é um filtro GPS universal.
3. Pontos espaciais muito próximos são acumulados até ≥10 m, retendo o fim. Distâncias inferiores a 0,2 m são ignoradas.
4. Histerese altimétrica de 2 m: a cota de referência é mantida até acumular variação significativa; o ponto final conserva a diferença. Não é média móvel agressiva que destrói uma subida longa. Pode remover pequenas ondulações; não alegamos recuperação do relevo verdadeiro.

Elevação incompleta: não se interpola através de cotas desconhecidas; diferença fica zero quando um extremo falta. Assinala explicitamente possível subestimação e intervalo maior. Não se infere terreno da geometria. Piso global ou por segmento, atribuído pelo utilizador. Subidas prolongadas: sequências com declive ≥2%, comprimento horizontal ≥500 m e subida ≥20 m.

## Incerteza e validação

Bandas de procura ±25% para GPX com cotas, ±50% para perfil manual/incompleto. **São heurísticas ilustrativas; erros reais podem ultrapassá-las.** Não são intervalos de confiança. Uma cota presente não equivale a cota exata. Faltam aceleração, paragens, técnica, lama variável, temperatura interna, perdas de transmissão variáveis e parâmetros medidos.

Testes verificam identidades físicas, conservação mecânica, comportamento do corte, invariantes de bateria e GPX sintéticos. Não estabelecem precisão real. Fórmulas de trabalho/gravidade/aerodinâmica são equações clássicas de mecânica (Newton, trabalho de força, arrasto quadrático), não dados internos de fabricante. As constantes aproximadas devem ser substituídas ou calibradas apenas com evidência. Fontes de hardware e estado de verificação em BOSCH_SOURCES.md; metodologia de calibração em CALIBRATION.md.

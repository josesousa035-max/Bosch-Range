# Prompt executada — Bosch Range Lab 2.1

Evolui o Bosch Range Lab para uma versão 2.1 orientada ao uso diário e à preservação dos dados locais. Inspeciona primeiro o código e as instruções AGENTS.md. Mantém o motor físico, as suas hipóteses e a distinção entre dados medidos e estimativas.

Implementa:

1. Biblioteca GPX em IndexedDB: guardar automaticamente importações, procurar, abrir, renomear e remover percursos. Reimportações de geometria idêntica não devem criar duplicados, mesmo com nomes diferentes; verifica igualdade exata para não perder dados por colisões de hash. Alterações ao piso podem ser guardadas como variantes. Não alteres snapshots de passeios ao editar/remover a biblioteca.
2. Recuperação automática da sessão: percurso ativo, piso por segmento, distância/subida manuais, definições, etapas/recargas, rascunho do passeio, tema e modo avançado. Mostra estado de gravação e não substituas o último estado válido por entradas inválidas. Migra IndexedDB existente sem apagar dados.
3. Backup completo JSON versionado: percursos, passeios, calibração, preferências, sessão e previsões recentes. Valida o ficheiro e apresenta uma pré-visualização antes de importar. O comportamento predefinido acrescenta registos em falta e mantém os locais quando há conflitos; a reposição de definições/sessão exige uma escolha explícita. O restauro deve usar uma transação única, rejeitar versões desconhecidas e não deixar importações parciais.
4. Privacidade: sem servidor, login, telemetria ou upload. Explica que o backup contém localização/dados pessoais e não está encriptado. Limita tamanhos e valida dados aninhados, números, coordenadas, modos e identificadores.
5. Testes: migração real de schema, round-trip de todos os dados, importação repetida, conflitos, ficheiros inválidos, atomicidade, deduplicação e recuperação após reload. Testa uma transferência entre contextos de browser independentes e a variante desktop. Não afirmes ter testado Swift/DMG em Linux nem ter validado precisão no terreno.
6. Entrega: documentação de utilização/formato/limitações, relatório com resultados realmente executados e ZIP atualizado com código, build web e gerador macOS. Não publiques código ou dados. Continua a implementação e corrige falhas encontradas, sem ficar apenas pelo plano.

Critérios: a biblioteca e sessão sobrevivem ao reload; um backup transfere os dados para outro contexto; restauros repetidos não duplicam registos nem substituem snapshots locais; os testes físicos anteriores continuam a passar. A compilação nativa e a precisão empírica continuam pendentes de macOS e passeios reais.

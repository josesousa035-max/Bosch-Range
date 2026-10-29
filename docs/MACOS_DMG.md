# Aplicação macOS e instalador DMG

## Estado honesto da entrega

Foi preparado o código da aplicação nativa e o gerador de DMG para **Apple Silicon, incluindo MacBook Air M2**, macOS 13+. Este ambiente é Linux: não dispõe de AppKit/WebKit macOS, Swift/SDK Apple, codesign ou hdiutil. **Não foi produzido nem testado um ficheiro .app/.dmg neste ambiente.** O ZIP é um kit de compilação, não um instalador renomeado.

## Criar no Mac

Pré-requisitos apenas para construir (não para usar a aplicação final):

1. Node.js 24 LTS para Apple Silicon, de https://nodejs.org/.
2. Apple Command Line Tools: no Terminal execute `xcode-select --install` e conclua a instalação. Não é necessária uma conta Apple Developer para esta compilação pessoal.
3. Descomprima o ZIP e abra a pasta Bosch-Range.

Faça duplo clique em **Criar instalador Mac.command**. Em alternativa, no Terminal:

```sh
cd /caminho/para/Bosch-Range
bash scripts/build-macos.sh
```

O processo instala as dependências pelo lockfile, corre a suite de testes, compila os recursos web para desktop, compila o wrapper Swift arm64, cria o ícone, assina ad hoc, verifica a assinatura e cria/verifica o DMG com hdiutil. Não instala software de sistema automaticamente. A primeira compilação precisa de Internet para npm e das ferramentas Apple já instaladas.

Resultado esperado: `release/Bosch-Range-Lab-3.0.0-Apple-Silicon.dmg` e respetivo SHA-256. Abra o DMG e arraste a aplicação para Aplicações. A aplicação instalada não necessita de Node, Terminal, Internet ou um serviço externo. Ainda precisa de ser validada num Mac real.

## Arquitetura da versão desktop

- Wrapper em Swift/AppKit + WKWebView do sistema. Sem Electron, runtime Node incorporado ou dependências npm adicionais.
- Recursos de produção dentro de Contents/Resources/web. Serviço estático incorporado em Network.framework, **apenas 127.0.0.1:38471**. Não é um servidor acessível na rede Wi-Fi.
- Origem fixa e WKWebsiteDataStore persistente para conservar IndexedDB entre arranques. Não abrir duas cópias ao mesmo tempo; uma porta ocupada causa aviso, em vez de carregar silenciosamente outra aplicação.
- GET/HEAD apenas, verificação de Host, tamanho máximo do cabeçalho, rejeição de traversal e caminhos fora dos recursos. Sem API de escrita ou ponte JavaScript com privilégios nativos.
- Ligações externas abrem no browser do sistema, sem navegar a janela principal para conteúdos remotos.
- Seleção GPX/JSON por NSOpenPanel; exportações por WKDownload + NSSavePanel. **Estes diálogos ainda não foram testados em macOS.**
- O build `VITE_DESKTOP=1` não regista service worker: os recursos já estão incorporados e não devem ficar presos a caches de uma versão anterior. A versão web/PWA mantém o comportamento anterior.
- Assinatura ad hoc para compilação pessoal. Sem Developer ID nem notarização: não é um instalador pronto para distribuição pública. Não desative Gatekeeper/SIP ou TLS; para distribuir a terceiros será necessário tratar assinatura/notarização e testes num Mac.

Os passeios do Chrome/Safari não aparecem automaticamente no WKWebView: exporte o JSON na aplicação web e importe-o na aplicação desktop. As preferências devem ser configuradas no novo armazenamento. Não foi feita migração nem cópia de dados pessoais.

## Validação e limites

Linux: sintaxe bash e Info.plist verificados; núcleo e build testados. `npm run test:desktop-web` testa o bundle desktop em Chromium: GPX, persistência, ausência de service worker e ausência de pedidos externos. **Não compila nem testa o wrapper Swift/macOS.** Veja o aditamento em TEST_REPORT.md.

No Mac, antes de considerar a aplicação concluída: compilar o DMG; verificar instalação e arranque; importar GPX e JSON; exportar um passeio; fechar/reabrir e confirmar persistência; testar sem Internet e confirmar que ligações oficiais abrem no browser. Não se deve anunciar o DMG como validado antes destes passos.

A versão 3.0 usa os mesmos recursos empacotados, incluindo o worker GPX. O teste desktop em Chromium foi atualizado para planos/resultados; continua sem validar APIs nativas Apple.

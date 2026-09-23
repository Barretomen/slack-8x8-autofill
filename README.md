# Slack 8x8 Autofill

Extensão Chrome criada para reduzir o trabalho manual entre o Backoffice da Gopuff e o formulário 8x8 Call Log no Slack.

Guarda temporariamente os IDs da encomenda, do estafeta e do MFC e preenche o formulário quando este é aberto. Os dados ficam no armazenamento local do Chrome e expiram ao fim de 15 minutos.

## Instalação

1. Abra `chrome://extensions` no Chrome.
2. Ative o modo de programador.
3. Escolha **Carregar sem compactação** e selecione esta pasta.
4. Atualize as páginas do Slack e do Backoffice que já estejam abertas.

A extensão mostra o estado dos dados no ícone e nos painéis inseridos nas páginas. Se indicar `Missing Driver`, abra a página do estafeta correspondente. Se indicar `OLD`, volte a abrir as páginas da encomenda e do estafeta.

Este projeto depende da estrutura atual das páginas internas onde é executado; alterações nessas páginas podem exigir ajustes nos seletores de `content-company.js` ou `content-slack.js`.

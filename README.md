# Verificações automatizadas — Mala Pronta

Este pacote mantém o `index.html` atual e acrescenta testes de navegador para o login simulado, o tema claro, os ícones da barra lateral, as três páginas de Relatórios e a rolagem do ticker. Os testes rodam apenas contra os **Firebase Emulators locais**; não fazem login Google real nem consultam o Firestore de produção.

## Rodar no computador

1. Instale Node.js 22 ou superior.
2. Abra um terminal nesta pasta e execute:

   ```bash
   npm install
   npx playwright install chromium
   npm test
   ```

Na primeira execução, o Firebase CLI baixa os emuladores. O comando `npm test` sobe Auth e Firestore em portas locais, inicia uma cópia local do site, executa os testes e encerra os emuladores.

## Rodar no GitHub

1. Faça backup do repositório atual.
2. Copie o conteúdo deste pacote para a raiz do repositório, mantendo a pasta `.github/workflows`.
3. Envie as alterações para GitHub. O workflow executa em cada `push`, em cada `pull request` e pode ser iniciado manualmente na aba **Actions**.

O job testa com uma conta criada no emulador, sem senha Google ou usuário de produção. O e-mail de administrador nos testes acompanha o valor que já está no `index.html`; se você mudar o administrador no app, ajuste também `TEST_EMAIL` em `tests/site.spec.js`.

## Segurança importante

- `firebase.test.json` e `firestore.rules.test` são **somente para emuladores**. As regras de teste permitem operações autenticadas para facilitar os testes. Não use esse arquivo em `firebase deploy` e não substitua as regras reais do Firebase.
- O modo de emulador é ativado apenas em `localhost`/`127.0.0.1` com `?e2e=1`. No domínio publicado, o site continua apontando para o Firebase normal.
- A conta e a senha fixa dos testes existem somente no Auth Emulator, que reinicia isolado no GitHub Actions. Não são credenciais de produção.
- O código do projeto preserva o login Google original. O teste de automação autentica diretamente com e-mail/senha **no emulador local**, sem modificar a tela de login de produção.
- O repositório pode conter a configuração pública do Firebase já usada pelo site; nunca inclua service-account JSON, chave privada ou token de usuário.

## Limites do pacote

O workflow faz verificações automatizadas e reprova a atualização quando um teste falha; ele não altera o site sozinho, não abre PR automaticamente e não monitora o domínio em produção. Assim, uma falha é detectada durante a atualização, antes de você publicar. Para testes reais do domínio logado, seria necessário um ambiente de staging isolado e uma sessão de teste, não compartilhar sua conta Google.

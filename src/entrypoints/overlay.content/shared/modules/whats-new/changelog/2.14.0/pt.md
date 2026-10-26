# Atualização 2.14.0: o Web Agent chegou, e todos ganham 3 dias de Power Pack

Olá, pessoal 👋

Lembram do Web Agent que anunciamos da última vez, aquele que consegue fazer tarefas por vocês dentro do navegador? Boa notícia: a extensão complementar dele foi aprovada na revisão da Chrome Web Store. Com esta versão, o Web Agent está oficialmente aberto para todos.

Para que qualquer pessoa possa experimentar sem complicação, preparamos um **teste gratuito de 3 dias do Power Pack para todos os usuários**. Experimente primeiro e decida depois se vale a pena.

---

## ⚡ Resumo em 30 segundos

1. 🌐 **Chegou o Web Agent**: a IA vira uma assistente na barra lateral do navegador, navegando em páginas, preenchendo formulários e extraindo dados. E cada ação importante espera a sua confirmação.
2. 🎁 **Teste de 3 dias do Power Pack, sem complicação**: para usuários novos e antigos. Não precisa de código de resgate, ele começa sozinho depois da atualização.
3. 📁 **Pastas para Gems e cadernos**: pastas aninhadas, fixar itens e reordenar arrastando deixam tudo organizado.
4. 🪟 **Um esboço flutuante mais discreto**: ele se recolhe e some quando você tira o mouse, então nunca cobre a conversa.
5. 🐛 **Correções e ajustes**: sincronização de chats após o último redesign do Gemini, botões de salvar cortados no AI Studio, animação travada ao recolher a barra lateral e mais.

---

## 🎁 Um presente para todos: 3 dias de Power Pack grátis

A partir da 2.14.0, você pode experimentar tudo o que o Power Pack oferece de graça, incluindo:
* Quatro agentes, cada um com sua função (BetterSidebar, Workspace, Browser e o novo Web Agent)
* Exportação com um clique de chats completos para Notion e Obsidian

**Alguns detalhes sobre o teste:**
- **Nada para configurar**: depois da atualização, o teste de 3 dias começa sozinho na primeira vez que você abrir a extensão. Sem forma de pagamento, sem código de ativação.
- **Veja seu tempo quando quiser**: as horas restantes aparecem no topo do pop-up da extensão e na página de Configurações.
- **Uma transição tranquila no final**: depois de 3 dias, a extensão volta para a versão gratuita. **Todos os dados, notas e configurações criados durante o teste ficam guardados no seu dispositivo.** Se ela realmente ajudou no seu dia a dia, vamos ficar felizes com o seu apoio comprando uma licença. Se algo pareceu estranho, também adoraríamos ouvir suas sugestões.

*(Se você já tem uma licença paga do Power Pack, nada muda. Tudo continua funcionando como antes.)*

---

## 🌐 O que o novo Web Agent pode fazer por você?

Resumindo, o Web Agent é como uma assistente de IA sentada ao seu lado. Ele roda direto na barra lateral do navegador, entende o que você está vendo na página atual e executa ações conforme as suas instruções.

**Usos comuns:**
* **Extrair e organizar informações**: transforme dados espalhados numa página longa em uma tabela organizada.
* **Preencher formulários passo a passo**: preencha campo por campo seguindo as suas instruções.
* **Trabalhar entre páginas**: alterne entre abas do mesmo site para comparar, ou pesquise direto na caixa de busca do próprio site em vez de sair buscando por fora.

### Como começar
1. **Instale a pequena extensão complementar**: o Web Agent funciona junto com a **[Better Sidebar Web Agent Connector](https://chromewebstore.google.com/detail/dmogbaiecikhmldgdpapobncijaoeamc)**.
   > **Por que uma segunda extensão?**
   > Pela sua segurança. A permissão de depuração de baixo nível necessária para controlar páginas fica isolada nessa extensão separada, então o Better Sidebar nunca tem essa permissão de alto risco. O conector também foi feito para **responder apenas a comandos do Better Sidebar**, então nada mais consegue usá-lo.
2. **Dê permissão na primeira vez**: ao iniciar pela primeira vez, você verá um aviso detalhado de riscos. Leia com atenção antes de concordar (você pode desativar quando quiser nas Configurações).
3. **Passe uma tarefa**: digite `>Web` seguido do seu pedido no campo de chat da barra lateral.
4. **Requisitos**: por enquanto, apenas Google Chrome.

---

## ⚠️ [Leia, por favor] Segurança e isenção de responsabilidade do Web Agent

Preferimos ser francos desde o início. O Web Agent é uma ferramenta afiada: poderosa, mas com riscos reais que não devem ser ignorados. Reserve um minuto para entender o seguinte antes de usar:

- **⚠️ Ele age como você, com as suas contas conectadas**:
  O Web Agent roda no seu navegador real e usa as contas em que você está conectado. Isso significa que formulários enviados, mensagens e até compras em que ele clicar parecem para o site **exatamente ações feitas por você**. Algumas ações não podem ser desfeitas depois de enviadas.
- **⚠️ Parte do conteúdo visível da página é enviada à IA**:
  Para entender uma página, o texto, os links e a estrutura de formulários que ele lê são enviados como contexto ao modelo Gemini (um serviço do Google). Fique tranquilo: **o conteúdo dos campos de senha (type="password") é protegido e nunca é lido**.
- **⚠️ Cuidado com injeção de prompt vinda de páginas maliciosas**:
  A web é um lugar bagunçado. Algumas páginas maliciosas podem esconder instruções voltadas a modelos de IA para tentar levá-la a fazer coisas que você não pediu. **Tenha cuidado redobrado em sites que você não conhece.**
- **🚫 Nunca use em páginas muito sensíveis**:
  **Não use** o Web Agent em internet banking, pagamentos reais, prontuários médicos pessoais ou páginas de segurança da conta e troca de senha.
- **👀 A IA não é totalmente confiável, então fique por perto**:
  O modelo pode entender errado o que um botão faz, ou interpretar mal a estrutura de uma página. Por isso há uma trava de segurança: **cada clique, cada texto digitado e cada script que altera a página para e espera você conferir e aprovar antes de ser executado.** Fique em frente à tela enquanto ele trabalha.
- **🛑 Uma parada de emergência está sempre disponível**:
  Enquanto o Web Agent controla uma página, o Chrome mostra no topo uma barra do sistema dizendo que o navegador está sendo depurado (por exemplo, `"começou a depurar este navegador"`). Se a IA agir de forma estranha, clique em **Cancelar** nessa barra, ou **feche o chat atual na barra lateral**, e toda a automação é interrompida na hora.
- **📄 Responsabilidade e termos**:
  Você é responsável pelo resultado de cada passo que confirmar, e pedimos que siga os termos de serviço dos sites que visitar. O Better Sidebar é fornecido "no estado em que se encontra" e não se responsabiliza por consequências diretas ou indiretas de ações executadas após a sua confirmação.

Esses termos podem soar um pouco duros e sérios, mas ser honestos com você e deixar os riscos bem claros é o mínimo que devemos a cada usuário.

---

## 📁 Gems e cadernos: finalmente, pastas

Conforme as coleções de Gems e cadernos cresciam, muita gente nos disse que estava difícil se achar. Agora organizar ficou bem mais fácil:

- **Árvore de pastas**: crie pastas aninhadas, renomeie e fixe as que você mais usa.
- **Arraste para reordenar**: arraste um Gem ou caderno para qualquer pasta e use a nova visualização "Ordem personalizada" para deixar tudo do seu jeito.
- **Os seletores seguem as suas pastas**: diálogos de seleção e menus suspensos da extensão mostram tudo na mesma árvore de pastas, então fica fácil achar o que você precisa.
- **Proteção contra exclusões acidentais**: só pastas vazias podem ser excluídas, então um descuido não apaga um grupo inteiro.

---

## 🪟 Um esboço flutuante melhor

- **Some quando você tira o mouse**: alguns segundos depois que o mouse sai do esboço, ele se recolhe em uma pequena barra de título e deixa a tela para a sua conversa. Passe o mouse na barra de título e ele abre de novo na hora.
- **Fixe aberto**: está lendo algo longo e quer que o esboço fique ali? Clique no ícone de alfinete na barra de título para mantê-lo aberto.
- **Um atalho mais prático**: ao expandir a barra de rolagem de pontos à direita, há um botão novo no topo que abre o esboço flutuante com um clique.

---

## 🐛 Correções e ajustes

- **Chats do Gemini sincronizando de novo**: nos adaptamos rapidamente ao redesign que o Gemini lançou em 21 de outubro, e novos chats e respostas voltam a sincronizar com a barra lateral de forma confiável.
- **Botões de salvar e gaveta do AI Studio**:
  - Corrigido o botão de salvar trechos ficando cortado com a barra lateral expandida ou a área de chat estreita.
  - Removido um botão que não respondia e aparecia no balão de "Processo de pensamento" (Thinking Process) da IA. O botão de salvar agora fica sempre no topo de cada resposta.
  - Corrigido o caso em que arrastar um item salvo não abria a gaveta de pastas com a barra lateral recolhida.
- **Animação mais suave da barra lateral do AI Studio**: a animação de expandir e recolher foi refeita, sem mais quedas de quadros e travadas.
- **Aviso de atualização que não fechava**: depois que a extensão se atualizava em silêncio numa aba em segundo plano, o aviso na página ativa às vezes não podia ser clicado nem fechado. Isso foi corrigido.
- **Uma redefinição de dados mais completa**: "Redefinir dados" nas Configurações às vezes deixava para trás metadados de cadernos e trechos, o que causava erros de sincronização logo depois. Agora a redefinição apaga tudo de verdade, igual a uma instalação nova.
- **Traduções completadas**: os 12 idiomas incluídos foram revisados, textos que faltavam foram adicionados e várias traduções automáticas estranhas foram corrigidas.
- **Outros detalhes**:
  - O guia para novos usuários agora inclui passos sobre Agents, trechos, cadernos e Spark.
  - As dicas (tooltips) agora vão para o outro lado quando falta espaço perto da borda da tela, e as dicas muito longas do esboço têm altura máxima para não sair da tela.

---

O Web Agent é um passo importante para nós rumo aos agentes de navegador, e ainda está no início do teste público. Com tantos sites diferentes e complexos por aí, certamente há casos que ainda não cobrimos. Se você notar um comportamento estranho em alguma página, ou tiver ideias sobre recursos ou segurança, vamos adorar ouvir você na nossa comunidade:

👉 **Junte-se a nós no Discord**: [Entrar na comunidade do Discord](https://discord.gg/FRzesxaGAx)

Obrigado por nos acompanhar até aqui, e por todo o feedback e apoio ☕

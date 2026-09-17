# Atualização 2.11.0: Paleta de Comandos Cmd+K, Sincronização Silenciosa e Browser Agent!

Olá a todos! 👋

Embora este ciclo de desenvolvimento tenha sido relativamente curto, ele traz recursos muito aguardados que elevam a velocidade de trabalho e a autonomia da IA a outro patamar. Temos certeza de que vocês vão adorar!

---

## ⚡ TL;DR (Destaques da Versão)

1. **🔄 Sincronização Silenciosa em Segundo Plano**: Chega de abrir conversa por conversa para criar índices. Busca de texto completo real e transparente entre dispositivos.
2. **⌨️ Paleta de Comandos Cmd+K**: Painel de ações rápidas no estilo Raycast. Busque no histórico, no conteúdo das mensagens e execute ações sem tirar a mão do teclado.
3. **🧩 Barra de Ícones Lateral Personalizável**: Oculte ícones que você não usa e reorganize a ordem arrastando e soltando livremente.
4. **🤖 Browser Agent (Experimental)**: Deduplicação e agrupamento inteligente de abas, além de faxina profunda nos favoritos. Instantâneos automáticos com reversão em um clique.
5. **🎨 Criação de Temas em Tempo Real com BetterSidebar Agent**: Descreva o visual com suas próprias palavras e o agente cria e aplica o tema na hora.
6. **🛠️ Correções e Polimento**: Ajuste no expandir/recolher do AI Studio, correção de destino de pastas em novos chats e alívio de saturação no tema Retro Terminal.

---

## 🔥 Novidades em Detalhes

### 1. 🔄 Sincronização Silenciosa de Mensagens em Segundo Plano

- **O problema antigo**: Anteriormente, a extensão só indexava mensagens quando você abria manualmente uma conversa. Ao alternar entre computadores ou navegadores, as buscas muitas vezes falhavam porque os chats antigos não tinham sido visitados localmente.
- **Indexação em segundo plano**: Agora o Better Sidebar pode buscar silenciosamente os históricos de conversas para completar o índice de busca local.
- **Segurança e limitação de taxa**: Para evitar excesso de requisições e proteger sua conta contra bloqueios da API do Google (Rate Limit), essa função vem **desativada por padrão**. Você pode ativá-la nas Configurações, onde ela atuará em um ritmo suave e controlado.
- **Painel de status da sincronização**: Criamos uma janela dedicada onde você vê claramente quais conversas já foram indexadas e quais estão pendentes, permitindo forçar a sincronização de um chat específico com apenas um clique.

### 2. ⌨️ Cmd+K Command Palette: Fluxo 100% pelo Teclado

Com a indexação completa de mensagens, a paleta de comandos ganha seu verdadeiro poder:
- **Acesso instantâneo**: Pressione **`Cmd + K`** (ou **`Ctrl + K`** no Windows) em qualquer tela para abrir a barra central.
- **Busca unificada e multidimensional**:
  - Títulos e descrições de conversas;
  - Texto completo do histórico das mensagens;
  - Ações rápidas e ferramentas da extensão.
- **Adeus ao mouse**: Use as setas para navegar e Enter para pular ou executar. Feito sob medida para quem preza por agilidade máxima.

### 3. 🧩 Barra de Ícones Lateral Totalmente Customizável

À medida que o Better Sidebar ganha novas ferramentas, alguns usuários nos pediram uma interface mais minimalista:
- **Exibir ou ocultar**: Você pode escolher exatamente quais ícones de funções aparecem na barra vertical esquerda. Oculte o que não usa e mantenha seu foco limpo.
- **Arrastar para ordenar**: Reorganize a posição dos ícones para deixar as ferramentas mais frequentes exatamente onde sua memória muscular espera.

### 4. 🤖 Browser Agent: A IA cuidando do seu navegador (Experimental)

Pensamos: se a IA pode processar dados e gerar código, por que não pode nos ajudar a colocar ordem na bagunça do nosso navegador diário?
Se você é do tipo que acumula dezenas de abas abertas até não conseguir mais ler os títulos, ou tem uma barra de favoritos com anos de links duplicados ou quebrados, o Browser Agent é para você:
- **Faxina nas abas**: Detecta e remove abas duplicadas (mantendo apenas uma cópia de cada endereço) e cria grupos inteligentes por assunto.
- **Limpeza profunda de favoritos**: Reorganiza pastas caóticas, consolida diretórios repetidos e ajuda a identificar links inativos.
- **Instantâneos e reversão em um clique**: **A segurança dos seus dados vem sempre em primeiro lugar.** Antes de qualquer alteração, o agente salva automaticamente uma cópia do estado do navegador. Se não gostar do resultado, basta **reverter para o estado anterior com um clique**, com risco zero de perda. (*Dica: Se quiser uma camada extra de tranquilidade, você também pode exportar manualmente um arquivo HTML de backup direto do Gerenciador de Favoritos do Chrome.*)

### 5. 🎨 Criação de Temas em Tempo Real com BetterSidebar Agent

Antes, criar um tema personalizado era cansativo: copiar o prompt -> gerar com outra IA -> copiar o JSON -> colar manualmente nas configurações.
- Agora, basta pedir ao BetterSidebar Agent no chat:
  > *«Crie um tema cyberpunk estilo Matrix com fundo escuro e verde neon»* ou *«Faça uma paleta suave e discreta em tons de chá com leite»*
- O agente gera as cores e **aplica o tema imediatamente**!
- Quer ajustar algo? É só responder: *«Deixe o fundo um pouco mais escuro e a borda da caixa de texto mais visível»*. O tema é ajustado em tempo real. Mude de visual todo dia de acordo com seu humor!

---

## 🛠️ Correções de Bugs e Melhorias

1. **Ajuste no Expandir/Recolher do AI Studio**: Corrigido o botão de recolher da barra lateral após as recentes alterações na estrutura DOM da interface do Google AI Studio.
2. **Roteamento de pastas ao criar novos chats**: Solucionado o bug em que novas conversas iam parar teimosamente na pasta «Inbox», mesmo com outra pasta selecionada.
3. **Calibração do tema Retro Terminal**: Reduzida a saturação excessiva das cores para oferecer um contraste mais suave e confortável para os olhos em sessões longas.

---

Agradecemos imensamente pelo apoio contínuo e pelo carinho de sempre! Se encontrar algum problema ou tiver sugestões, fale com a gente a qualquer momento. Aproveite a nova versão! 🎉

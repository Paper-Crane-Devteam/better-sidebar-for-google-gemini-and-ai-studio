# Atualização 2.13.0: busca que leva você à mensagem, um sumário flutuante e uma barra lateral mais tranquila

Olá, amigos 👋

O Gemini lançou um novo layout há pouco tempo, e boa parte desta versão foi dedicada a acompanhar essa mudança. No caminho, adicionei algumas coisas que eu queria fazer havia um tempo, principalmente para ajudar você a se orientar em conversas longas.

---

## 🎁 Um pequeno presente pelo Gemini Argon

Para comemorar o novo modelo Argon do Gemini, preparei um código de resgate que libera **todos os recursos do Power Pack gratuitamente por 10 dias**.

- **Onde pegar**: o código está no canal de promoções do nosso **[Discord](https://discord.gg/FRzesxaGAx)**.
- **Até quando**: você pode resgatá-lo a qualquer momento até **21 de outubro**.

Se tiver qualquer dificuldade para usar, ou ideias que queira compartilhar, fique à vontade para me procurar no Discord também.

---

## ⚡ Resumo

1. **🎯 Vá direto à mensagem correspondente**: ao abrir um resultado de busca, agora a página rola até a mensagem exata, não apenas até o chat.
2. **🔣 Busca com expressões regulares**: um novo modo de busca para quando palavras-chave simples não são precisas o bastante.
3. **🪟 Sumário flutuante**: destaque o sumário em um painel que você pode arrastar e redimensionar.
4. **🧭 Navegação melhor no AI Studio**: os saltos pelo sumário e a barra de rolagem de pontos agora funcionam lá também.
5. **🔐 Correção para várias contas**: dados de contas Google diferentes não se misturam mais.
6. **🧩 Adaptado ao novo layout do Gemini**: controles de largura, ocultação automática do campo de entrada e temas voltaram a funcionar.

---

## 🔥 Um pouco mais sobre os destaques

### 🎯 Os resultados de busca levam você à mensagem

Antes, abrir um resultado de busca apenas abria o chat, e você ainda precisava rolar para encontrar o trecho que procurava. Em uma conversa longa, isso podia demorar.

Agora, no Gemini, a página rola até a mensagem que correspondeu. Se essa mensagem estiver mais atrás, os turnos anteriores são carregados primeiro. A mensagem pulsa rapidamente para você localizá-la, e os termos buscados ficam destacados nela.

### 🔣 Busca com expressões regulares

Para quem gosta de buscas mais precisas, agora existe um modo de expressões regulares. Ele é útil para encontrar, por exemplo, um certo padrão de código de erro, ou uma frase exata com alguma variação. Para manter tudo ágil, são exibidas até 500 correspondências.

### 🪟 Um sumário flutuante

Agora você pode destacar o sumário da barra lateral em um painel flutuante, arrastá-lo para onde quiser e redimensioná-lo. É prático quando a barra lateral está fechada, ou quando você só quer o sumário ao lado da conversa.

Também simplifiquei a aparência do sumário: os ícones de títulos e os números antes de cada mensagem foram removidos, e os níveis de título agora são indicados pelo tamanho e pelo peso da fonte. A leitura ficou bem mais calma.

### 🧭 O AI Studio ganha saltos pelo sumário e a barra de pontos

Clicar em um item do sumário no AI Studio agora leva você até aquela mensagem. A barra de rolagem de pontos do Gemini (um ponto para cada mensagem que você enviou) também está disponível no AI Studio. Enquanto estiver ativada, ela substitui a barra de rolagem nativa do AI Studio para que as duas não se sobreponham.

---

## 🐛 Correções

- **Dados misturados entre contas Google**: se você usava várias contas Google em abas diferentes ao mesmo tempo, alguns dados podiam acabar salvos na conta errada. Foi um erro meu, e peço desculpas por isso. Agora cada aba fica com os dados da própria conta, e a sincronização em segundo plano não passa mais de uma conta para outra.
- **Chats do AI Studio pulando para o topo**: antes, apenas abrir um chat do AI Studio já contava como atividade, então ele ia para o topo da lista. Agora isso só acontece quando você realmente edita ou cria um chat.
- **Datas erradas nos resultados de busca do AI Studio**: mensagens de chats antigos do AI Studio às vezes recebiam a data da sincronização, e chats antigos apareciam como novos. Isso foi corrigido, e os dados existentes são reparados automaticamente.
- **Respostas do agente em segundo plano no AI Studio**: se você mudasse para outra aba enquanto o agente esperava uma resposta, ele podia esgotar o tempo e informar que a mensagem não foi entregue, mesmo com a resposta já lá. Agora ele espera corretamente enquanto a aba está em segundo plano.
- **Chats do Gemini abrindo no início**: abrir um chat pela barra lateral às vezes deixava você no começo, em vez da mensagem mais recente. Agora ele abre na mensagem mais recente, como esperado.
- **Abrir um Gem a partir de um chat**: abrir um Gem com um chat aberto podia deixar o chat antigo na tela. Agora a troca acontece de forma limpa.
- **Formatação de código inline**: o código inline nas respostas não mostra mais crases extras ao redor.

---

## 🧩 Acompanhando o novo layout do Gemini

- **Os controles de largura do chat e do campo de entrada** voltaram a funcionar.
- **As tabelas agora seguem a largura do chat**, então a opção separada "Largura automática de tabelas" não é mais necessária e foi removida.
- **A ocultação automática do campo de entrada** funciona com a nova área de entrada.
- **Deep Research e Canvas** não ficam mais espremidos por uma largura mínima forçada do chat.
- **Os temas** agora também cobrem o brilho ao redor do campo de entrada de novo chat, então não aparece mais uma mancha escura em alguns temas escuros.
- **"Remover marca d'água automaticamente" está desativado e oculto por enquanto**: o Gemini agora tem a própria configuração de marca d'água, e em conjunto com ela, nossa remoção podia deixar uma marca invertida leve em imagens que já estavam limpas. Desativar pareceu a opção mais segura.

---

## 🎨 Pequenos detalhes

- **Ícones mais discretos**: a barra de ícones e os ícones de ação nos cabeçalhos das abas agora ficam um pouco mais apagados quando ociosos, e voltam à cor total ao passar o mouse. A barra lateral parece menos carregada assim.
- **Menus fecham na hora**: os menus suspensos e de clique com o botão direito não exibem mais animação ao fechar.
- **Espaço de trabalho**: o estado vazio agora tem a opção "Importar pasta".
- **Um pequeno selo de agradecimento**: se você tem um Support Pack ou Power Pack, o pop-up agora mostra um pequeno selo ao lado do título. É meu jeito discreto de dizer obrigado. O avatar de todos na barra lateral também ganhou um novo contorno suave.

---

Por esta rodada é isso. Como o layout do Gemini ainda está mudando, pode haver pontos que eu ainda não percebi. Se algo parecer estranho, por favor me avise e eu vou dar uma olhada. Obrigado por estar aqui ☕

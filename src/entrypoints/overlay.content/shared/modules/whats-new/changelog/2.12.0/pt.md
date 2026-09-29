# Atualização 2.12.0: Tags que finalmente abrem, "Continuar em novo chat" e um Browser Agent mais tranquilo

Oi, pessoal 👋

Esta é uma versão pequena, mais de "aparar as arestas". Depois que a 2.11.0 saiu, continuei usando tudo todos os dias, e alguns detalhes ficaram me incomodando. Então aqui estão, já ajeitados.

---

## ⚡ TL;DR

1. **🏷️ Tags que dá para abrir**: Clique em uma tag para ver todos os chats com ela, e troque de tag, pesquise, adicione ou remova tags ali mesmo.
2. **🔀 Continuar em novo chat**: Quando um chat fica longo demais, o BetterSidebar Agent pode resumi-lo e abrir um chat novo com o resumo esperando na caixa de texto.
3. **✨ Atalhos de início para os agentes**: Escolha um agente com `>` e aparece uma fileira de botões mostrando o que ele sabe fazer.
4. **🛡️ Permissões mais finas no Browser Agent**: Abas e favoritos agora têm chaves separadas, e o agente finalmente enxerga todas as suas janelas.
5. **📚 "Arquivos" agora é "Biblioteca"**: Novo nome para a aba que guarda todos os seus chats. Nada mudou lá dentro.
6. **🐛 Correção no login do AI Studio**: Chega do aviso de "conta não detectada" quando você já estava logado.

---

## 🔥 Um pouco mais sobre o que vale a pena

### 🏷️ Tags que finalmente abrem

Para ser sincero, a aba de Tags era meio que um beco sem saída. Você via suas tags, mas clicar não fazia nada, então elas pareciam mais enfeite do que ferramenta.

Agora, ao clicar em uma tag, abre a lista de todos os chats marcados com ela. Dali você pode:

- **Trocar de tag** pelo cabeçalho, sem voltar para a lista.
- **Pesquisar dentro da tag** quando ela tem muitos chats.
- **Remover um chat da tag** com um clique, ou clicar com o botão direito para adicionar ou remover outras tags, favoritar e mais.
- **Mostrar na Biblioteca** para ir direto à pasta onde esses chats estão.

Finalmente as tags servem para encontrar coisas, não só para rotulá-las.

### 🔀 Continuar em novo chat

Você provavelmente conhece essa sensação: uma conversa fica tão longa que o modelo começa a perder o fio, e recomeçar significa digitar todo o contexto de novo.

Agora é só dizer ao BetterSidebar Agent (também tem um botão de atalho): *"Resuma este chat e continue em um novo chat."* Ele escreve uma passagem de bastão com o que você quer fazer, o que foi decidido e por quê, e o que ainda está em aberto. Depois abre um chat novo em uma aba logo ao lado da atual, com esse resumo esperando na caixa de texto.

Algumas coisas que eu fiz questão aqui:

- **Nada é enviado sozinho.** O resumo só fica na caixa de texto, para você ler e editar antes.
- **Ele pergunta antes de abrir a aba**, sempre.
- **Mesma conta.** Se você está logado em várias contas Google, o chat novo abre na que você está usando agora.
- **O chat antigo continua aberto**, caso o resumo tenha deixado algo de fora.

### ✨ Atalhos de início: saiba o que um agente faz assim que você o escolhe

Depois de digitar `>` e escolher um agente, muitas vezes eu ficava olhando o cursor piscando pensando "Tá… e o que eu peço?". Então agora aparece uma pequena fileira de botões acima da caixa de texto, por exemplo:

- **BetterSidebar Agent**: Organizar chats, Encontrar chats, Marcar chats, Criar um tema, Continuar em novo chat…
- **Workspace Agent**: Resumir um arquivo, Analisar uma planilha, Salvar chat como nota…
- **Browser Agent**: Agrupar abas, Encontrar duplicadas, Salvar esta janela…

Clique em um e ele coloca uma frase curta pela metade, como *"Encontre conversas sobre "*, para você só completar. Os botões saem de cena assim que você começa a digitar. É um empurrãozinho, não um roteiro.

### 🛡️ Browser Agent: permissões mais finas e todas as suas janelas

**Chaves separadas para abas e favoritos.** Antes as permissões eram só "organizar" e "excluir", valendo para abas e favoritos juntos. Algumas pessoas me contaram que não se importam de deixar a IA arrumar as abas, mas preferem que ela nunca mexa nos favoritos, e isso faz todo o sentido. Agora são quatro chaves nas configurações do Browser Agent: Organizar abas, Fechar abas, Organizar favoritos e Excluir favoritos. Ligue só o que te deixar tranquilo.

**Agora ele enxerga todas as janelas.** Isso era um bug meu. O Browser Agent só olhava a janela da conversa, então se suas abas estavam espalhadas em três janelas (as minhas quase sempre estão 😅), "feche as duplicadas" deixava a maioria de fora. Agora ele passa por todas antes de decidir o que é duplicado e avisa em qual janela cada mudança acontece. E se você usa o Gemini como app instalado em janela própria, o agente também entende isso e trabalha nas suas janelas normais do navegador.

---

## 🛠️ Pequenos ajustes e correções

- **"Arquivos" agora é "Biblioteca"**: "Arquivos" sempre soou meio estranho para conversas, e "Biblioteca" combina melhor. A lista de tags também perdeu os iconezinhos da frente, então os nomes ganham mais espaço.
- **Detecção de conta no AI Studio**: Depois do redesign recente do AI Studio, algumas pessoas viam o aviso de "conta não detectada" mesmo estando logadas. Desculpe pelo incômodo. Já está corrigido.

---

Por esta rodada é isso. Pouca coisa, mas espero que deixe o dia a dia um pouco mais tranquilo. Como sempre, se algo parecer estranho ou você tiver uma ideia, vou adorar saber. Obrigado por estar aqui ☕

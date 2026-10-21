# 🔧 v2.13.2 — Biblioteca de prompts nas caixas de instruções e correção do registro no Gemini
Uma pequena atualização depois da 2.13.1: um recurso novo, algumas correções e uma prévia do que vem por aí.
## ✨ Novidades
*   **📚 Use sua biblioteca de prompts nas caixas de instruções:** O editor de Gems, as configurações do Notebook e as instruções do sistema do AI Studio agora têm um menu **Prompts**. Você pode pesquisar ou navegar pelas pastas, preencher variáveis e adicionar um prompt (com um aviso para desfazer, caso mude de ideia). Ao lado do menu aparece uma prévia do prompt completo. Também há um botão **Salvar como prompt**, e `/` funciona nessas caixas.
*   **🔀 Instruções do sistema no AI Studio:** Você pode alternar entre a lista do próprio AI Studio e sua biblioteca do Better Sidebar. Na primeira vez, suas instruções salvas no AI Studio são importadas uma única vez, sem duplicatas. No modo biblioteca, a extensão só escreve em uma entrada dedicada "⚡ Better Sidebar", então suas outras instruções ficam intactas.
## 🐞 Correções
*   **💬 Chats novos do Gemini não eram salvos:** Em 20 de outubro o Gemini mudou de novo a forma de enviar mensagens, e chats e respostas novos pararam de chegar à barra lateral. Agora voltam a ser registrados.
*   **✏️ Renomeações no AI Studio sendo desfeitas:** Um chat renomeado pela barra lateral podia voltar ao título antigo após a próxima resposta. Agora o novo nome permanece.
*   **🪟 Menus escondidos atrás dos painéis do AI Studio:** Popovers, diálogos, avisos e dicas podiam ficar atrás das gavetas laterais do AI Studio. Agora ficam sempre por cima.
*   **🖱 Menu de contexto piscando:** O menu do clique direito podia aparecer por um instante no lugar errado antes de pular para o ponteiro. Agora ele abre exatamente onde você clica.
*   **🔍 Destaques faltando na prévia da busca:** Buscas com Markdown (como `**negrito**`) ou expressões regulares que atravessam a formatação encontravam resultados, mas não os destacavam na prévia. Agora destacam.
*   **💾 Download do backup do banco de dados bloqueado:** O Chrome às vezes bloqueava o download do arquivo de backup. Agora, depois de exportar, um aviso espera você clicar para baixar.
*   **🧭 Cursor do sumário:** Só os itens que podem ser expandidos mostram o cursor de ponteiro agora.
## 🔭 Em breve: Web Agent
Tenho trabalhado em um **Web Agent** que deixa a IA trabalhar em páginas da web por você a partir do painel lateral do Chrome: ler uma página, clicar, digitar e alternar entre abas, enquanto você pode acompanhar e parar a qualquer momento. Ele funciona por meio de uma pequena extensão complementar, **Better Sidebar Web Agent Connector**, que ainda aguarda a revisão da Chrome Web Store, então o recurso está oculto por enquanto. Vou ativá-lo assim que for aprovado e espero que você goste.
Se algo parecer estranho, me avise. Obrigado ☕

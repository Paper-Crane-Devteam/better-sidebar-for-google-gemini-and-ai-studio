# 🔧 v2.13.1 — Acompanhando as mudanças internas do Gemini

Logo depois que a 2.13.0 saiu, o Gemini mudou a forma como a página se comunica com os servidores. Na tela nada parecia diferente, mas o formato usado para enviar mensagens novas e listas de chats tinha mudado. Por isso, durante um tempo, chats e mensagens novos deixaram de ser salvos na barra lateral sem nenhum aviso. Desculpe pelo transtorno. Esta atualização é principalmente para colocar isso em dia.

## 🐞 Correções
*   **💬 Chats e mensagens novos voltam a ser salvos:** A extensão agora entende o novo formato do Gemini, então conversas, respostas e títulos novos aparecem na barra lateral como antes.
*   **🔄 Lista de chats, renomeações e exclusões voltam a sincronizar:** Renomear ou excluir um chat, além das suas listas de Gems e cadernos, são capturados corretamente de novo.
*   **💎 Lista de Gems mais precisa:** Agora a lista de Gems é sincronizada por inteiro, em vez de ser deduzida a cada carregamento de página. Gems que não mudaram não aparecem mais como "atualizados" sem motivo.
*   **👥 Sincronização em segundo plano em outras contas Google:** Em abas com uma segunda conta (as que têm `/u/1` ou parecido no endereço), a sincronização pedia os chats da conta errada e falhava. Agora usa a conta da própria aba. E um chat que não carrega não trava mais o resto da fila.
*   **⌨️ Ocultar automaticamente a caixa de texto:** Refeito para entrar e sair de forma mais confiável, sem ficar preso pela metade.
*   **📐 Botões de ação abaixo das respostas:** Ao alargar o chat, os botões abaixo de cada resposta continuam alinhados à esquerda.
*   **✏️ Gems não são mais renomeados pela barra lateral:** Os nomes dos Gems vêm do próprio Gemini, então apertar F2 em um Gem não abre mais um campo de edição que não salvava nada.

## 🧭 AI Studio
*   **A barra de pontos acompanha a troca de chats:** Antes ela continuava mostrando o chat anterior até recarregar. Agora atualiza quando você troca de chat.
*   **Não cobre mais o texto:** A barra agora tem seu próprio espaço à direita do chat e não fica por cima das mensagens, com o painel de configurações aberto ou fechado.
*   **Um visual mais compacto:** Menor e com cantos arredondados no estilo do AI Studio.

## 🎨 Pequenos detalhes
*   **Página Sobre:** As informações de versão agora ficam em um cartão mais organizado, com a verificação de atualizações no rodapé.

O Gemini ainda está mudando coisas por dentro, então se algo parar de salvar ou sincronizar, me avise que eu vejo rapidinho ☕

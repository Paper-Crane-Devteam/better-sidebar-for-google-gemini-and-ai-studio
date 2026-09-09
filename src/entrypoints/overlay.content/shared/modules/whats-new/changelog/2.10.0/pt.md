# Atualização 2.10.0: Chegada do Workspace Agent e várias melhorias para o seu conforto

Olá velhos amigos, é hora de mais um relatório de progresso.

Tenho virado noites trabalhando na versão 2.10.0. Desta vez, não só resolvi várias daquelas dores de cabeça antigas que vocês vêm relatando, como também lancei algo "grande" — o Workspace Agent. Este é provavelmente um passo crucial na nossa jornada para nos tornarmos um "monstro da produtividade", então vamos conversar sobre isso.

---

## 🎁 Primeiro, as melhorias na versão base para todo mundo

No uso diário, a conveniência é o mais importante. Desta vez coloquei várias pequenas otimizações na versão base para aumentar a sua felicidade, só para garantir que o uso seja sem estresse:

*   **O AI Studio também ganhou "Conversas Temporárias"**: Alguns amigos reclamaram que, às vezes, só querem testar umas perguntas de leve e não querem deixar rastros. Pronto, tá na mão! As novas conversas não serão salvas na árvore de arquivos (mas, pra ser sincero, o AI Studio Drive ainda as salva; nós apenas simulamos a experiência temporária no frontend). Aproveitei e consertei um bug pequeno onde as conversas temporárias no Gemini ficavam criando entradas aleatórias nas pastas.
*   **"Modo Compacto" com a interface limpinha**: Se você, como eu, quer sumir com todos os botões extras da tela na hora de trabalhar, agora você pode esconder completamente a barra de ícones lateral! A interface fica super limpa na hora, a carga cognitiva cai pela metade; perfeito para focar no trabalho.
*   **Mouse e atalhos mais ágeis**: O botão de "New chat" agora aceita o clique do botão do meio do mouse; um clique e abre a conversa numa nova aba. Além disso, a memória muscular agradece: finalmente adicionamos o F2 para renomear e a tecla Delete para apagar arquivos.
*   **Encontrar pastas num piscar de olhos**: Adicionada uma função de busca no pop-up de seleção de pastas. Não importa quantos arquivos você tenha, você consegue achar em um segundo, sem precisar ficar procurando às cegas.
*   **Conserto de um Bug chatinho**: Consertado o problema onde, ao fazer branch chat no Gemini, a barra de rolagem da direita (smartscrollbar) às vezes ficava maluca e fora de ordem.

---

## 🔥 O Prato Principal: Workspace Agent (Deixe a IA trabalhar direto pra você)

Essa é, de longe, a função que mais me empolga nessa atualização! Eu sempre achei que só bater papo não era o suficiente; a IA devia conseguir, de fato, fazer o trabalho por mim. E assim, chegou o Workspace Agent!

**Como usar? Super simples:** Ele fica lado a lado com o BetterSidebar Agent de sempre. Você só precisa digitar o símbolo `>` na caixa de texto para acionar o Workspace Agent. Você pode arrastar seus arquivos locais para o espaço de trabalho para que ele trabalhe neles; **ou melhor ainda: não precisa fazer upload de nada, pode pedir para a IA criar novos arquivos do zero!**

Seja para ajustar arquivos existentes ou para criar projetos do nada, ele resolve tudo numa boa. **O que ele pode fazer afinal? Deixe-me dar alguns exemplos reais:**

*   **📝 O salva-vidas de Teses/Relatórios (Suporta Word `.docx`)**
    Você pode arrastar as suas 50 páginas de `thesis.docx` pra lá e pedir pra IA dar uma polida num parágrafo específico. E aqui vai o ponto chave: ele **não vai substituir o seu arquivo original na brutalidade**. Ele age como um orientador, adicionando **comentários** onde há problemas, ou usando o modo de **Revisão** (Tracked Changes) pra reescrever pra você. A formatação que você suou pra arrumar e as suas referências não vão bagunçar nem um pouco, você só precisa ir no Word e clicar em "Aceitar/Rejeitar".
*   **📊 Mestre do Processamento de Dados (Suporta Excel `.xlsx` / `.csv`)**
    Joga o `data.xlsx` pra ele e pede pra fazer uma análise estatística. Ele não só entende os cabeçalhos das suas colunas, como é inteligente o suficiente para **inserir novas colunas na sua tabela e escrever fórmulas reais do Excel**, em vez de apenas jogar um monte de números estáticos lá. Os gráficos e a formatação condicional da sua tabela original não sofrem o menor impacto.
*   **🎬 A alegria dos criadores de vídeo (Suporta Legendas `.srt`, `.vtt`, `.ass`)**
    Você pode pedir pra ele traduzir ou dar um trato no seu arquivo de legendas. O mais incrível é que ele sabe que a linha do tempo não pode ser tocada; depois de traduzir, **a linha do tempo não será destruída nem por um milissegundo**, você nunca mais vai precisar se preocupar se a legenda perdeu a sincronia labial.
*   **📚 Revisão e Anotação de Literatura (Suporta PDF)**
    Arraste um PDF e, embora ele não possa editar o texto principal diretamente devido às limitações do formato, ele pode ajudar a extrair informações e até mesmo **destacar pontos importantes e adicionar notas adesivas** diretamente no PDF para você.
*   **🪧 Ajudante de Apresentações (Suporta PPT `.pptx`)**
    Suporta ler o conteúdo dos slides, substituir textos, modificar notas do orador e até mesmo ajudar a reorganizar a ordem dos slides.
*   **💻 O favorito de Programadores e Escritores: Não apenas edita, cria do zero! (Suporta texto puro, `.md` e todos os arquivos de código)**
    É aqui que muitos se enganam — **não ache que você precisa obrigatoriamente enviar um arquivo antes de a IA poder fazer algo!**
    Para todos os arquivos de texto e código (HTML, CSS, JS/TS, Python, Markdown, etc.), a IA não só faz edições e refatorações cirúrgicas, **como pode criar novos projetos do zero absoluto**. Por exemplo, basta pedir: "Crie um app completo de tarefas em React do zero", e ele criará o HTML, arquivos de componentes, folhas de estilo e configurações direto no workspace. Um projeto frontend completo montado em minutos!

**Percebeu? A maior vantagem dele é: não bagunçar a sua formatação!** Graças ao suporte subjacente especializado em formatos de documentos, não importa se ele está editando um Word ou um Excel, os estilos originais são protegidos perfeitamente. É assim que uma ferramenta de produtividade de verdade deve ser.

*   **Sobre os limites de suporte de formatos**: Arquivos de texto e código podem ser criados do zero e editados livremente. Formatos compostos e complexos (Word, Excel, PPT, PDF) atualmente focam em **ler, anotar e modificar com precisão arquivos já existentes** (garantindo que o layout, gráficos e fórmulas continuem impecáveis); a criação do zero desses formatos binários ainda não é suportada.
*   **Um pequeno arrependimento e uma promessa**: Devido às limitações do ambiente das extensões de navegador, para lidar com documentos Word ou Excel existentes é necessário arrastá-los para o workspace; além disso, a pré-visualização rica na barra lateral ainda não está disponível (os arquivos podem ser baixados ou visualizados externamente). Eu anotei esses inconvenientes no meu caderninho e definitivamente vou buscar melhorias.
*   **Me avise se tiver problemas**: Esta função está atualmente em fase de testes Beta. Quando usarem, se encontrarem qualquer bug ou acharem algo anti-intuitivo, mandem feedback a qualquer momento; prometo consertar na velocidade da luz!

---

## 🚀 Bem-vindos, Power Users (Sobre o Powerpack)

Se você é um jogador hardcore (Power user) que depende muito da produtividade da IA, a forma completa do Workspace Agent é algo que você precisa ter.

*   **Selo quebrado**: No Powerpack, não há limite para o número de espaços de trabalho ou arquivos. Fique à vontade.
*   **AI Studio sem defasagem**: O AI Studio agora também suporta a função completa de Agent, com exatamente a mesma experiência de Agent do Gemini.
*   **O Agent ficou mais inteligente**: Otimizei as instruções de sistema do Agent. Ele agora é muito mais interativo, vai debater as coisas com você e não vai mais ficar executando tarefas cegamente por conta própria; ele entende muito melhor as suas reais intenções.

🤫 **Um conselho egoísta (fazendo um pouquinho de propaganda)**: O Workspace Agent ainda está no período Beta. Quando o teste acabar e a função estabilizar, o preço do Powerpack vai subir. Então, comprar agora não tem erro: você não só aproveita mais cedo, como também economiza uma grana. Considere isso como um apoio para eu continuar trabalhando virando as noites!

---

## 🎨 Por fim, roupas novas pro seu humor (Sobre os temas)

Às vezes, trocar para um tema bonito faz o humor melhorar na hora de escrever código ou ler documentos.

*   **Adicionados 6 temas lindões** (inclusos no pacote de temas Supportpack): Garantido que vão te dar uma experiência mais agradável enquanto trabalha.
*   **Seletor de cores mais conveniente**: Não precisa mais ir até o painel de configurações para procurar; agora você pode escolher o estilo de cor personalizada direto no menu suspenso de pastas.
*   **Otimização na interface**: Consertado o problema onde a cor de fundo da barra lateral estava errada no tema do AI Studio; finalmente ficou agradável de se ver. Além disso, adicionada a exibição do avatar da conta na barra lateral—quem usa várias contas vai adorar, agora dá para ver claramente o status de login num piscar de olhos, e trocar de conta ficou mais prático.

É isso aí, tudo o que temos para o 2.10.0. Fazer um plugin é um processo contínuo de experimentação e de ir polindo o produto junto com os amigos usuários. Se tiver algo que não esteja legal de usar, já sabem as regras: me chamem a qualquer momento!

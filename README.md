# 🎡 GiraLetras — Jogo de Palavras Multiplayer P2P

**GiraLetras** é um jogo de palavras multiplayer em tempo real para navegadores, inspirado em jogos de festa de categorias e eliminação de letras, com identidade visual, nome, categorias, sons e elementos totalmente originais.

O jogo é hospedado como um front-end estático no **GitHub Pages** e a comunicação entre os jogadores durante as partidas é realizada diretamente via **WebRTC DataChannel P2P** em arquitetura *host-authoritative*.

---

## 🛠️ Arquitetura do Sistema

O projeto é dividido em duas partes independentes e desvinculadas de bancos de dados:

### 1. Front-end (GitHub Pages)
- **Tecnologias:** HTML5, CSS3, JavaScript Moderno (ES6+), Web Audio API, WebRTC Native APIs (`RTCPeerConnection`, `RTCDataChannel`).
- **Função:** Interface do usuário, lobby, renderização do teclado circular, cronômetro animado, sintetizador de sons de jogo e gerenciamento do estado autoritativo no navegador do Host.

### 2. Signaling Server (WebSocket Server)
- **Tecnologias:** Node.js, `ws`.
- **Função:** Intermediar exclusivamente o processo de sinalização (*signaling*) para troca de ofertas SDP, respostas SDP e candidatos ICE.
- **Transparência:** O servidor de sinalização **NÃO armazena permanentemente** estado de jogo, histórico, categorias, letras ou pontuações. Todo o tráfego da partida ocorre via WebRTC.

---

## 🌐 Topologia e Autoridade (Host-Authoritative)

A partida segue uma topologia estrela centrada no criador da sala (**HOST**):

```
         [ HOST ] (Criador da Sala)
        /    |   \
       /     |    \
 [Jogador 2] [Jogador 3] [Jogador 4]
```

- **Autoridade do Host:** O navegador do Host valida se a jogada é válida, se a letra está disponível, controla o início/fim de cada turno (`turnStartedAt`, `turnExpiresAt`), gerencia eliminações por timeout, pontuações e avanço de rodadas.
- **Anti-Cheat Nativo:** Clientes enviam solicitações (`SELECT_LETTER`) ao Host. Clientes não alteram pontuações nem estados diretamente.
- **Migração de Host:** Caso o Host abandone a sala, o servidor de sinalização notifica os demais e promove um novo jogador a Host sem perder a sala.

---

## 🚀 Executando Localmente

### 1. Iniciar o Servidor de Sinalização

```bash
cd signaling
npm install
npm start
```
O servidor estará rodando em `ws://localhost:8080`.

### 2. Abrir o Front-end

Abra o arquivo `index.html` diretamente em múltiplos navegadores/abas ou sirva através de um servidor HTTP local simples:

```bash
# Exemplo com npx serve:
npx serve .
```

Abra em dois navegadores diferentes:
1. No Navegador A: insira seu nome e clique em **Criar Nova Sala**.
2. Copie o link de convite ou o código gerado.
3. No Navegador B: cole o link ou insira o código em **Entrar em Sala**.

---

## 📦 Hospedagem em Produção (GitHub Pages & Signaling)

### Hospedando o Front-end no GitHub Pages

1. Faça o commit e push do repositório para o GitHub.
2. Acesse **Settings > Pages** no seu repositório no GitHub.
3. Em **Source**, selecione a branch `main` e a pasta `/ (root)`.
4. Salve. O site estará disponível em `https://seu-usuario.github.io/nome-do-repositorio/`.

### Hospedando o Servidor de Sinalização (Signaling)

Hospede a pasta `/signaling` em qualquer plataforma com suporte a WebSocket e SSL/TLS, como:
- **Render** (Web Service gratuito)
- **Railway**
- **Fly.io**

Após publicar o servidor de sinalização em `wss://seu-servidor-signaling.onrender.com`, configure a URL centralizada no front-end em `js/signaling.js`:

```javascript
const SIGNALING_SERVER_URL = "wss://seu-servidor-signaling.onrender.com";
```

---

## 📡 Configuração de STUN / TURN

O jogo utiliza por padrão uma lista redundante de servidores STUN públicos e gratuitos no arquivo `js/webrtc.js`:

```javascript
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};
```

### Configurando Servidores TURN Futuros
Para redes corporativas restritas com Firewalls estritos ou NAT simétrico onde o P2P direto falhar, você pode adicionar credenciais TURN diretamente no bloco `ICE_SERVERS` em `js/webrtc.js`:

```javascript
{
  urls: 'turn:seu-servidor-turn.example.com:3478',
  username: 'seu_usuario',
  credential: 'sua_senha'
}
```

---

## 📄 Protocolo de Mensagens WebRTC (DataChannel)

Toda a comunicação P2P utiliza o protocolo padronizado em `js/protocol.js`:

| Tipo de Mensagem | Emissor | Descrição |
| :--- | :--- | :--- |
| `GAME_STATE` | Host | Replicador do estado completo do jogo (`roomId`, `category`, `usedLetters`, `players`, `roundNumber`, `turnExpiresAt`). |
| `SELECT_LETTER` | Cliente | Ação enviada ao Host para tentar pressionar a letra especificada. |
| `TURN_START` | Host | Notifica o início de um novo turno individual. |
| `PLAYER_TIMEOUT` | Host | Notifica que o tempo do jogador expirou e ele foi eliminado da rodada. |
| `ROUND_END` | Host | Notifica o encerramento da rodada com o nome do vencedor. |

---

## ♿ Acessibilidade e Responsividade

- **Responsividade Total:** Teclado circular adaptável via CSS flex/grid e transformações geométricas calculadas para Desktop, Tablets e Smartphones (Portrato/Paisagem).
- **Acessibilidade:** Suporte completo a leitores de tela com `aria-label` e suporte a teclado físico em tempo real (digitar de A a Z durante a sua vez).

---

## 📄 Licença

Este projeto é disponibilizado sob a Licença MIT.

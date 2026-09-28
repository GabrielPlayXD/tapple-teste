# Servidor de Sinalização (Signaling Server) — GiraLetras

Servidor WebSocket responsável por intermediar o estabelecimento de conexões WebRTC Peer-to-Peer (P2P) entre os jogadores do **GiraLetras**.

## Função e Arquitetura

O servidor de sinalização **não armazena nem gerencia o estado do jogo** (pontuações, categorias, letras usadas, turnos, etc.). Ele atua exclusivamente para permitir a descoberta de jogadores e a troca das mensagens de sinalização do WebRTC (`offer`, `answer` e `ice-candidate`).

Uma vez estabelecida a conexão WebRTC DataChannel entre os jogadores, toda a comunicação da partida ocorre de forma direta entre os navegadores em topologia *host-authoritative*.

## Eventos do WebSocket

- `create-room`: Cria uma nova sala e registra o cliente como host.
- `join-room`: Adiciona um jogador a uma sala existente e notifica o host.
- `offer`: Encaminha a oferta SDP do remetente para o jogador alvo.
- `answer`: Encaminha a resposta SDP do remetente para o jogador alvo.
- `ice-candidate`: Encaminha o candidato ICE para o jogador alvo.
- `leave-room`: Notifica a saída de um jogador e trata migração de host se necessário.

## Executando Localmente

### Pré-requisitos
- Node.js v16+ instalado.

### Passos

1. Entre no diretório do servidor de sinalização:
   ```bash
   cd signaling
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o servidor:
   ```bash
   npm start
   ```

Por padrão, o servidor rodará na porta `8080` (`ws://localhost:8080`).

## Hospedagem em Produção

O servidor pode ser facilmente hospedado em serviços como:
- **Render** (Web Service gratuito com suporte a WebSockets)
- **Railway**
- **Fly.io**
- **Glitch**
- Servidor VPS próprio (com PM2 e Nginx/SSL)

> **Nota:** Certifique-se de utilizar `wss://` (WebSocket seguro) se a sua aplicação front-end estiver rodando sob `https://` no GitHub Pages.

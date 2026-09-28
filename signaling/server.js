const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Servidor HTTP básico para health checks e info
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    status: 'online',
    name: 'GiraLetras Signaling Server',
    roomsCount: rooms.size,
    timestamp: new Date().toISOString()
  }));
});

const wss = new WebSocket.Server({ server });

// Armazenamento em memória das salas
// rooms: Map<roomId, { hostId: string, players: Map<playerId, { socket: WebSocket, name: string, isHost: boolean }> }>
const rooms = new Map();

// Mapeamento auxiliar socket -> { roomId, playerId }
const socketMap = new WeakMap();

function broadcastToRoom(roomId, message, excludePlayerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const [pId, player] of room.players.entries()) {
    if (pId !== excludePlayerId && player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(payload);
    }
  }
}

function sendToPlayer(roomId, targetPlayerId, message) {
  const room = rooms.get(roomId);
  if (!room) return false;

  const player = room.players.get(targetPlayerId);
  if (player && player.socket.readyState === WebSocket.OPEN) {
    player.socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function handleDisconnect(ws) {
  const meta = socketMap.get(ws);
  if (!meta) return;

  const { roomId, playerId } = meta;
  const room = rooms.get(roomId);

  if (!room) return;

  const leavingPlayer = room.players.get(playerId);
  const wasHost = room.hostId === playerId;

  room.players.delete(playerId);
  console.log(`[Disconnect] Player ${playerId} (${leavingPlayer?.name || 'Desconhecido'}) left room ${roomId}`);

  if (room.players.size === 0) {
    rooms.delete(roomId);
    console.log(`[Room Cleaned] Room ${roomId} destroyed (empty)`);
  } else {
    // Notificar os outros jogadores sobre a saída
    broadcastToRoom(roomId, {
      type: 'player-left',
      roomId,
      playerId,
      wasHost
    });

    // Se o host saiu, eleger novo host
    if (wasHost) {
      const nextHostEntry = room.players.entries().next().value;
      if (nextHostEntry) {
        const [newHostId, newHostPlayer] = nextHostEntry;
        room.hostId = newHostId;
        newHostPlayer.isHost = true;

        console.log(`[Host Migration] New host for ${roomId} is ${newHostId} (${newHostPlayer.name})`);

        broadcastToRoom(roomId, {
          type: 'host-changed',
          roomId,
          newHostId,
          newHostName: newHostPlayer.name
        });
      }
    }
  }

  socketMap.delete(ws);
}

wss.on('connection', (ws) => {
  console.log('[Connection] Novo cliente conectado');

  // Ping/pong heartbeat para manter conexões ativas
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawMessage) => {
    let data;
    try {
      data = JSON.parse(rawMessage);
    } catch (e) {
      console.error('[Error] Mensagem JSON inválida recebida:', e);
      return;
    }

    const { type, roomId, playerId, name, targetPlayerId, sdp, candidate, maxPlayers } = data;

    switch (type) {
      case 'create-room': {
        if (!roomId || !playerId) return;

        // Se a sala já existir, encerra a anterior ou rejeita
        if (rooms.has(roomId)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Código de sala já existe. Tente gerar outro.'
          }));
          return;
        }

        const roomData = {
          hostId: playerId,
          maxPlayers: maxPlayers || 8,
          players: new Map()
        };

        roomData.players.set(playerId, {
          socket: ws,
          name: name || 'Host',
          isHost: true
        });

        rooms.set(roomId, roomData);
        socketMap.set(ws, { roomId, playerId });

        console.log(`[Room Created] ${roomId} criada por ${playerId} (${name})`);

        ws.send(JSON.stringify({
          type: 'room-created',
          roomId,
          playerId,
          isHost: true
        }));
        break;
      }

      case 'join-room': {
        if (!roomId || !playerId) return;

        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Sala não encontrada. Verifique o código informado.'
          }));
          return;
        }

        if (room.players.size >= (room.maxPlayers || 8)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'A sala atingiu o número máximo de jogadores.'
          }));
          return;
        }

        // Adicionar jogador à sala
        room.players.set(playerId, {
          socket: ws,
          name: name || 'Jogador',
          isHost: false
        });
        socketMap.set(ws, { roomId, playerId });

        console.log(`[Player Joined] ${playerId} (${name}) entrou na sala ${roomId}`);

        // Notificar quem entrou
        ws.send(JSON.stringify({
          type: 'room-joined',
          roomId,
          playerId,
          hostId: room.hostId,
          players: Array.from(room.players.entries()).map(([id, p]) => ({
            id,
            name: p.name,
            isHost: p.isHost
          }))
        }));

        // Notificar o host sobre o novo participante
        sendToPlayer(roomId, room.hostId, {
          type: 'player-joined',
          roomId,
          playerId,
          name: name || 'Jogador'
        });

        // Notificar outros jogadores na sala
        broadcastToRoom(roomId, {
          type: 'peer-joined',
          roomId,
          playerId,
          name: name || 'Jogador'
        }, playerId);
        break;
      }

      case 'offer': {
        if (!roomId || !targetPlayerId || !sdp) return;
        sendToPlayer(roomId, targetPlayerId, {
          type: 'offer',
          fromPlayerId: playerId,
          sdp
        });
        break;
      }

      case 'answer': {
        if (!roomId || !targetPlayerId || !sdp) return;
        sendToPlayer(roomId, targetPlayerId, {
          type: 'answer',
          fromPlayerId: playerId,
          sdp
        });
        break;
      }

      case 'ice-candidate': {
        if (!roomId || !targetPlayerId || !candidate) return;
        sendToPlayer(roomId, targetPlayerId, {
          type: 'ice-candidate',
          fromPlayerId: playerId,
          candidate
        });
        break;
      }

      case 'leave-room': {
        handleDisconnect(ws);
        break;
      }

      default:
        console.warn(`[Warning] Tipo de mensagem desconhecido: ${type}`);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error('[Socket Error]', err);
    handleDisconnect(ws);
  });
});

// Verificação periódica de heartbeat a cada 30s
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

server.listen(PORT, () => {
  console.log(`GiraLetras Signaling Server rodando na porta ${PORT}`);
});

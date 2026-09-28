/**
 * Cliente de Sinalização WebSocket para o GiraLetras.
 */

// URL do servidor de sinalização centralizada.
// Padrão local: ws://localhost:8080
// Para produção (Render/Fly.io/etc): altere para wss://seu-servidor.example.com
const SIGNALING_SERVER_URL = typeof window !== 'undefined' && window.LOCATION_SIGNALING_URL
  ? window.LOCATION_SIGNALING_URL
  : 'ws://localhost:8080';

class SignalingClient {
  constructor(serverUrl = SIGNALING_SERVER_URL) {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.handlers = new Map();
    this.isConnected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.serverUrl);

        this.socket.onopen = () => {
          console.log('[Signaling] Conectado ao servidor:', this.serverUrl);
          this.isConnected = true;
          resolve();
        };

        this.socket.onmessage = (event) => {
          this._handleMessage(event.data);
        };

        this.socket.onerror = (err) => {
          console.error('[Signaling] Erro na conexão:', err);
          this.emit('error', { message: 'Erro na conexão WebSocket com servidor de sinalização.' });
          reject(err);
        };

        this.socket.onclose = () => {
          console.log('[Signaling] Conexão encerrada');
          this.isConnected = false;
          this.emit('disconnected');
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  on(eventType, callback) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(callback);
  }

  emit(eventType, data) {
    const callbacks = this.handlers.get(eventType);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn('[Signaling] Tentativa de envio com socket fechado:', data);
    }
  }

  createRoom(roomId, playerId, playerName, maxPlayers = 8) {
    this.send({
      type: 'create-room',
      roomId,
      playerId,
      name: playerName,
      maxPlayers
    });
  }

  joinRoom(roomId, playerId, playerName) {
    this.send({
      type: 'join-room',
      roomId,
      playerId,
      name: playerName
    });
  }

  sendOffer(roomId, playerId, targetPlayerId, sdp) {
    this.send({
      type: 'offer',
      roomId,
      playerId,
      targetPlayerId,
      sdp
    });
  }

  sendAnswer(roomId, playerId, targetPlayerId, sdp) {
    this.send({
      type: 'answer',
      roomId,
      playerId,
      targetPlayerId,
      sdp
    });
  }

  sendIceCandidate(roomId, playerId, targetPlayerId, candidate) {
    this.send({
      type: 'ice-candidate',
      roomId,
      playerId,
      targetPlayerId,
      candidate
    });
  }

  leaveRoom(roomId, playerId) {
    this.send({
      type: 'leave-room',
      roomId,
      playerId
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  _handleMessage(rawMessage) {
    try {
      const message = JSON.parse(rawMessage);
      if (message && message.type) {
        this.emit(message.type, message);
      }
    } catch (e) {
      console.error('[Signaling] Falha ao processar mensagem JSON:', e);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SignalingClient, SIGNALING_SERVER_URL };
}

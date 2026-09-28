/**
 * Cliente de Sinalização WebSocket para o GiraLetras.
 */

function getSignalingUrl() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem('giraletras_signaling_url');
    if (saved && saved.trim()) {
      return saved.trim();
    }
  }

  if (typeof window !== 'undefined' && window.LOCATION_SIGNALING_URL) {
    return window.LOCATION_SIGNALING_URL;
  }

  // Padrão
  return 'ws://localhost:8080';
}

function setSignalingUrl(url) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (url && url.trim()) {
      localStorage.setItem('giraletras_signaling_url', url.trim());
    } else {
      localStorage.removeItem('giraletras_signaling_url');
    }
  }
}

class SignalingClient {
  constructor(serverUrl = getSignalingUrl()) {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.handlers = new Map();
    this.isConnected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        // Verificar restrição HTTPS (Mixed Content)
        if (typeof window !== 'undefined' && window.location.protocol === 'https:' && this.serverUrl.startsWith('ws://')) {
          const isLocal = this.serverUrl.includes('localhost') || this.serverUrl.includes('127.0.0.1');
          if (!isLocal) {
            console.warn('[Signaling] Conexão ws:// não criptografada tentada em página https://');
          }
        }

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
          console.error('[Signaling] Erro na conexão com:', this.serverUrl, err);
          let errorMsg = `Não foi possível conectar ao servidor de sinalização (${this.serverUrl}).`;
          if (typeof window !== 'undefined' && window.location.protocol === 'https:' && this.serverUrl.startsWith('ws://')) {
            errorMsg += ' Navegadores bloqueiam conexões ws:// não seguras a partir de páginas HTTPS. Use wss://.';
          }
          this.emit('error', { message: errorMsg, isConnectionError: true });
          reject(err);
        };

        this.socket.onclose = () => {
          console.log('[Signaling] Conexão encerrada');
          this.isConnected = false;
          this.emit('disconnected');
        };
      } catch (e) {
        let errorMsg = `Erro ao inicializar WebSocket com ${this.serverUrl}: ${e.message}`;
        this.emit('error', { message: errorMsg, isConnectionError: true });
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
  module.exports = { SignalingClient, getSignalingUrl, setSignalingUrl };
}

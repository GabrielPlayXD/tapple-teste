/**
 * Definição do protocolo de comunicação WebSocket (signaling) e WebRTC DataChannel (jogo).
 */

const MESSAGE_TYPES = {
  // --- Sinalização (WebSocket) ---
  CREATE_ROOM: 'create-room',
  ROOM_CREATED: 'room-created',
  JOIN_ROOM: 'join-room',
  ROOM_JOINED: 'room-joined',
  PLAYER_JOINED: 'player-joined',
  PEER_JOINED: 'peer-joined',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  LEAVE_ROOM: 'leave-room',
  PLAYER_LEFT: 'player-left',
  HOST_CHANGED: 'host-changed',
  SIGNALING_ERROR: 'error',

  // --- Jogo P2P (DataChannel) ---
  GAME_STATE: 'GAME_STATE',
  GAME_START: 'GAME_START',
  SELECT_LETTER: 'SELECT_LETTER',
  TURN_START: 'TURN_START',
  PLAYER_TIMEOUT: 'PLAYER_TIMEOUT',
  ROUND_END: 'ROUND_END',
  NEXT_ROUND: 'NEXT_ROUND',
  RECONNECT_REQUEST: 'RECONNECT_REQUEST',
  RECONNECT_RESPONSE: 'RECONNECT_RESPONSE',
  CONFIG_UPDATE: 'CONFIG_UPDATE',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  SYNC_PULSE: 'SYNC_PULSE'
};

const Protocol = {
  TYPES: MESSAGE_TYPES,

  /**
   * Sanitiza e valida strings enviadas por outros usuários para evitar XSS
   */
  sanitizeText(text, maxLength = 30) {
    if (typeof text !== 'string') return '';
    const clean = text.trim().replace(/[&<>"']/g, (m) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return map[m];
    });
    return clean.slice(0, maxLength);
  },

  /**
   * Cria objeto de mensagem para o DataChannel
   */
  createMessage(type, payload = {}) {
    return JSON.stringify({
      type,
      timestamp: Date.now(),
      ...payload
    });
  },

  /**
   * Valida e interpreta mensagem JSON recebida
   */
  parseMessage(raw) {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || !data.type) {
        return null;
      }
      return data;
    } catch (e) {
      console.warn('Mensagem inválida recebida:', e);
      return null;
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MESSAGE_TYPES, Protocol };
}

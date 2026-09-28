/**
 * Configuração centralizada de ICE (STUN/TURN) e gerenciamento de WebRTC DataChannel.
 */

// Servidores STUN públicos gratuitos
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
    /* Configuração preparada para TURN server futuro:
    ,
    {
      urls: 'turn:seu-servidor-turn.example.com:3478',
      username: 'turn_user',
      credential: 'turn_password'
    }
    */
  ]
};

class PeerManager {
  constructor(localPlayerId, signalingClient, roomId) {
    this.localPlayerId = localPlayerId;
    this.signalingClient = signalingClient;
    this.roomId = roomId;

    // peers: Map<remotePlayerId, { pc: RTCPeerConnection, dc: RTCDataChannel } >
    this.peers = new Map();

    // Callbacks de eventos P2P
    this.onDataChannelMessage = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
  }

  /**
   * Inicializa uma conexão PeerConnection para um jogador remoto (chamado pelo Host ou pelo Cliente)
   */
  createPeerConnection(remotePlayerId, isInitiator = false) {
    if (this.peers.has(remotePlayerId)) {
      this.closePeer(remotePlayerId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    let dc = null;

    const peerInfo = { pc, dc: null, ready: false };
    this.peers.set(remotePlayerId, peerInfo);

    // Enviar ICE candidates via servidor de sinalização
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient.sendIceCandidate(
          this.roomId,
          this.localPlayerId,
          remotePlayerId,
          event.candidate
        );
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remotePlayerId} estado da conexão:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(remotePlayerId);
      }
    };

    if (isInitiator) {
      // O iniciador (ex: Host conectando com Cliente, ou vice-versa) cria o DataChannel
      dc = pc.createDataChannel('giraletras-game', {
        ordered: true
      });
      this._setupDataChannel(dc, remotePlayerId);
      peerInfo.dc = dc;

      // Criar e enviar Offer
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.signalingClient.sendOffer(
            this.roomId,
            this.localPlayerId,
            remotePlayerId,
            pc.localDescription
          );
        })
        .catch((err) => console.error('[WebRTC] Erro ao criar offer:', err));
    } else {
      // O receptor escuta pela chegada do DataChannel
      pc.ondatachannel = (event) => {
        dc = event.channel;
        this._setupDataChannel(dc, remotePlayerId);
        peerInfo.dc = dc;
      };
    }

    return peerInfo;
  }

  /**
   * Processa uma oferta SDP recebida
   */
  async handleOffer(fromPlayerId, sdp) {
    let peer = this.peers.get(fromPlayerId);
    if (!peer) {
      peer = this.createPeerConnection(fromPlayerId, false);
    }

    const pc = peer.pc;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.signalingClient.sendAnswer(
      this.roomId,
      this.localPlayerId,
      fromPlayerId,
      pc.localDescription
    );
  }

  /**
   * Processa uma resposta SDP recebida
   */
  async handleAnswer(fromPlayerId, sdp) {
    const peer = this.peers.get(fromPlayerId);
    if (peer && peer.pc) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  /**
   * Processa candidato ICE recebido
   */
  async handleIceCandidate(fromPlayerId, candidate) {
    const peer = this.peers.get(fromPlayerId);
    if (peer && peer.pc) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Erro ao adicionar candidato ICE:', e);
      }
    }
  }

  /**
   * Configura manipuladores de evento no RTCDataChannel
   */
  _setupDataChannel(dc, remotePlayerId) {
    dc.onopen = () => {
      console.log(`[WebRTC] DataChannel aberto com peer ${remotePlayerId}`);
      const peer = this.peers.get(remotePlayerId);
      if (peer) {
        peer.ready = true;
      }
      if (this.onPeerConnected) {
        this.onPeerConnected(remotePlayerId);
      }
    };

    dc.onclose = () => {
      console.log(`[WebRTC] DataChannel fechado com peer ${remotePlayerId}`);
      this.closePeer(remotePlayerId);
    };

    dc.onerror = (err) => {
      console.error(`[WebRTC] Erro no DataChannel (${remotePlayerId}):`, err);
    };

    dc.onmessage = (event) => {
      if (this.onDataChannelMessage) {
        this.onDataChannelMessage(remotePlayerId, event.data);
      }
    };
  }

  /**
   * Transmite uma mensagem para um peer específico via DataChannel
   */
  sendToPeer(remotePlayerId, messageObj) {
    const peer = this.peers.get(remotePlayerId);
    if (peer && peer.dc && peer.dc.readyState === 'open') {
      const payload = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);
      peer.dc.send(payload);
      return true;
    }
    return false;
  }

  /**
   * Transmite mensagem para TODOS os peers conectados
   */
  broadcast(messageObj, excludePlayerId = null) {
    const payload = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);
    this.peers.forEach((peer, pId) => {
      if (pId !== excludePlayerId && peer.dc && peer.dc.readyState === 'open') {
        peer.dc.send(payload);
      }
    });
  }

  /**
   * Encerra conexão com um peer específico
   */
  closePeer(remotePlayerId) {
    const peer = this.peers.get(remotePlayerId);
    if (peer) {
      if (peer.dc) peer.dc.close();
      if (peer.pc) peer.pc.close();
      this.peers.delete(remotePlayerId);
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected(remotePlayerId);
      }
    }
  }

  /**
   * Encerra todas as conexões WebRTC
   */
  closeAll() {
    this.peers.forEach((peer, remotePlayerId) => {
      this.closePeer(remotePlayerId);
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PeerManager, ICE_SERVERS };
}

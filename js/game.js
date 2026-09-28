/**
 * Gerenciador da Lógica do Jogo (Host-Authoritative & Client) - GiraLetras.
 */

class GameManager {
  constructor() {
    // Identidade do Jogador Local
    this.localPlayerId = this._getOrCreatePlayerId();
    this.localPlayerName = localStorage.getItem('giraletras_player_name') || 'Jogador';
    this.isHost = false;

    // Configurações da Sala
    this.roomId = null;
    this.turnDurationSec = 10; // 5, 10, 15s
    this.maxPlayers = 8;
    this.allowJoinMidGame = false;

    // Estado Autoritativo da Partida (Mantido rigorosamente pelo Host e replicado nos Clientes)
    this.state = {
      roomId: null,
      status: 'LOBBY', // 'LOBBY', 'PLAYING', 'ROUND_END'
      category: '',
      currentPlayerId: null,
      usedLetters: [], // Ex: ['A', 'C', 'M']
      players: [], // Array de { id, name, score, connected, eliminated, isHost }
      roundNumber: 0,
      turnStartedAt: null,
      turnExpiresAt: null,
      winnerName: null
    };

    // Referência de categorias disponíveis (embaralhadas)
    this.categoryPool = [];

    // Callbacks para notificação de atualização de estado e alertas
    this.onStateChanged = null;
    this.onTurnTimeout = null;
    this.onNotification = null;
  }

  /**
   * Obtém ID persistente do navegador ou gera um novo UUID v4
   */
  _getOrCreatePlayerId() {
    let id = localStorage.getItem('giraletras_player_id');
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = 'p_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      }
      localStorage.setItem('giraletras_player_id', id);
    }
    return id;
  }

  setPlayerName(name) {
    const cleanName = Protocol ? Protocol.sanitizeText(name, 20) : name.trim().slice(0, 20);
    this.localPlayerName = cleanName || 'Jogador';
    localStorage.setItem('giraletras_player_name', this.localPlayerName);

    // Se já estiver na lista de jogadores local, atualiza
    const player = this.state.players.find(p => p.id === this.localPlayerId);
    if (player) {
      player.name = this.localPlayerName;
    }
  }

  // ==========================================
  // --- MÉTODOS EXCLUSIVOS DO HOST ---
  // ==========================================

  initHostGame(roomId, maxPlayers = 8) {
    this.isHost = true;
    this.roomId = roomId;
    this.maxPlayers = maxPlayers;

    this.state = {
      roomId,
      status: 'LOBBY',
      category: '',
      currentPlayerId: null,
      usedLetters: [],
      players: [
        {
          id: this.localPlayerId,
          name: this.localPlayerName,
          score: 0,
          connected: true,
          eliminated: false,
          isHost: true
        }
      ],
      roundNumber: 0,
      turnStartedAt: null,
      turnExpiresAt: null,
      winnerName: null
    };

    this._resetCategoryPool();
    this._notifyStateChange();
  }

  _resetCategoryPool() {
    const cats = typeof CATEGORIES !== 'undefined' ? [...CATEGORIES] : ['Animais', 'Frutas', 'Cidades'];
    // Embaralhar
    for (let i = cats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cats[i], cats[j]] = [cats[j], cats[i]];
    }
    this.categoryPool = cats;
  }

  hostAddPlayer(id, name) {
    if (!this.isHost) return;

    let player = this.state.players.find(p => p.id === id);
    if (!player) {
      if (this.state.players.length >= this.maxPlayers) {
        return false;
      }
      player = {
        id,
        name: Protocol.sanitizeText(name, 20) || 'Jogador',
        score: 0,
        connected: true,
        eliminated: this.state.status === 'PLAYING' && !this.allowJoinMidGame,
        isHost: false
      };
      this.state.players.push(player);
    } else {
      player.connected = true;
      player.name = Protocol.sanitizeText(name, 20) || player.name;
    }

    this._notifyStateChange();
    return true;
  }

  hostRemovePlayer(id) {
    if (!this.isHost) return;

    const playerIndex = this.state.players.findIndex(p => p.id === id);
    if (playerIndex !== -1) {
      const player = this.state.players[playerIndex];
      player.connected = false;

      // Se for o jogador atual da rodada, passa a vez imediatamente
      if (this.state.status === 'PLAYING' && this.state.currentPlayerId === id) {
        player.eliminated = true;
        this.hostAdvanceTurn();
      } else {
        this._checkRoundEndConditions();
      }
    }
    this._notifyStateChange();
  }

  hostStartGame() {
    if (!this.isHost) return;
    if (this.state.players.filter(p => p.connected).length < 2) {
      if (this.onNotification) this.onNotification('SÃO NECESSÁRIOS PELO MENOS 2 JOGADORES PARA INICIAR.');
      return false;
    }

    this.state.roundNumber = 1;
    this.hostStartNewRound();
    return true;
  }

  hostStartNewRound() {
    if (!this.isHost) return;

    if (this.categoryPool.length === 0) {
      this._resetCategoryPool();
    }

    const nextCategory = this.categoryPool.pop() || 'Geral';

    // Resetar status de rodada de todos os jogadores conectados
    this.state.players.forEach(p => {
      p.eliminated = !p.connected;
    });

    this.state.status = 'PLAYING';
    this.state.category = nextCategory;
    this.state.usedLetters = [];
    this.state.winnerName = null;

    // Selecionar primeiro jogador ativo
    const activePlayers = this.state.players.filter(p => p.connected && !p.eliminated);
    if (activePlayers.length === 0) return;

    this.state.currentPlayerId = activePlayers[Math.floor(Math.random() * activePlayers.length)].id;
    this.hostStartTurnTimer();
    this._notifyStateChange();
  }

  hostStartTurnTimer() {
    const now = Date.now();
    this.state.turnStartedAt = now;
    this.state.turnExpiresAt = now + (this.turnDurationSec * 1000);
  }

  /**
   * Processa a seleção de uma letra vinda de um jogador (ou local)
   */
  hostSelectLetter(playerId, letter) {
    if (!this.isHost) return false;
    if (this.state.status !== 'PLAYING') return false;

    // Validações estritas de segurança/autoridade:
    // 1. É a vez do jogador correto?
    if (this.state.currentPlayerId !== playerId) return false;

    // 2. O jogador está eliminado ou desconectado?
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.eliminated || !player.connected) return false;

    // 3. A letra é válida e não foi usada?
    const upperLetter = letter.toUpperCase();
    if (!/^[A-Z]$/.test(upperLetter)) return false;
    if (this.state.usedLetters.includes(upperLetter)) return false;

    // 4. O turno expirou? (com margem de tolerância de 1s para latência)
    if (Date.now() > this.state.turnExpiresAt + 1000) {
      this.hostHandleTurnTimeout();
      return false;
    }

    // Ação Válida: Registrar letra utilizada
    this.state.usedLetters.push(upperLetter);

    // Avançar para o próximo turno
    this.hostAdvanceTurn();
    return true;
  }

  /**
   * Verifica estouro de tempo do turno no Host
   */
  hostCheckTimer() {
    if (!this.isHost || this.state.status !== 'PLAYING') return;

    if (Date.now() >= this.state.turnExpiresAt) {
      this.hostHandleTurnTimeout();
    }
  }

  hostHandleTurnTimeout() {
    if (!this.isHost || this.state.status !== 'PLAYING') return;

    const player = this.state.players.find(p => p.id === this.state.currentPlayerId);
    if (player) {
      player.eliminated = true;
      if (this.onNotification) {
        this.onNotification(`TEMPO ESGOTADO! ${player.name.toUpperCase()} FOI ELIMINADO(A) DA RODADA.`);
      }
    }

    if (this.onTurnTimeout) {
      this.onTurnTimeout(this.state.currentPlayerId);
    }

    this.hostAdvanceTurn();
  }

  hostAdvanceTurn() {
    if (!this.isHost) return;

    // Se todas as 26 letras foram usadas ou resta apenas 1 jogador ativo
    if (this._checkRoundEndConditions()) {
      return;
    }

    // Encontrar próximo jogador conectado e não eliminado
    const activePlayers = this.state.players.filter(p => p.connected && !p.eliminated);
    if (activePlayers.length <= 1) {
      this._checkRoundEndConditions();
      return;
    }

    const currentIndex = activePlayers.findIndex(p => p.id === this.state.currentPlayerId);
    let nextIndex = (currentIndex + 1) % activePlayers.length;
    this.state.currentPlayerId = activePlayers[nextIndex].id;

    this.hostStartTurnTimer();
    this._notifyStateChange();
  }

  _checkRoundEndConditions() {
    if (this.state.status !== 'PLAYING') return false;

    const activePlayers = this.state.players.filter(p => p.connected && !p.eliminated);

    // Condição 1: Sobrou 1 ou nenhum jogador ativo
    if (activePlayers.length <= 1) {
      this.state.status = 'ROUND_END';
      const winner = activePlayers.length === 1 ? activePlayers[0] : null;

      if (winner) {
        winner.score += 1;
        this.state.winnerName = winner.name;
        if (this.onNotification) {
          this.onNotification(`RODADA ENCERRADA! ${winner.name.toUpperCase()} VENCEU A RODADA!`);
        }
      } else {
        this.state.winnerName = 'Nenhum';
        if (this.onNotification) {
          this.onNotification('RODADA ENCERRADA! NINGUÉM SOBREVIVEU.');
        }
      }

      this._notifyStateChange();
      return true;
    }

    // Condição 2: Todas as 26 letras do alfabeto foram utilizadas
    if (this.state.usedLetters.length >= 26) {
      this.state.status = 'ROUND_END';
      // Quem sobrou ganha 1 ponto
      activePlayers.forEach(p => p.score += 1);
      const winnerNames = activePlayers.map(p => p.name).join(', ');
      this.state.winnerName = winnerNames;

      if (this.onNotification) {
        this.onNotification(`TODAS AS LETRAS USADAS! VENCEDORES: ${winnerNames.toUpperCase()}`);
      }

      this._notifyStateChange();
      return true;
    }

    return false;
  }

  // ==========================================
  // --- MÉTODOS DO CLIENTE (E SINCRONIZAÇÃO) ---
  // ==========================================

  updateStateFromHost(newState) {
    if (!newState) return;
    this.state = newState;
    this.roomId = newState.roomId;
    this._notifyStateChange();
  }

  _notifyStateChange() {
    if (this.onStateChanged) {
      this.onStateChanged(this.state);
    }
  }

  getCurrentPlayer() {
    return this.state.players.find(p => p.id === this.state.currentPlayerId) || null;
  }

  isLocalPlayerTurn() {
    return this.state.status === 'PLAYING' && this.state.currentPlayerId === this.localPlayerId;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameManager };
}

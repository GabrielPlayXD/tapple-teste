/**
 * Módulo Principal de Integração (Main App Controller) - GiraLetras.
 */

document.addEventListener('DOMContentLoaded', () => {
  const game = new GameManager();
  const ui = new UIManager();
  let signaling = null;
  let peerManager = null;

  // Função utilitária para gerar código curto de sala (ex: ABC123)
  function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Preencher nome salvo do jogador
  if (game.localPlayerName) {
    ui.inputs.playerName.value = game.localPlayerName;
  }

  // --- CONFIGURAÇÃO E EVENTOS DO ÁUDIO E SERVIDOR ---
  ui.buttons.soundToggle.addEventListener('click', () => {
    const enabled = audioManager.toggleSound();
    ui.displays.soundIcon.textContent = enabled ? '🔊' : '🔇';
    ui.showToast(enabled ? 'Sons ativados' : 'Sons desativados');
  });

  ui.buttons.settingsToggle.addEventListener('click', () => {
    ui.showSignalingSettingsModal(getSignalingUrl());
  });

  ui.buttons.closeSignalingSettings.addEventListener('click', () => {
    ui.hideSignalingSettingsModal();
  });

  ui.buttons.saveSignalingUrl.addEventListener('click', () => {
    const url = ui.inputs.signalingUrl.value.trim();
    if (url) {
      setSignalingUrl(url);
      ui.showToast(`URL do Servidor salva: ${url}`);
    } else {
      setSignalingUrl('');
      ui.showToast('Restaurada URL padrão do servidor de sinalização');
    }
    ui.hideSignalingSettingsModal();
  });

  // --- REGRAS E AÇÕES DE NOME E INPUTS ---
  ui.inputs.playerName.addEventListener('input', (e) => {
    game.setPlayerName(e.target.value);
  });

  // SUPORTE A TECLADO FÍSICO
  document.addEventListener('keydown', (e) => {
    if (game.state.status === 'PLAYING' && game.isLocalPlayerTurn()) {
      const key = e.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        handleSelectLetter(key);
      }
    }
  });

  // --- MENSAGENS DE NOTIFICAÇÃO DO GAME MANAGER ---
  game.onNotification = (msg) => {
    ui.showToast(msg);
  };

  // --- ATUALIZAÇÕES DE ESTADO DO JOGO ---
  game.onStateChanged = (state) => {
    // 1. Atualizar Tela de Acordo com o Status
    if (state.status === 'LOBBY') {
      ui.showScreen('lobby');
      ui.displays.lobbyRoomCode.textContent = state.roomId;
      ui.renderLobby(state.players, game.maxPlayers, game.isHost);
    } else if (state.status === 'PLAYING') {
      ui.hideRoundEndModal();
      ui.showScreen('game');

      const currPlayer = game.getCurrentPlayer();
      ui.displays.currentPlayerName.textContent = currPlayer ? currPlayer.name.toUpperCase() : '--';
      ui.displays.gameCategoryText.textContent = state.category;

      const isMyTurn = game.isLocalPlayerTurn();
      ui.updateKeyboard(state.usedLetters, isMyTurn);

      if (state.turnExpiresAt) {
        ui.updateTimer(state.turnExpiresAt);
      }

      ui.renderScoreboard(state.players, state.currentPlayerId, state.roundNumber);
    } else if (state.status === 'ROUND_END') {
      ui.renderScoreboard(state.players, state.currentPlayerId, state.roundNumber);
      ui.showRoundEndModal(state.winnerName, state.players, game.isHost);
      audioManager.playVictory();
    }

    // 2. Transmitir estado se for o Host para todos os DataChannels
    if (game.isHost && peerManager) {
      peerManager.broadcast(Protocol.createMessage(MESSAGE_TYPES.GAME_STATE, {
        state: game.state
      }));
    }
  };

  // --- SELEÇÃO DE LETRAS ---
  function handleSelectLetter(letter) {
    if (!game.isLocalPlayerTurn()) return;

    audioManager.playLetterClick();

    if (game.isHost) {
      // Host processa diretamente
      game.hostSelectLetter(game.localPlayerId, letter);
    } else {
      // Cliente envia ação SELECT_LETTER para o Host via DataChannel
      peerManager.broadcast(Protocol.createMessage(MESSAGE_TYPES.SELECT_LETTER, {
        letter,
        playerId: game.localPlayerId
      }));
    }
  }

  ui.onLetterClick = (letter) => {
    handleSelectLetter(letter);
  };

  // --- EVENTOS DO PEER MANAGER (WebRTC DataChannel) ---
  function initPeerManager(roomId) {
    peerManager = new PeerManager(game.localPlayerId, signaling, roomId);

    peerManager.onPeerConnected = (remotePlayerId) => {
      ui.showToast(`Conexão P2P estabelecida com novo jogador!`);
      if (game.isHost) {
        // Enviar estado atual do jogo para o recém-conectado
        peerManager.sendToPeer(remotePlayerId, Protocol.createMessage(MESSAGE_TYPES.GAME_STATE, {
          state: game.state
        }));
      }
    };

    peerManager.onPeerDisconnected = (remotePlayerId) => {
      ui.showToast(`Jogador desconectado da partida.`);
      if (game.isHost) {
        game.hostRemovePlayer(remotePlayerId);
      }
    };

    peerManager.onDataChannelMessage = (remotePlayerId, rawMessage) => {
      const msg = Protocol.parseMessage(rawMessage);
      if (!msg) return;

      switch (msg.type) {
        case MESSAGE_TYPES.GAME_STATE: {
          if (!game.isHost && msg.state) {
            game.updateStateFromHost(msg.state);
          }
          break;
        }

        case MESSAGE_TYPES.SELECT_LETTER: {
          if (game.isHost) {
            game.hostSelectLetter(msg.playerId, msg.letter);
          }
          break;
        }

        default:
          console.warn('Tipo de mensagem DataChannel não tratado:', msg.type);
      }
    };
  }

  // --- EVENTOS DE SINALIZAÇÃO (WebSocket) ---
  function initSignalingHandlers() {
    signaling.on('room-created', (data) => {
      game.initHostGame(data.roomId, parseInt(ui.inputs.maxPlayers.value) || 8);
      initPeerManager(data.roomId);

      // Atualizar URL com o parâmetro da sala sem recarregar a página
      const newUrl = `${window.location.origin}${window.location.pathname}?room=${data.roomId}`;
      window.history.pushState({ room: data.roomId }, '', newUrl);

      ui.showToast(`Sala ${data.roomId} criada com sucesso!`);
    });

    signaling.on('room-joined', (data) => {
      game.roomId = data.roomId;
      game.isHost = false;
      initPeerManager(data.roomId);

      ui.showToast(`Entrou na sala ${data.roomId}. Conectando ao host...`);
      // O cliente que entra é o único responsável por iniciar a oferta WebRTC com o Host
      peerManager.createPeerConnection(data.hostId, true);
    });

    signaling.on('player-joined', (data) => {
      if (game.isHost) {
        game.hostAddPlayer(data.playerId, data.name);
        // O Host apenas registra o jogador e aguarda a oferta WebRTC vinda do cliente
      }
    });

    signaling.on('offer', async (data) => {
      if (peerManager) {
        await peerManager.handleOffer(data.fromPlayerId, data.sdp);
      }
    });

    signaling.on('answer', async (data) => {
      if (peerManager) {
        await peerManager.handleAnswer(data.fromPlayerId, data.sdp);
      }
    });

    signaling.on('ice-candidate', async (data) => {
      if (peerManager) {
        await peerManager.handleIceCandidate(data.fromPlayerId, data.candidate);
      }
    });

    signaling.on('host-changed', (data) => {
      ui.showToast(`O Host saiu! Novo host promovido: ${data.newHostName}`);
      if (data.newHostId === game.localPlayerId) {
        game.isHost = true;
        // Atualizar estado de isHost localmente
        game.state.players.forEach(p => {
          p.isHost = (p.id === game.localPlayerId);
        });
        game._notifyStateChange();

        // Re-estabelecer malha de conexões P2P com todos os jogadores restantes na sala
        if (peerManager) {
          game.state.players.forEach(p => {
            if (p.id !== game.localPlayerId && p.connected) {
              peerManager.createPeerConnection(p.id, true);
            }
          });
        }
      }
    });

    signaling.on('error', (data) => {
      ui.showToast(`Erro de Sinalização: ${data.message || 'Falha de sinalização'}`);
      if (data.isConnectionError) {
        ui.showSignalingSettingsModal(getSignalingUrl());
      }
    });
  }

  // --- FUNÇÃO PARA CONECTAR E ENTRAR EM UMA SALA ---
  async function joinExistingRoom(roomId, playerName) {
    if (!playerName || !roomId) return;
    game.setPlayerName(playerName);

    try {
      if (!signaling) {
        signaling = new SignalingClient();
        initSignalingHandlers();
      }
      if (!signaling.isConnected) {
        await signaling.connect();
      }
      signaling.joinRoom(roomId, game.localPlayerId, game.localPlayerName);
    } catch (e) {
      ui.showToast('Erro ao conectar com o servidor de sinalização. Clique em ⚙️ para configurar.');
      ui.showSignalingSettingsModal(getSignalingUrl());
    }
  }

  // Verificar se há código de sala na URL (?room=ABC123)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const cleanRoomCode = roomParam.toUpperCase();
    ui.inputs.roomCode.value = cleanRoomCode;
    ui.showToast(`Sala ${cleanRoomCode} detectada no link! Insira seu nome e clique em Entrar.`);

    // Tentar reconexão/entrada automática se o nome do jogador já estiver salvo
    if (game.localPlayerName && game.localPlayerName !== 'Jogador') {
      setTimeout(() => {
        joinExistingRoom(cleanRoomCode, game.localPlayerName);
      }, 500);
    }
  }

  // --- BOTÕES DE AÇÃO ---

  // 1. CRIAR SALA
  ui.buttons.createRoom.addEventListener('click', async () => {
    const name = ui.inputs.playerName.value.trim();
    if (!name) {
      ui.showToast('Por favor, informe seu nome!');
      ui.inputs.playerName.focus();
      return;
    }

    game.setPlayerName(name);
    const roomId = generateRoomCode();

    try {
      signaling = new SignalingClient();
      initSignalingHandlers();
      await signaling.connect();
      signaling.createRoom(roomId, game.localPlayerId, game.localPlayerName, parseInt(ui.inputs.maxPlayers.value));
    } catch (e) {
      ui.showToast('Não foi possível conectar ao servidor de sinalização. Clique em ⚙️ para configurar.');
      ui.showSignalingSettingsModal(getSignalingUrl());
    }
  });

  // 2. ENTRAR EM SALA
  ui.buttons.joinRoom.addEventListener('click', async () => {
    const name = ui.inputs.playerName.value.trim();
    const roomId = ui.inputs.roomCode.value.trim().toUpperCase();

    if (!name) {
      ui.showToast('Por favor, informe seu nome!');
      ui.inputs.playerName.focus();
      return;
    }
    if (!roomId) {
      ui.showToast('Informe o código da sala!');
      ui.inputs.roomCode.focus();
      return;
    }

    joinExistingRoom(roomId, name);
  });

  // 3. COPIAR LINK DE CONVITE
  ui.buttons.copyLink.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${game.roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      ui.showToast('Link de convite copiado para a área de transferência! 📋');
    }).catch(() => {
      ui.showToast(`Copie o código da sala: ${game.roomId}`);
    });
  });

  // 4. ALTERAR CONFIGURAÇÕES DO LOBBY (HOST)
  ui.inputs.turnDuration.addEventListener('change', (e) => {
    if (game.isHost) {
      game.turnDurationSec = parseInt(e.target.value) || 10;
    }
  });

  ui.inputs.maxPlayers.addEventListener('change', (e) => {
    if (game.isHost) {
      game.maxPlayers = parseInt(e.target.value) || 8;
    }
  });

  // 5. INICIAR PARIDA (HOST)
  ui.buttons.startGame.addEventListener('click', () => {
    if (game.isHost) {
      game.hostStartGame();
    }
  });

  // 6. PRÓXIMA RODADA (HOST)
  ui.buttons.nextRound.addEventListener('click', () => {
    if (game.isHost) {
      game.state.roundNumber += 1;
      game.hostStartNewRound();
    }
  });

  // LOOP AUTORITATIVO DO HOST PARA CHECAGEM DE TIMER
  setInterval(() => {
    if (game.isHost && game.state.status === 'PLAYING') {
      game.hostCheckTimer();
    }
  }, 200);
});

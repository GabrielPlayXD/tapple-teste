/**
 * Gerenciador de Interface de Usuário (UI) do GiraLetras.
 */

class UIManager {
  constructor() {
    // Referências aos elementos DOM
    this.screens = {
      landing: document.getElementById('screen-landing'),
      lobby: document.getElementById('screen-lobby'),
      game: document.getElementById('screen-game')
    };

    this.inputs = {
      playerName: document.getElementById('input-player-name'),
      roomCode: document.getElementById('input-room-code'),
      turnDuration: document.getElementById('select-turn-duration'),
      maxPlayers: document.getElementById('select-max-players'),
      signalingUrl: document.getElementById('input-signaling-url')
    };

    this.buttons = {
      createRoom: document.getElementById('btn-create-room'),
      joinRoom: document.getElementById('btn-join-room'),
      copyLink: document.getElementById('btn-copy-link'),
      startGame: document.getElementById('btn-start-game'),
      nextRound: document.getElementById('btn-next-round'),
      soundToggle: document.getElementById('btn-sound-toggle'),
      settingsToggle: document.getElementById('btn-settings-toggle'),
      saveSignalingUrl: document.getElementById('btn-save-signaling-url'),
      closeSignalingSettings: document.getElementById('btn-close-signaling-settings')
    };

    this.displays = {
      lobbyRoomCode: document.getElementById('lobby-room-code'),
      lobbyPlayerCount: document.getElementById('lobby-player-count'),
      lobbyPlayersList: document.getElementById('lobby-players-list'),
      hostSettingsPanel: document.getElementById('host-settings-panel'),
      hostStartHint: document.getElementById('host-start-hint'),
      scoreboardList: document.getElementById('scoreboard-list'),
      currentPlayerName: document.getElementById('current-player-name'),
      gameCategoryText: document.getElementById('game-category-text'),
      timerDisplay: document.getElementById('timer-display'),
      timerSeconds: document.getElementById('timer-seconds'),
      lettersContainer: document.getElementById('letters-container'),
      roundBadge: document.getElementById('round-badge'),
      modalRoundEnd: document.getElementById('modal-round-end'),
      modalWinnerTitle: document.getElementById('modal-winner-title'),
      modalWinnerDesc: document.getElementById('modal-winner-desc'),
      modalScoresList: document.getElementById('modal-scores-list'),
      waitNextRoundText: document.getElementById('wait-next-round-text'),
      modalSignalingSettings: document.getElementById('modal-signaling-settings'),
      toastContainer: document.getElementById('toast-container'),
      soundIcon: document.getElementById('sound-icon'),
      btnStartGame: document.getElementById('btn-start-game'),
      btnNextRound: document.getElementById('btn-next-round')
    };

    this.timerInterval = null;
    this.onLetterClick = null;

    this._renderCircularKeyboard();
  }

  /**
   * Alterna a tela ativa
   */
  showScreen(screenName) {
    Object.keys(this.screens).forEach(key => {
      if (key === screenName) {
        this.screens[key].classList.add('active');
      } else {
        this.screens[key].classList.remove('active');
      }
    });
  }

  showToast(message, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.displays.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Renderiza a disposição circular dos botões de letras (A-Z)
   */
  _renderCircularKeyboard() {
    const container = this.displays.lettersContainer;
    container.innerHTML = '';

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const totalLetters = letters.length;

    // Raio do círculo em porcentagem
    const radius = 41;

    letters.forEach((letter, index) => {
      const btn = document.createElement('button');
      btn.className = 'letter-btn';
      btn.textContent = letter;
      btn.dataset.letter = letter;
      btn.setAttribute('aria-label', `Letra ${letter}`);

      // Ângulo em radianos (começando do topo, -90 graus)
      const angle = ((index / totalLetters) * 360 - 90) * (Math.PI / 180);
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);

      btn.style.left = `${x}%`;
      btn.style.top = `${y}%`;

      btn.addEventListener('click', () => {
        if (this.onLetterClick) {
          this.onLetterClick(letter);
        }
      });

      container.appendChild(btn);
    });
  }

  /**
   * Atualiza o estado visual das letras no teclado circular
   */
  updateKeyboard(usedLetters = [], isMyTurn = false) {
    const buttons = this.displays.lettersContainer.querySelectorAll('.letter-btn');
    buttons.forEach(btn => {
      const letter = btn.dataset.letter;
      const isUsed = usedLetters.includes(letter);

      if (isUsed) {
        btn.classList.add('used');
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.classList.remove('used');
        btn.disabled = !isMyTurn;
        if (isMyTurn) {
          btn.removeAttribute('aria-disabled');
        } else {
          btn.setAttribute('aria-disabled', 'true');
        }
      }
    });
  }

  /**
   * Atualiza e anima o cronômetro visual
   */
  updateTimer(expiresAt) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    const updateDisplay = () => {
      const remainingMs = expiresAt - Date.now();
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

      this.displays.timerSeconds.textContent = seconds;

      if (seconds <= 3 && seconds > 0) {
        this.displays.timerDisplay.classList.add('warning');
      } else {
        this.displays.timerDisplay.classList.remove('warning');
      }

      if (remainingMs <= 0) {
        clearInterval(this.timerInterval);
      }
    };

    updateDisplay();
    this.timerInterval = setInterval(updateDisplay, 100);
  }

  /**
   * Renderiza a lista de jogadores do Lobby
   */
  renderLobby(players, maxPlayers, isHost) {
    this.displays.lobbyPlayerCount.textContent = `${players.length} / ${maxPlayers}`;
    this.displays.lobbyPlayersList.innerHTML = '';

    players.forEach(p => {
      const li = document.createElement('li');
      li.className = 'player-item';
      li.innerHTML = `
        <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div class="player-info">
          <span class="name">${Protocol.sanitizeText(p.name)}</span>
          <span class="tag">${p.isHost ? '👑 Host' : 'Jogador'}</span>
        </div>
      `;
      this.displays.lobbyPlayersList.appendChild(li);
    });

    if (isHost) {
      this.displays.hostSettingsPanel.style.display = 'block';
      this.displays.btnStartGame.style.display = 'inline-flex';
      this.displays.btnStartGame.disabled = players.length < 2;
      this.displays.hostStartHint.style.display = players.length < 2 ? 'block' : 'none';
      if (players.length < 2) {
        this.displays.hostStartHint.textContent = 'Mínimo de 2 jogadores para iniciar.';
      }
    } else {
      this.displays.hostSettingsPanel.style.display = 'none';
      this.displays.btnStartGame.style.display = 'none';
      this.displays.hostStartHint.style.display = 'block';
      this.displays.hostStartHint.textContent = 'Aguardando o host iniciar a partida...';
    }
  }

  /**
   * Renderiza a lista lateral de pontuações durante a partida
   */
  renderScoreboard(players, currentPlayerId, roundNumber) {
    this.displays.roundBadge.textContent = `R${roundNumber}`;
    this.displays.scoreboardList.innerHTML = '';

    players.forEach(p => {
      const isCurrent = p.id === currentPlayerId;
      const card = document.createElement('div');
      card.className = `score-card ${isCurrent ? 'active-turn' : ''} ${p.eliminated ? 'eliminated' : ''}`;

      card.innerHTML = `
        <div class="player-details">
          <span>${p.eliminated ? '❌' : isCurrent ? '👉' : '👤'}</span>
          <strong>${Protocol.sanitizeText(p.name)}</strong>
        </div>
        <div class="pts">${p.score} pt${p.score !== 1 ? 's' : ''}</div>
      `;
      this.displays.scoreboardList.appendChild(card);
    });
  }

  /**
   * Exibe a modal de fim de rodada
   */
  showRoundEndModal(winnerName, players, isHost) {
    this.displays.modalWinnerTitle.textContent = winnerName
      ? `${winnerName.toUpperCase()} VENCEU A RODADA!`
      : 'RODADA ENCERRADA!';

    this.displays.modalWinnerDesc.textContent = winnerName
      ? 'A pontuação da sala foi atualizada!'
      : 'Ninguém conseguiu marcar ponto nesta rodada.';

    this.displays.modalScoresList.innerHTML = '';
    const sorted = [...players].sort((a, b) => b.score - a.score);

    sorted.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'score-card';
      row.innerHTML = `
        <div class="player-details">
          <span>#${idx + 1}</span>
          <strong>${Protocol.sanitizeText(p.name)}</strong>
        </div>
        <div class="pts">${p.score} pts</div>
      `;
      this.displays.modalScoresList.appendChild(row);
    });

    if (isHost) {
      this.displays.btnNextRound.style.display = 'inline-flex';
      this.displays.waitNextRoundText.style.display = 'none';
    } else {
      this.displays.btnNextRound.style.display = 'none';
      this.displays.waitNextRoundText.style.display = 'block';
    }

    this.displays.modalRoundEnd.classList.add('active');
  }

  hideRoundEndModal() {
    this.displays.modalRoundEnd.classList.remove('active');
  }

  showSignalingSettingsModal(currentUrl) {
    this.inputs.signalingUrl.value = currentUrl || '';
    this.displays.modalSignalingSettings.classList.add('active');
  }

  hideSignalingSettingsModal() {
    this.displays.modalSignalingSettings.classList.remove('active');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UIManager };
}

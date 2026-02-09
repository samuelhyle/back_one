import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Dices, Users, Crown, Swords, RefreshCw, Trophy, X } from 'lucide-react';
import { GameLogic, INITIAL_BOARD } from './gameLogic';
import './backgammon.css';
import './theme-styles.css';
import { startAIBots, stopAIBots, activeBots } from './aiOpponent';
import { soundEffects } from './soundEffects';
import { triggerConfetti } from './confetti';
import { ACHIEVEMENTS, checkAchievements, unlockAchievement, getAchievements } from './achievements';
import { updatePlayerStats, getTopPlayers, getPlayerRank, formatWinRate, getRatingBracket, formatRating, getPlayerStats } from './leaderboard';

// Main Backgammon Component
export default function BackgammonPlatform() {
  const [gameState, setGameState] = useState('lobby'); // lobby, playing, finished
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [opponentName, setOpponentName] = useState(null);
  const [playerNames, setPlayerNames] = useState({ white: 'Player 1', black: 'Player 2' });
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [bar, setBar] = useState({ white: 0, black: 0 });
  const [bornOff, setBornOff] = useState({ white: 0, black: 0 });
  const [dice, setDice] = useState([]);
  const [usedDice, setUsedDice] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState('white');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [availableMoves, setAvailableMoves] = useState([]);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [message, setMessage] = useState(null);
  const [movingChecker, setMovingChecker] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [joinConflict, setJoinConflict] = useState(null);
  const [aiSkill, setAiSkill] = useState(0.8);
  const [aiPersonality, setAiPersonality] = useState('balanced');
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [showHints, setShowHints] = useState(true);
  const [gameSpeed, setGameSpeed] = useState(1.0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [moveHistory, setMoveHistory] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [undoCount, setUndoCount] = useState(0);
  const [theme, setTheme] = useState('classic');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [topPlayers, setTopPlayers] = useState([]);
  const [playerRank, setPlayerRank] = useState(0);
  const [playerStats, setPlayerStats] = useState(null);
  const pollIntervalRef = useRef(null);
  const messageTimeoutRef = useRef(null);

  // Clear message after timeout
  useEffect(() => {
    if (message) {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      messageTimeoutRef.current = setTimeout(() => {
        setMessage(null);
      }, 3000);
    }
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [message]);

  // Initialize game
  useEffect(() => {
    // load or create persistent player id and name
    let id = localStorage.getItem('bg-player-id');
    let name = localStorage.getItem('bg-player-name');
    if (!id) {
      id = 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('bg-player-id', id);
    }
    if (!name) {
      name = 'Player-' + id.slice(-4);
      localStorage.setItem('bg-player-name', name);
    }
    setPlayerId(id);
    setPlayerName(name);
    loadGames();
  }, []);

  // Persist playerName when changed
  useEffect(() => {
    if (playerName) {
      localStorage.setItem('bg-player-name', playerName);
    }
  }, [playerName]);

  // Load and persist stats
  useEffect(() => {
    const saved = localStorage.getItem('bg-stats');
    if (saved) {
      setStats(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('bg-stats', JSON.stringify(stats));
  }, [stats]);

  // Load achievements
  useEffect(() => {
    const saved = getAchievements();
    setAchievements(saved);
  }, []);

  // Load and persist theme
  useEffect(() => {
    const saved = localStorage.getItem('bg-theme');
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  // Update theme on change
  useEffect(() => {
    localStorage.setItem('bg-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load leaderboard data
  useEffect(() => {
    const loadLeaderboard = () => {
      const top = getTopPlayers(10);
      setTopPlayers(top);
      if (playerId) {
        const rank = getPlayerRank(playerId);
        const stats = getPlayerStats(playerId);
        setPlayerRank(rank);
        setPlayerStats(stats);
      }
    };
    loadLeaderboard();
  }, [playerId]);

  // Helper: compare-and-set update with retry to reduce race conditions
  const casUpdate = async (key, updater, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      const current = await window.storage.get(key, true);
      const currentGame = current ? JSON.parse(current.value) : null;
      const originalLast = currentGame ? currentGame.lastUpdate : null;
      const updated = updater(currentGame);
      // ensure we wrote a lastUpdate
      updated.lastUpdate = Date.now();

      // re-read to check lastUpdate hasn't changed
      const check = await window.storage.get(key, true);
      const checkGame = check ? JSON.parse(check.value) : null;
      if ((checkGame && checkGame.lastUpdate) !== originalLast) {
        // someone else updated in the meantime, retry
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      await window.storage.set(key, JSON.stringify(updated), true);
      return true;
    }
    return false;
  };

  // Poll for game updates
  useEffect(() => {
    if (gameState === 'playing' && gameId) {
      pollIntervalRef.current = setInterval(() => {
        loadGameState();
      }, 2000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [gameState, gameId]);

  // Update available moves when dice or board changes
  useEffect(() => {
    if (gameState === 'playing' && dice.length > 0 && currentPlayer === playerColor) {
      const remainingDice = dice.filter((d, i) => !usedDice.includes(i));
      if (remainingDice.length > 0) {
        // IMPORTANT: pass the full dice array + usedDice so the rules engine can enforce
        // "use both dice if possible" and "forced higher die" correctly.
        const moves = GameLogic.getAvailableMoves(board, dice, currentPlayer, bar, bornOff, usedDice);
        setAvailableMoves(moves);
        
        // Show message if no moves available
        if (moves.length === 0 && usedDice.length < dice.length) {
          setMessage({ type: 'info', text: 'No valid moves available. Turn will be skipped.' });
        }
      }
    }
  }, [board, dice, usedDice, currentPlayer, playerColor, bar, bornOff, gameState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (gameState === 'playing' && currentPlayer === playerColor) {
        if (e.code === 'Space') {
          e.preventDefault();
          if (dice.length === 0) {
            rollDice();
          }
        } else if (e.code === 'KeyU') {
          e.preventDefault();
          undoMove();
        } else if (e.code === 'KeyH') {
          e.preventDefault();
          setShowHints(prev => !prev);
        } else if (e.code === 'Escape') {
          e.preventDefault();
          setGameState('lobby');
          setGameId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, currentPlayer, playerColor, dice.length, moveHistory.length]);

  const showMessage = useCallback((type, text) => {
    setMessage({ type, text });
  }, []);

  const loadGames = async () => {
    try {
      const result = await window.storage.list('bg-game:', true);
      const games = [];
      if (result && result.keys && result.keys.length > 0) {
        for (const key of result.keys) {
          try {
            const gameData = await window.storage.get(key, true);
            if (!gameData) continue;
            const game = JSON.parse(gameData.value);
            games.push({ id: key.split(':')[1], player1: game.player1, player2: game.player2, lastUpdate: game.lastUpdate });
          } catch (err) {
            console.warn('Failed to read game', key, err);
            continue;
          }
        }
      }
      setAvailableGames(games);
      if (games.length === 0) showMessage('info', 'No existing games. Create one to start.');
    } catch (error) {
      console.error('Failed to list games', error);
      showMessage('error', 'Failed to list games.');
    }
  };

  const createGame = async () => {
    setLoading(true);
    setUndoCount(0);
    setMoveHistory([]);
    try {
      const newGameId = 'game-' + Date.now();
      const initialGame = {
        id: newGameId,
        player1: { id: playerId, name: playerName || 'Player 1' },
        player2: null,
        board: INITIAL_BOARD,
        bar: { white: 0, black: 0 },
        bornOff: { white: 0, black: 0 },
        currentPlayer: 'white',
        dice: [],
        usedDice: [],
        winner: null,
        lastUpdate: Date.now()
      };

      await window.storage.set(`bg-game:${newGameId}`, JSON.stringify(initialGame), true);
      setGameId(newGameId);
      setPlayerColor('white');
      setPlayerNames(prev => ({ ...prev, white: initialGame.player1.name || prev.white }));
      setGameState('playing');
      showMessage('info', 'Game created! Waiting for opponent...');
    } catch (error) {
      console.error('Failed to create game:', error);
      showMessage('error', 'Failed to create game. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const joinGame = async (id) => {
    setLoading(true);
    setJoinConflict(null);
    setUndoCount(0);
    setMoveHistory([]);
    try {
      // Try to set player2 using CAS to reduce race conditions
      const key = `bg-game:${id}`;
      const ok = await casUpdate(key, (game) => {
        if (!game) return null;
        if (game.player2) return game; // already full
        game.player2 = { id: playerId, name: playerName || 'Player 2' };
        return game;
      }, 5);

      if (!ok) {
        // re-check whether game exists or is full and offer retry
        const gd = await window.storage.get(key, true);
        if (!gd) {
          showMessage('error', 'Game not found.');
        } else {
          const g = JSON.parse(gd.value);
          if (g.player2) showMessage('error', 'Game is already full.');
          else {
            // transient conflict — let user retry
            setJoinConflict({ gameId: id, message: 'Conflict joining game. Another player may be joining now.' });
            showMessage('error', 'Conflict joining game. You can retry.');
          }
        }
        return;
      }

      // read final game state
      const finalData = await window.storage.get(key, true);
      const finalGame = finalData ? JSON.parse(finalData.value) : null;
      if (!finalGame) {
        showMessage('error', 'Game not found.');
        return;
      }

      setGameId(id);
      setPlayerColor('black');
      setBoard(finalGame.board);
      setBar(finalGame.bar);
      setBornOff(finalGame.bornOff);
      setCurrentPlayer(finalGame.currentPlayer);
      setDice(finalGame.dice);
      setUsedDice(finalGame.usedDice);
      setOpponentConnected(!!finalGame.player1);
      setPlayerNames({ white: finalGame.player1?.name || 'Player 1', black: finalGame.player2?.name || 'Player 2' });
      setOpponentName(finalGame.player1?.id === playerId ? finalGame.player2?.name : finalGame.player1?.name);
      setGameState('playing');
      showMessage('info', 'Joined game successfully!');
    } catch (error) {
      console.error('Failed to join game:', error);
      showMessage('error', 'Failed to join game. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadGameState = async () => {
    if (!gameId) return;

    try {
      const gameData = await window.storage.get(`bg-game:${gameId}`, true);
      if (gameData) {
        const game = JSON.parse(gameData.value);
        
        setBoard(game.board);
        setBar(game.bar);
        setBornOff(game.bornOff);
        setCurrentPlayer(game.currentPlayer);
        setDice(game.dice);
        setUsedDice(game.usedDice);
        setWinner(game.winner);
        setOpponentConnected(!!game.player2);
        // update player names for header
        setPlayerNames({ white: game.player1?.name || 'Player 1', black: game.player2?.name || 'Player 2' });
        // determine opponent name
        if (game.player1 && game.player2) {
          const opp = game.player1.id === playerId ? game.player2 : game.player1;
          setOpponentName(opp.name);
        }

        if (game.winner) {
          setGameState('finished');
        }
      }
    } catch (error) {
      console.error('Failed to load game state:', error);
    }
  };

  const saveGameState = async (updates) => {
    if (!gameId) return;

    try {
      const key = `bg-game:${gameId}`;
      const ok = await casUpdate(key, (game) => {
        if (!game) return null;
        return { ...game, ...updates };
      }, 5);

      if (!ok) {
        console.warn('Failed to save game state due to concurrent updates');
        showMessage('error', 'Failed to save game state due to concurrent updates.');
      }
    } catch (error) {
      console.error('Failed to save game state:', error);
      showMessage('error', 'Failed to save game state.');
    }
  };

  const rollDice = async () => {
    if (currentPlayer !== playerColor || dice.length > 0) return;
    if (loading) return;

    setLoading(true);
    try {
      const newDice = GameLogic.rollDice();
      if (soundEnabled) {
        soundEffects.diceRoll();
      }
      // Handle doubles: if both dice are the same, player gets 4 moves of that value
      const finalDice = newDice[0] === newDice[1] ? [...newDice, ...newDice] : newDice;
      
      setDice(finalDice);
      setUsedDice([]);
      
      const moves = GameLogic.getAvailableMoves(board, finalDice, currentPlayer, bar, bornOff);
      setAvailableMoves(moves);

      if (moves.length === 0) {
        showMessage('info', 'No valid moves. Turn will be skipped.');
        // Auto-skip turn if no moves
        setTimeout(() => {
          endTurn();
        }, 1500);
      }

      await saveGameState({ dice: finalDice, usedDice: [] });
    } catch (error) {
      console.error('Failed to roll dice:', error);
      showMessage('error', 'Failed to roll dice.');
    } finally {
      setLoading(false);
    }
  };

  const endTurn = async () => {
    const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setDice([]);
    setUsedDice([]);
    setSelectedPoint(null);
    setAvailableMoves([]);
    
    await saveGameState({
      currentPlayer: nextPlayer,
      dice: [],
      usedDice: []
    });
  };

  const selectPoint = (point) => {
    if (currentPlayer !== playerColor) {
      showMessage('info', 'Not your turn.');
      return;
    }
    if (dice.length === 0) {
      showMessage('info', 'Please roll dice first.');
      return;
    }
    if (usedDice.length === dice.length) {
      showMessage('info', 'All moves completed. Waiting for opponent...');
      return;
    }

    // Check if this point has pieces to move
    if (point === 'bar' && bar[playerColor] > 0) {
      setSelectedPoint('bar');
      return;
    }

    if (typeof point === 'number' && board[point] && board[point].color === playerColor) {
      setSelectedPoint(point);
      return;
    }

    // Try to move to this point
    if (selectedPoint !== null) {
      const possibleMoves = GameLogic.getAvailableMoves(board, dice, currentPlayer, bar, bornOff, usedDice);
      
      const validMove = possibleMoves.find(m => 
        m.from === selectedPoint && (m.to === point || (point === 'off' && m.to === 'off'))
      );

      if (validMove) {
        makeMove(validMove);
      } else {
        showMessage('info', 'Invalid move. Please try again.');
      }
      
      setSelectedPoint(null);
    }
  };

  const makeMove = async (move) => {
    if (loading) return;

    setLoading(true);
    try {
      // Store move in history for undo
      setMoveHistory(prev => [...prev, { move, board, dice, usedDice, bar, bornOff }]);

      // Animate checker movement
      setMovingChecker({ from: move.from, to: move.to });
      setTimeout(() => setMovingChecker(null), 500 * gameSpeed);

      const result = GameLogic.makeMove(board, bar, bornOff, move, currentPlayer);
      
      // Play move sound
      if (soundEnabled) {
        soundEffects.moveMade();
      }
      
      setBoard(result.board);
      setBar(result.bar);
      setBornOff(result.bornOff);

      // Find and mark the used die
      const dieIndex = move.dieIndex !== undefined 
        ? move.dieIndex 
        : dice.findIndex((d, i) => d === move.die && !usedDice.includes(i));
      
      const newUsedDice = [...usedDice, dieIndex];
      setUsedDice(newUsedDice);

      const newWinner = GameLogic.checkWinner(result.bornOff);
      if (newWinner) {
        setWinner(newWinner);
        setGameState('finished');
        
        // Update stats
        const isPlayerWin = playerColor === newWinner;
        if (isPlayerWin) {
          setStats(s => ({ ...s, wins: s.wins + 1 }));
        } else {
          setStats(s => ({ ...s, losses: s.losses + 1 }));
        }
        
        // Update leaderboard
        updatePlayerStats(playerId, playerName, isPlayerWin);
        const newRank = getPlayerRank(playerId);
        const newPlayerStats = getPlayerStats(playerId);
        setPlayerRank(newRank);
        setPlayerStats(newPlayerStats);
        setTopPlayers(getTopPlayers(10));
        
        // Play victory sound and trigger confetti for player win
        if (isPlayerWin) {
          if (soundEnabled) {
            soundEffects.victory();
          }
          triggerConfetti();
          
          // Check for achievements
          const newAchievements = checkAchievements(
            { wins: stats.wins + 1, losses: stats.losses },
            undoCount,
            gameSpeed,
            showHints,
            true
          );
          if (newAchievements.length > 0) {
            newAchievements.forEach(id => {
              const achievement = ACHIEVEMENTS[id];
              if (achievement) {
                showMessage('info', `🎉 Achievement: ${achievement.name}`);
              }
            });
            setAchievements(prev => [...new Set([...prev, ...newAchievements])]);
          }
        }
        
        await saveGameState({
          board: result.board,
          bar: result.bar,
          bornOff: result.bornOff,
          winner: newWinner
        });
        return;
      }

      // Check if turn is over
      if (newUsedDice.length === dice.length) {
        await saveGameState({
          board: result.board,
          bar: result.bar,
          bornOff: result.bornOff,
          usedDice: newUsedDice
        });
        // End turn after a short delay
        setTimeout(() => {
          endTurn();
        }, 500 * gameSpeed);
      } else {
        await saveGameState({
          board: result.board,
          bar: result.bar,
          bornOff: result.bornOff,
          usedDice: newUsedDice
        });
      }
    } catch (error) {
      console.error('Failed to make move:', error);
      showMessage('error', 'Failed to make move.');
    } finally {
      setLoading(false);
    }
  };

  const undoMove = async () => {
    if (moveHistory.length === 0 || currentPlayer !== playerColor) {
      showMessage('info', 'Cannot undo now.');
      return;
    }
    const lastMove = moveHistory[moveHistory.length - 1];
    setMoveHistory(prev => prev.slice(0, -1));
    setBoard(lastMove.board);
    setDice(lastMove.dice);
    setUsedDice(lastMove.usedDice);
    setBar(lastMove.bar);
    setBornOff(lastMove.bornOff);
    setUndoCount(prev => prev + 1);
    showMessage('info', 'Move undone.');
  };

  const newGame = async () => {
    if (gameId) {
      try {
        await window.storage.delete(`bg-game:${gameId}`, true);
      } catch (error) {
        console.error('Failed to delete old game:', error);
      }
    }
    
    setGameState('lobby');
    setGameId(null);
    setPlayerColor(null);
    setBoard(INITIAL_BOARD);
    setBar({ white: 0, black: 0 });
    setBornOff({ white: 0, black: 0 });
    setDice([]);
    setUsedDice([]);
    setCurrentPlayer('white');
    setSelectedPoint(null);
    setAvailableMoves([]);
    setWinner(null);
    setOpponentConnected(false);
    setMessage(null);
  };

  // Memoized checker renderer
  const renderChecker = useCallback((color, index, isMoving = false) => (
    <div
      key={index}
      className={`checker ${isMoving ? 'moving' : ''}`}
      style={{
        backgroundColor: color === 'white' ? '#f5e6d3' : '#2c1810',
        border: `2px solid ${color === 'white' ? '#d4c5b0' : '#1a0f08'}`,
        boxShadow: color === 'white' 
          ? '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)'
          : '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}
    />
  ), []);

  // Memoized point renderer
  const renderPoint = useCallback((pointIndex, isTop) => {
    const pointData = board[pointIndex];
    const checkers = pointData ? Array(Math.min(pointData.count, 5)).fill(pointData.color) : [];
    const overflow = pointData && pointData.count > 5 ? pointData.count - 5 : 0;

    const isSelected = selectedPoint === pointIndex;
    const isValidMove = availableMoves.some(m => m.to === pointIndex);
    const isMovingFrom = movingChecker && movingChecker.from === pointIndex;
    const isMovingTo = movingChecker && movingChecker.to === pointIndex;

    return (
      <div
        key={pointIndex}
        className={`point ${isTop ? 'top' : 'bottom'} ${isSelected ? 'selected' : ''} ${isValidMove ? 'valid-move' : ''}`}
        onClick={() => selectPoint(pointIndex)}
      >
        <div className="point-triangle" style={{
          borderBottomColor: pointIndex % 2 === 0 ? '#8b4513' : '#f4a460',
          borderTopColor: pointIndex % 2 === 0 ? '#8b4513' : '#f4a460',
        }} />
        {showHints && isValidMove && (
          <div className="hint-marker">✦</div>
        )}
        <div className={`checkers ${isTop ? 'top-checkers' : 'bottom-checkers'}`}>
          {checkers.map((color, i) => renderChecker(color, i, isMovingFrom && i === checkers.length - 1))}
          {overflow > 0 && (
            <div className="overflow-count">+{overflow}</div>
          )}
        </div>
      </div>
    );
  }, [board, selectedPoint, availableMoves, movingChecker, renderChecker, showHints]);

  // Check if dice are doubles
  const isDoubles = useMemo(() => {
    if (dice.length < 2) return false;
    return dice[0] === dice[1] && dice.length === 4;
  }, [dice]);

  if (gameState === 'lobby') {
    return (
      <div className="backgammon-container lobby">
        <div className="lobby-content">
          <div className="logo-section">
            <Swords size={80} strokeWidth={1.5} />
            <h1>BACKGAMMON</h1>
            <p className="tagline">The Ancient Game of Strategy</p>
          </div>
          
          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="lobby-actions">
            <button 
              className="primary-btn" 
              onClick={createGame}
              disabled={loading}
            >
              {loading ? <span className="loading" /> : <Crown size={20} />}
              {loading ? 'Creating...' : 'Create New Game'}
            </button>
            <button 
              className="secondary-btn" 
              onClick={loadGames}
              disabled={loading}
            >
              {loading ? <span className="loading" /> : <Users size={20} />}
              {loading ? 'Loading...' : 'Refresh Games'}
            </button>
            <button
              className="secondary-btn"
              onClick={() => startAIBots(1, aiSkill, aiPersonality)}
              disabled={loading}
            >
              Add AI Opponent
            </button>
            <button
              className="secondary-btn"
              onClick={() => stopAIBots()}
              disabled={loading}
            >
              Stop AI Opponents ({activeBots().length})
            </button>
          </div>

          <div className="name-input">
            <label>Your name</label>
            <input value={playerName || ''} onChange={e => setPlayerName(e.target.value)} placeholder="Enter name" />
          </div>

          <div className="ai-skill">
            <label>AI Difficulty</label>
            <div className="skill-slider">
              <input type="range" min="0" max="1" step="0.1" value={aiSkill} onChange={e => setAiSkill(parseFloat(e.target.value))} />
              <span className="skill-label">{['Easy', 'Medium', 'Hard'][Math.round(aiSkill * 2)]}</span>
            </div>
          </div>

          <div className="ai-controls">
            <label>AI Skill: {Math.round(aiSkill * 100)}%</label>
            <input type="range" min="0" max="1" step="0.05" value={aiSkill} onChange={e => setAiSkill(parseFloat(e.target.value))} />
          </div>

          <div className="ai-personality">
            <label>AI Style</label>
            <select value={aiPersonality} onChange={e => setAiPersonality(e.target.value)}>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive (hit-focused)</option>
              <option value="defensive">Defensive (safety-focused)</option>
            </select>
          </div>

          <div className="theme-switcher">
            <label>Theme</label>
            <div className="theme-buttons">
              <button 
                className={`theme-btn ${theme === 'classic' ? 'active' : ''}`} 
                onClick={() => setTheme('classic')}
                title="Classic Gold Theme"
              >
                🏛️ Classic
              </button>
              <button 
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} 
                onClick={() => setTheme('dark')}
                title="Dark Blue Theme"
              >
                🌙 Dark
              </button>
              <button 
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`} 
                onClick={() => setTheme('light')}
                title="Light Theme"
              >
                ☀️ Light
              </button>
            </div>
          </div>

          {joinConflict && (
            <div className="join-conflict">
              <p>{joinConflict.message}</p>
              <button className="small-btn" onClick={() => { if (joinConflict) joinGame(joinConflict.gameId); setJoinConflict(null); }}>Retry</button>
              <button className="small-btn" onClick={() => setJoinConflict(null)}>Dismiss</button>
            </div>
          )}

          {availableGames && availableGames.length > 0 && (
            <div className="games-list">
              <h4>Available Games</h4>
              <ul>
                {availableGames.map(g => (
                  <li key={g.id} className="game-item">
                    <span>{g.id} {g.player2 ? '(Full)' : '(Open)'} — {typeof g.player1 === 'string' ? g.player1 : g.player1?.name} vs {g.player2 ? (typeof g.player2 === 'string' ? g.player2 : g.player2?.name) : 'waiting'}</span>
                    {!g.player2 && (
                      <button className="small-btn" onClick={() => joinGame(g.id)}>Join</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="lobby-info">
            <p>Multiplayer backgammon platform with real-time gameplay</p>
            <p className="small">Games are shared - your opponent will join automatically</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="backgammon-container">
      <div className="game-wrapper">
        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="game-header">
          <div className="player-info">
            <div className={`player-badge white ${currentPlayer === 'white' ? 'active' : ''}`}>
              W
            </div>
            <div className="player-details">
              <h3>{playerNames.white} {playerColor === 'white' && '(You)'}</h3>
              <p>White Pieces</p>
              {gameState === 'playing' && (
                <div className="stats-mini">
                  <span title="Pips to bear off">📊 {GameLogic.calculatePipCount(board, bar, 'white')} pips</span>
                </div>
              )}
            </div>
          </div>

          {opponentConnected ? (
            <div className="connection-status">
              <div className="status-dot" />
              <span>{opponentName ? `Opponent: ${opponentName}` : 'Opponent Connected'}</span>
            </div>
          ) : (
            <div className="connection-status" style={{ background: 'rgba(139, 69, 19, 0.2)', color: '#a8875f' }}>
              <div className="status-dot" style={{ background: '#8b4513', animation: 'none' }} />
              <span>Waiting for opponent...</span>
            </div>
          )}

          <div className="player-info">
            <div className="player-details" style={{ textAlign: 'right' }}>
              <h3>{playerNames.black} {playerColor === 'black' && '(You)'}</h3>
              <p>Black Pieces</p>
              {gameState === 'playing' && (
                <div className="stats-mini">
                  <span title="Pips to bear off">📊 {GameLogic.calculatePipCount(board, bar, 'black')} pips</span>
                </div>
              )}
            </div>
            <div className={`player-badge black ${currentPlayer === 'black' ? 'active' : ''}`}>
              B
            </div>
          </div>
        </div>

        <div className="board-container">
          <div className="board">
            <div className="top-points">
              {[12, 13, 14, 15, 16, 17].map(i => renderPoint(i, true))}
              <div className="bar-section">
                {bar.white > 0 && (
                  <div className="bar-checkers" onClick={() => selectPoint('bar')}>
                    {Array(Math.min(bar.white, 3)).fill('white').map((color, i) => 
                      renderChecker(color, i)
                    )}
                    {bar.white > 3 && <div className="overflow-count">+{bar.white - 3}</div>}
                  </div>
                )}
              </div>
              {[18, 19, 20, 21, 22, 23].map(i => renderPoint(i, true))}
            </div>

            <div className="bottom-points">
              {[11, 10, 9, 8, 7, 6].map(i => renderPoint(i, false))}
              <div className="bar-section">
                {bar.black > 0 && (
                  <div className="bar-checkers" onClick={() => selectPoint('bar')}>
                    {Array(Math.min(bar.black, 3)).fill('black').map((color, i) => 
                      renderChecker(color, i)
                    )}
                    {bar.black > 3 && <div className="overflow-count">+{bar.black - 3}</div>}
                  </div>
                )}
              </div>
              {[5, 4, 3, 2, 1, 0].map(i => renderPoint(i, false))}
            </div>
          </div>
        </div>

        <div className="game-controls">
          <div className="dice-container">
            <button 
              className="roll-btn" 
              onClick={rollDice}
              disabled={currentPlayer !== playerColor || dice.length > 0 || loading}
            >
              {loading ? <span className="loading" /> : <Dices size={20} />}
              {dice.length > 0 ? 'Dice Rolled' : 'Roll Dice'}
            </button>
            {dice.map((die, i) => (
              <div 
                key={i} 
                className={`die ${usedDice.includes(i) ? 'used' : ''} ${isDoubles ? 'doubles' : ''}`}
              >
                {die}
              </div>
            ))}
          </div>

          <div className="score-section">
            <div className="score-item">
              <h4>White Off</h4>
              <div className="score">{bornOff.white}/15</div>
            </div>
            <div className="score-item">
              <h4>Black Off</h4>
              <div className="score">{bornOff.black}/15</div>
            </div>
            <div className="score-item">
              <h4>Stats</h4>
              <div className="score">{stats.wins}W-{stats.losses}L</div>
            </div>
          </div>

          <div className="game-settings">
            <button 
              className="small-btn" 
              onClick={undoMove}
              disabled={moveHistory.length === 0 || currentPlayer !== playerColor}
              title="Undo last move"
            >
              ↶ Undo
            </button>
            <button 
              className="small-btn"
              onClick={() => setShowHints(!showHints)}
              title="Toggle move hints"
            >
              {showHints ? '💡' : '○'} Hints
            </button>
            <button 
              className="small-btn"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title="Toggle sound"
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
          </div>

          <div className="keyboard-hints">
            <small>⌨️ Shortcuts: SPACE=Roll | U=Undo | H=Hints | ESC=Exit</small>
          </div>

          <button className="new-game-btn" onClick={newGame}>
            <RefreshCw size={16} />
            New Game
          </button>
        </div>
      </div>

      {winner && (
        <div className="winner-overlay">
          <div className="winner-content">
            <Crown size={80} />
            <h2>Victory!</h2>
            <p>{winner === 'white' ? 'Player 1' : 'Player 2'} ({winner}) wins the game!</p>
            <button className="primary-btn" onClick={newGame}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced Backgammon game logic with proper rule enforcement

export const INITIAL_BOARD = {
  0: { color: 'white', count: 2 },
  11: { color: 'white', count: 5 },
  16: { color: 'white', count: 3 },
  18: { color: 'white', count: 5 },
  23: { color: 'black', count: 2 },
  12: { color: 'black', count: 5 },
  7: { color: 'black', count: 3 },
  5: { color: 'black', count: 5 },
};

export const GameLogic = {
  rollDice: () => {
    return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
  },

  // Get the home board range for a color
  getHomeBoard: (color) => {
    return color === 'white' ? { start: 18, end: 24 } : { start: 0, end: 6 };
  },

  // Check if all pieces of a color are in home board
  isInHomeBoard: (board, color, bar) => {
    if (bar[color] > 0) return false; // Pieces on bar aren't in home board
    
    const homeBoard = GameLogic.getHomeBoard(color);
    for (let i = 0; i < 24; i++) {
      if (board[i] && board[i].color === color) {
        if (i < homeBoard.start || i >= homeBoard.end) {
          return false;
        }
      }
    }
    return true;
  },

  // Get blocked points (2+ opponent pieces)
  getBlockedPoints: (board, color) => {
    const blocked = new Set();
    const oppColor = color === 'white' ? 'black' : 'white';
    
    for (let i = 0; i < 24; i++) {
      if (board[i] && board[i].color === oppColor && board[i].count >= 2) {
        blocked.add(i);
      }
    }
    return blocked;
  },

  // Check if a point is safe to move to
  canMoveToPoint: (board, point, color) => {
    if (!board[point]) return true; // Empty point
    if (board[point].color === color) return true; // Own piece(s)
    return board[point].count === 1; // Can hit single opponent piece
  },

  // Check bearing off rules
  canBearOff: (board, bar, fromPoint, die, color) => {
    // Must be in home board
    if (!GameLogic.isInHomeBoard(board, color, bar)) return false;

    // Exact bear off
    const distance = color === 'white' ? 24 - fromPoint : fromPoint + 1;
    if (distance === die) return true;

    // Bear off with higher die only if no pieces further back
    if (distance < die) {
      if (color === 'white') {
        // Check for pieces between fromPoint and 24
        for (let i = fromPoint + 1; i < 24; i++) {
          if (board[i] && board[i].color === color) return false;
        }
      } else {
        // Check for pieces between 0 and fromPoint
        for (let i = 0; i < fromPoint; i++) {
          if (board[i] && board[i].color === color) return false;
        }
      }
      return true;
    }

    return false;
  },

  // Generate all legal single moves that use a specific die (dieIndex) given current position.
  // This enforces *bar priority* (if you have checkers on the bar, you may only enter from the bar).
  _singleMovesForDie: (board, die, dieIndex, color, bar) => {
    const moves = [];
    const blocked = GameLogic.getBlockedPoints(board, color);

    // Bar priority
    if (bar[color] > 0) {
      const targetPoint = color === 'white' ? 24 - die : die - 1;
      if (targetPoint >= 0 && targetPoint < 24 && !blocked.has(targetPoint) && GameLogic.canMoveToPoint(board, targetPoint, color)) {
        moves.push({ from: 'bar', to: targetPoint, die, dieIndex, mustUse: true, isHit: !!(board[targetPoint] && board[targetPoint].color !== color) });
      }
      return moves;
    }

    const inHome = GameLogic.isInHomeBoard(board, color, bar);

    for (let point = 0; point < 24; point++) {
      if (!board[point] || board[point].color !== color) continue;

      const targetPoint = color === 'white' ? point + die : point - die;

      // Bearing off
      if (inHome && ((color === 'white' && targetPoint >= 24) || (color === 'black' && targetPoint < 0))) {
        if (GameLogic.canBearOff(board, bar, point, die, color)) {
          moves.push({ from: point, to: 'off', die, dieIndex, score: 100 });
        }
        continue;
      }

      // Normal moves
      if (targetPoint >= 0 && targetPoint < 24 && !blocked.has(targetPoint) && GameLogic.canMoveToPoint(board, targetPoint, color)) {
        const isHit = !!(board[targetPoint] && board[targetPoint].color !== color);
        moves.push({ from: point, to: targetPoint, die, dieIndex, isHit, score: isHit ? 50 : 0 });
      }
    }

    return moves;
  },

  // Generate all legal move *sequences* for a given dice roll (max 4 dice when doubles).
  // Backgammon rule enforcement:
  // - Must enter from the bar before any other move.
  // - If you can play both dice, you must.
  // - If you can only play one die, you must play the higher die (when dice differ).
  // The returned sequences are arrays of moves (each move has dieIndex).
  getLegalMoveSequences: (board, dice, color, bar, bornOff, usedDice = []) => {
    const sequences = [];

    const recurse = (curBoard, curBar, curBornOff, remainingIdx, seq) => {
      let extended = false;
      for (const i of remainingIdx) {
        const die = dice[i];
        const singleMoves = GameLogic._singleMovesForDie(curBoard, die, i, color, curBar);
        for (const mv of singleMoves) {
          extended = true;
          const res = GameLogic.makeMove(curBoard, curBar, curBornOff, mv, color);
          const nextRemaining = remainingIdx.filter(x => x !== i);
          recurse(res.board, res.bar, res.bornOff, nextRemaining, [...seq, mv]);
        }
      }
      if (!extended) {
        sequences.push(seq);
      }
    };

    const usedSet = new Set(usedDice);
    const idxs = dice.map((_, i) => i).filter(i => !usedSet.has(i));
    recurse(board, bar, bornOff, idxs, []);

    // Filter to sequences that use the maximum number of dice.
    const maxLen = sequences.reduce((m, s) => Math.max(m, s.length), 0);
    let best = sequences.filter(s => s.length === maxLen);

    // If only one die can be played (maxLen === 1), the higher die must be played when dice differ.
    if (maxLen === 1 && dice.length >= 2) {
      const uniqueVals = Array.from(new Set(dice));
      if (uniqueVals.length > 1) {
        const high = Math.max(...dice);
        const hasHigh = best.some(s => s[0] && s[0].die === high);
        if (hasHigh) best = best.filter(s => s[0] && s[0].die === high);
      }
    }

    // De-duplicate identical sequences (same from/to/dieIndex order)
    const key = (s) => s.map(m => `${m.from}->${m.to}:${m.dieIndex}`).join('|');
    const seen = new Set();
    const deduped = [];
    for (const s of best) {
      const k = key(s);
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(s);
      }
    }
    return deduped;
  },

  // Get all legal moves for current dice state
  getAvailableMoves: (board, dice, color, bar, bornOff, usedDice = []) => {
    // Compute all legal sequences, enforce "use maximum dice" and "forced higher die" rules,
    // then return the set of legal *next* moves (first move of any best sequence).
    const sequences = GameLogic.getLegalMoveSequences(board, dice, color, bar, bornOff, usedDice);
    if (!sequences.length) return [];

    const firstMoves = new Map();
    for (const seq of sequences) {
      if (!seq.length) continue;
      const m = seq[0];
      const k = `${m.from}|${m.to}|${m.dieIndex}`;
      if (!firstMoves.has(k)) firstMoves.set(k, m);
    }
    return Array.from(firstMoves.values());
  },

  // Make a move and update board state
  makeMove: (board, bar, bornOff, move, color) => {
    const newBoard = {};
    const newBar = { ...bar };
    const newBornOff = { ...bornOff };

    // Deep copy board state
    for (let i = 0; i < 24; i++) {
      if (board[i]) {
        newBoard[i] = { ...board[i] };
      }
    }

    // Move from bar (entering home board)
    if (move.from === 'bar') {
      newBar[color]--;
      
      // Hit opponent if present
      if (newBoard[move.to] && newBoard[move.to].color !== color) {
        newBar[newBoard[move.to].color]++;
        delete newBoard[move.to];
      }
      
      // Add to target point
      if (newBoard[move.to]) {
        newBoard[move.to].count++;
      } else {
        newBoard[move.to] = { color, count: 1 };
      }
    }
    // Bear off (remove from game)
    else if (move.to === 'off') {
      newBoard[move.from].count--;
      if (newBoard[move.from].count === 0) {
        delete newBoard[move.from];
      }
      newBornOff[color]++;
    }
    // Normal move
    else {
      newBoard[move.from].count--;
      if (newBoard[move.from].count === 0) {
        delete newBoard[move.from];
      }

      // Hit opponent if present
      if (newBoard[move.to] && newBoard[move.to].color !== color) {
        newBar[newBoard[move.to].color]++;
        delete newBoard[move.to];
      }

      // Add to target point
      if (newBoard[move.to]) {
        newBoard[move.to].count++;
      } else {
        newBoard[move.to] = { color, count: 1 };
      }
    }

    return { board: newBoard, bar: newBar, bornOff: newBornOff };
  },

  // Check for winner (first to bear off all pieces)
  checkWinner: (bornOff) => {
    if (bornOff.white >= 15) return 'white';
    if (bornOff.black >= 15) return 'black';
    return null;
  },

  // Check if player has any valid moves
  hasValidMoves: (board, dice, color, bar, bornOff, usedDice = []) => {
    const moves = GameLogic.getAvailableMoves(board, dice, color, bar, bornOff, usedDice);
    return moves.length > 0;
  },

  // Calculate pip count (distance to bear off)
  calculatePipCount: (board, bar, color) => {
    let pips = 0;
    
    // Pieces on bar need to reach home (24 pips away for white, 24 for black)
    pips += bar[color] * 24;
    
    // Regular pieces
    for (let i = 0; i < 24; i++) {
      if (board[i] && board[i].color === color) {
        const distance = color === 'white' ? (24 - i) : (i + 1);
        pips += distance * board[i].count;
      }
    }
    
    return pips;
  },

  // Get game statistics
  getGameStats: (board, bar, bornOff, color) => {
    const stats = {
      piecesOnBar: bar[color],
      piecesBornOff: bornOff[color],
      pipCount: GameLogic.calculatePipCount(board, bar, color),
      blots: 0, // Vulnerable single pieces
      blockedPoints: 0 // Points with 2+ pieces
    };

    // Count blots and blocked points
    for (let i = 0; i < 24; i++) {
      if (board[i] && board[i].color === color) {
        if (board[i].count === 1) {
          stats.blots++;
        } else if (board[i].count >= 2) {
          stats.blockedPoints++;
        }
      }
    }

    return stats;
  }
};

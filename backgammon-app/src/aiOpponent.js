// Stronger local AI opponent for the backgammon demo.
//
// Improvements over the baseline bot:
// - Plans across the *full turn* using GameLogic.getLegalMoveSequences (max dice + forced-high-die rules).
// - Uses a richer evaluation: pip race vs contact play, bar pressure, primes, anchors, blot/hit-risk.
// - Skill-scaled 1-ply lookahead: samples opponent dice and assumes the opponent plays a best reply.
// - Personality parameter: balanced / aggressive / defensive.

import { GameLogic } from './gameLogic';

const bots = new Map();

async function casUpdate(key, updater, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const current = await window.storage.get(key, true);
    const currentGame = current ? JSON.parse(current.value) : null;
    const originalLast = currentGame ? currentGame.lastUpdate : null;
    const updated = updater(currentGame);
    if (!updated) return false;
    updated.lastUpdate = Date.now();

    const check = await window.storage.get(key, true);
    const checkGame = check ? JSON.parse(check.value) : null;
    if ((checkGame && checkGame.lastUpdate) !== originalLast) {
      await new Promise(r => setTimeout(r, 50));
      continue;
    }

    await window.storage.set(key, JSON.stringify(updated), true);
    return true;
  }
  return false;
}

const oppOf = (c) => (c === 'white' ? 'black' : 'white');

function deepCopyBoard(board) {
  const b = {};
  for (let i = 0; i < 24; i++) {
    if (board[i]) b[i] = { color: board[i].color, count: board[i].count };
  }
  return b;
}

function applySequence(board, bar, bornOff, seq, color) {
  let b = deepCopyBoard(board);
  let br = { ...bar };
  let bo = { ...bornOff };
  for (const mv of seq) {
    const r = GameLogic.makeMove(b, br, bo, mv, color);
    b = r.board;
    br = r.bar;
    bo = r.bornOff;
  }
  return { board: b, bar: br, bornOff: bo };
}

function pointsMade(board, color) {
  let n = 0;
  for (let i = 0; i < 24; i++) {
    if (board[i] && board[i].color === color && board[i].count >= 2) n++;
  }
  return n;
}

function blots(board, color) {
  let n = 0;
  for (let i = 0; i < 24; i++) {
    if (board[i] && board[i].color === color && board[i].count === 1) n++;
  }
  return n;
}

function homeBoardMade(board, color) {
  const home = GameLogic.getHomeBoard(color);
  let n = 0;
  for (let i = home.start; i < home.end; i++) {
    if (board[i] && board[i].color === color && board[i].count >= 2) n++;
  }
  return n;
}

function anchors(board, color) {
  // Made points in opponent home board.
  const opp = oppOf(color);
  const home = GameLogic.getHomeBoard(opp);
  let n = 0;
  for (let i = home.start; i < home.end; i++) {
    if (board[i] && board[i].color === color && board[i].count >= 2) n++;
  }
  return n;
}

function primeMaxLen(board, color) {
  // Longest consecutive run of made points (>=2).
  let best = 0;
  let cur = 0;
  for (let i = 0; i < 24; i++) {
    if (board[i] && board[i].color === color && board[i].count >= 2) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

function checkerPositions(board, color) {
  const pos = [];
  for (let i = 0; i < 24; i++) {
    if (board[i] && board[i].color === color) {
      for (let k = 0; k < board[i].count; k++) pos.push(i);
    }
  }
  return pos;
}

function hasContact(board) {
  // Rough: if players' checker ranges overlap along the track.
  const w = checkerPositions(board, 'white');
  const b = checkerPositions(board, 'black');
  if (!w.length || !b.length) return false;
  const wMin = Math.min(...w), wMax = Math.max(...w);
  const bMin = Math.min(...b), bMax = Math.max(...b);
  return !(wMax < bMin || bMax < wMin);
}

function hitRiskEstimate(board, color) {
  // Estimate how many opponent "direct" hits exist against our blots in one roll.
  // This is approximate but consistently makes the bot stop hanging blots.
  const opp = oppOf(color);
  const oppBlocked = GameLogic.getBlockedPoints(board, opp);
  let risk = 0;

  for (let blotPt = 0; blotPt < 24; blotPt++) {
    if (!board[blotPt] || board[blotPt].color !== color || board[blotPt].count !== 1) continue;

    for (let from = 0; from < 24; from++) {
      if (!board[from] || board[from].color !== opp) continue;
      const dist = opp === 'white' ? (blotPt - from) : (from - blotPt);
      if (dist >= 1 && dist <= 6) {
        if (!oppBlocked.has(blotPt)) {
          risk += 1;
          break;
        }
      }
    }
  }
  return risk;
}

function sideEval(board, bar, bornOff, color) {
  const opp = oppOf(color);
  const myPips = GameLogic.calculatePipCount(board, bar, color);
  const myOff = bornOff[color] || 0;
  const myBar = bar[color] || 0;
  const oppBar = bar[opp] || 0;

  const contact = hasContact(board);

  let score = 0;

  // Race core
  score += myOff * 30;
  score -= myPips * (contact ? 0.95 : 1.35);
  score -= myBar * 55;

  // Structure
  const made = pointsMade(board, color);
  score += made * (contact ? 6.5 : 3.0);

  const myBlots = blots(board, color);
  const risk = hitRiskEstimate(board, color);
  score -= myBlots * (contact ? 10.0 : 4.0);
  score -= risk * (contact ? 8.0 : 3.0);

  // Prime/anchors are mainly contact-play features.
  const prime = primeMaxLen(board, color);
  if (contact) score += Math.max(0, prime - 2) * 10 + prime * prime * 1.5;

  const anch = anchors(board, color);
  if (contact) score += anch * 7.5;

  // Opponent on bar -> home board points are huge.
  const hb = homeBoardMade(board, color);
  if (oppBar > 0) score += hb * 14;

  return score;
}

function positionDiff(board, bar, bornOff, color) {
  const opp = oppOf(color);
  return sideEval(board, bar, bornOff, color) - sideEval(board, bar, bornOff, opp);
}

function seqTacticalBonus(seq) {
  let hits = 0;
  let offs = 0;
  for (const m of seq) {
    if (m && m.isHit) hits++;
    if (m && m.to === 'off') offs++;
  }
  return { hits, offs };
}

function sampleDicePair() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const base = [d1, d2];
  return d1 === d2 ? [...base, ...base] : base;
}

function bestOpponentReplyDiff(board, bar, bornOff, oppColor, dice) {
  const seqs = GameLogic.getLegalMoveSequences(board, dice, oppColor, bar, bornOff, []);
  if (!seqs.length) return positionDiff(board, bar, bornOff, oppColor);
  let best = -Infinity;
  for (const seq of seqs) {
    const after = applySequence(board, bar, bornOff, seq, oppColor);
    const d = positionDiff(after.board, after.bar, after.bornOff, oppColor);
    if (d > best) best = d;
  }
  return best;
}

function scoreSequence(game, seq, botColor, skill = 0.8, personality = 'balanced') {
  const board = game.board || {};
  const bar = game.bar || { white: 0, black: 0 };
  const bornOff = game.bornOff || { white: 0, black: 0 };

  const after = applySequence(board, bar, bornOff, seq, botColor);
  let score = positionDiff(after.board, after.bar, after.bornOff, botColor);

  // Tactical bonuses (skill/personality tuned)
  const { hits, offs } = seqTacticalBonus(seq);
  let hitW = 45;
  let offW = 55;
  let safetyW = 1.0;
  if (personality === 'aggressive') {
    hitW = 85;
    offW = 50;
    safetyW = 0.75;
  } else if (personality === 'defensive') {
    hitW = 30;
    offW = 65;
    safetyW = 1.25;
  }
  const k = 0.6 + 1.8 * (skill || 0.8);
  score += hits * hitW * k;
  score += offs * offW * k;

  // Extra safety preference: reduce our blot count after move.
  const beforeBlots = blots(board, botColor);
  const afterBlots = blots(after.board, botColor);
  score += (beforeBlots - afterBlots) * 18 * k * safetyW;

  // Skill-based 1-ply lookahead: sample opponent dice and assume best reply.
  if ((skill || 0.8) >= 0.45) {
    const opp = oppOf(botColor);
    const samples = Math.max(2, Math.round(2 + (skill || 0.8) * 6));
    const w = 0.12 + (skill || 0.8) * 0.34;
    let acc = 0;
    for (let i = 0; i < samples; i++) {
      const dice = sampleDicePair();
      const oppBest = bestOpponentReplyDiff(after.board, after.bar, after.bornOff, opp, dice);
      acc += -oppBest; // opponent best from their POV -> negate for our POV
    }
    score = score * (1 - w) + (acc / samples) * w;
  }

  // Small noise at low skill to avoid being too robotic.
  score += Math.random() * 12 * (1 - Math.min(1, (skill || 0.8)));
  return score;
}

function chooseMoveFromLegalSequences(game, botColor, skill = 0.8, personality = 'balanced') {
  const board = game.board || {};
  const bar = game.bar || { white: 0, black: 0 };
  const bornOff = game.bornOff || { white: 0, black: 0 };
  const dice = game.dice || [];
  const usedDice = game.usedDice || [];

  const sequences = GameLogic.getLegalMoveSequences(board, dice, botColor, bar, bornOff, usedDice);
  if (!sequences.length) return null;

  let bestSeq = sequences[0];
  let bestScore = -Infinity;
  for (const seq of sequences) {
    const s = scoreSequence(game, seq, botColor, skill, personality);
    if (s > bestScore) {
      bestScore = s;
      bestSeq = seq;
    }
  }
  return bestSeq.length ? bestSeq[0] : null;
}

function performBotTurn(key, bot) {
  (async () => {
    const gd = await window.storage.get(key, true);
    if (!gd) return;
    const game = JSON.parse(gd.value);
    if (!game) return;

    // determine bot side
    let botColor = null;
    if (game.player1 && game.player1.id === bot.id) botColor = 'white';
    if (game.player2 && game.player2.id === bot.id) botColor = 'black';
    if (!botColor) return;

    if (game.winner) return;
    if (game.currentPlayer !== botColor) return;

    // If no dice, roll
    if (!game.dice || game.dice.length === 0) {
      const newDice = GameLogic.rollDice();
      const finalDice = newDice[0] === newDice[1] ? [...newDice, ...newDice] : newDice;
      await casUpdate(key, (g) => {
        if (!g) return null;
        if (g.currentPlayer !== botColor) return g;
        g.dice = finalDice;
        g.usedDice = [];
        return g;
      }, 5);
      return;
    }

    // Determine best legal next move by full-turn search.
    const move = chooseMoveFromLegalSequences(game, botColor, bot.skill || 0.8, bot.personality || 'balanced');

    if (!move) {
      // No moves -> end turn
      await casUpdate(key, (g) => {
        if (!g) return null;
        if (g.currentPlayer !== botColor) return g;
        g.currentPlayer = botColor === 'white' ? 'black' : 'white';
        g.dice = [];
        g.usedDice = [];
        return g;
      }, 5);
      return;
    }

    const result = GameLogic.makeMove(
      game.board || {},
      game.bar || { white: 0, black: 0 },
      game.bornOff || { white: 0, black: 0 },
      move,
      botColor
    );
    const dieIndex = move.dieIndex;

    await casUpdate(key, (g) => {
      if (!g) return null;
      if (g.currentPlayer !== botColor) return g;
      g.board = result.board;
      g.bar = result.bar;
      g.bornOff = result.bornOff;
      g.usedDice = Array.isArray(g.usedDice) ? [...g.usedDice, dieIndex] : [dieIndex];

      if ((g.bornOff && g.bornOff[botColor] === 15)) {
        g.winner = botColor;
        return g;
      }

      if (g.usedDice.length >= g.dice.length) {
        g.currentPlayer = botColor === 'white' ? 'black' : 'white';
        g.dice = [];
        g.usedDice = [];
      }
      return g;
    }, 5);

    // Keep going to consume remaining dice in this turn.
    setTimeout(() => performBotTurn(key, bot), 90);
  })();
}

export function startAIBots(count = 1, skill = 0.8, personality = 'balanced') {
  for (let i = 0; i < count; i++) {
    const id = 'bot-' + i + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const bot = { id, name: `Bot ${id.slice(-4)}`, skill, personality };
    const poll = setInterval(async () => {
      try {
        const res = await window.storage.list('bg-game:', true);
        if (!res || !res.keys) return;

        // Join open games.
        for (const key of res.keys) {
          const gd = await window.storage.get(key, true);
          if (!gd) continue;
          const g = JSON.parse(gd.value);
          if (g && !g.player2) {
            await casUpdate(key, (game) => {
              if (!game) return null;
              if (game.player2) return game;
              game.player2 = { id: bot.id, name: bot.name };
              return game;
            }, 5);
          }
        }

        // Play turns.
        for (const key of res.keys) {
          const gd = await window.storage.get(key, true);
          if (!gd) continue;
          const g = JSON.parse(gd.value);
          if (!g) continue;
          if ((g.player1 && g.player1.id === bot.id) || (g.player2 && g.player2.id === bot.id)) {
            performBotTurn(key, bot);
          }
        }
      } catch (e) {
        console.warn('AI poll error', e);
      }
    }, 1200);
    bots.set(bot.id, { bot, poll });
  }
}

export function stopAIBots() {
  for (const [id, data] of bots.entries()) {
    clearInterval(data.poll);
    bots.delete(id);
  }
}

export function activeBots() {
  return Array.from(bots.keys());
}

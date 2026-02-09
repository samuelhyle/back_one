// Leaderboard and player ranking system

const LEADERBOARD_KEY = 'bg-leaderboard';

export function getLeaderboard() {
  const saved = localStorage.getItem(LEADERBOARD_KEY);
  return saved ? JSON.parse(saved) : {};
}

export function updatePlayerStats(playerId, playerName, playerWon) {
  const leaderboard = getLeaderboard();
  
  if (!leaderboard[playerId]) {
    leaderboard[playerId] = {
      id: playerId,
      name: playerName,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      lastPlayed: null,
      bestStreak: 0,
      currentStreak: 0,
      rating: 1200 // Elo-style rating
    };
  }

  const player = leaderboard[playerId];
  player.name = playerName; // Update name in case it changed
  player.gamesPlayed++;
  player.lastPlayed = new Date().toISOString();

  if (playerWon) {
    player.wins++;
    player.currentStreak++;
    if (player.currentStreak > player.bestStreak) {
      player.bestStreak = player.currentStreak;
    }
    player.rating += 16; // ELO-style rating bump
  } else {
    player.losses++;
    player.currentStreak = 0;
    player.rating = Math.max(player.rating - 16, 800); // Floor at 800
  }

  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
  return player;
}

export function getTopPlayers(limit = 10) {
  const leaderboard = getLeaderboard();
  
  return Object.values(leaderboard)
    .sort((a, b) => {
      // Sort by wins first, then win rate, then rating
      const aWinRate = a.gamesPlayed > 0 ? (a.wins / a.gamesPlayed) : 0;
      const bWinRate = b.gamesPlayed > 0 ? (b.wins / b.gamesPlayed) : 0;
      
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (Math.abs(aWinRate - bWinRate) > 0.01) return bWinRate - aWinRate;
      return b.rating - a.rating;
    })
    .slice(0, limit);
}

export function getPlayerStats(playerId) {
  const leaderboard = getLeaderboard();
  return leaderboard[playerId] || null;
}

export function getPlayerRank(playerId) {
  const topPlayers = getTopPlayers(100);
  return topPlayers.findIndex(p => p.id === playerId) + 1;
}

export function formatWinRate(player) {
  if (player.gamesPlayed === 0) return '—';
  const rate = ((player.wins / player.gamesPlayed) * 100).toFixed(1);
  return `${rate}%`;
}

export function formatRating(rating) {
  return Math.round(rating);
}

export function getRatingBracket(rating) {
  if (rating >= 1800) return '👑 Master';
  if (rating >= 1600) return '🥇 Expert';
  if (rating >= 1400) return '🥈 Advanced';
  if (rating >= 1200) return '🥉 Intermediate';
  return '🌱 Beginner';
}

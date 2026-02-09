// Achievements tracking
export const ACHIEVEMENTS = {
  first_win: { id: 'first_win', name: 'First Victory', desc: 'Win your first game', icon: '🏆' },
  five_wins: { id: 'five_wins', name: 'Rising Star', desc: 'Win 5 games', icon: '⭐' },
  ten_wins: { id: 'ten_wins', name: 'Champion', desc: 'Win 10 games', icon: '👑' },
  twenty_five_wins: { id: 'twenty_five_wins', name: 'Legend', desc: 'Win 25 games', icon: '🔥' },
  undo_master: { id: 'undo_master', name: 'Undo Master', desc: 'Undo 10 moves', icon: '↶' },
  speedy: { id: 'speedy', name: 'Speedy Gonzales', desc: 'Win a game with 2x speed', icon: '⚡' },
  hint_free: { id: 'hint_free', name: 'No Hints Needed', desc: 'Win with hints disabled', icon: '💡' },
};

export function getAchievements() {
  const saved = localStorage.getItem('bg-achievements');
  return saved ? JSON.parse(saved) : [];
}

export function unlockAchievement(id) {
  const achievements = getAchievements();
  if (!achievements.includes(id)) {
    achievements.push(id);
    localStorage.setItem('bg-achievements', JSON.stringify(achievements));
    return true;
  }
  return false;
}

export function checkAchievements(stats, undoCount, gameSpeed, showHints, playerWon) {
  const unlocked = [];

  if (playerWon && stats.wins === 1) {
    unlocked.push('first_win');
  }
  if (stats.wins === 5 && unlockAchievement('five_wins')) {
    unlocked.push('five_wins');
  }
  if (stats.wins === 10 && unlockAchievement('ten_wins')) {
    unlocked.push('ten_wins');
  }
  if (stats.wins === 25 && unlockAchievement('twenty_five_wins')) {
    unlocked.push('twenty_five_wins');
  }
  if (undoCount >= 10 && unlockAchievement('undo_master')) {
    unlocked.push('undo_master');
  }
  if (playerWon && gameSpeed >= 2 && unlockAchievement('speedy')) {
    unlocked.push('speedy');
  }
  if (playerWon && !showHints && unlockAchievement('hint_free')) {
    unlocked.push('hint_free');
  }

  return unlocked;
}

// Sound effects manager using Web Audio API
class SoundEffects {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.audioContext = null;
    this.sounds = {};
  }

  initAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTone(frequency, duration, volume = 0.3, type = 'sine') {
    if (!this.enabled || !this.audioContext) return;
    
    try {
      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  diceRoll() {
    // Ascending tones for dice roll
    this.playTone(400, 0.1);
    setTimeout(() => this.playTone(600, 0.1), 80);
    setTimeout(() => this.playTone(800, 0.15), 160);
  }

  moveMade() {
    // Quick cheerful blip
    this.playTone(523, 0.1); // C5
    setTimeout(() => this.playTone(659, 0.1), 80); // E5
  }

  victory() {
    // Ascending victorious melody
    const f = [523, 659, 784, 1047]; // C5, E5, G5, C6
    f.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3), i * 150);
    });
  }

  error() {
    // Low error tone
    this.playTone(200, 0.2);
    setTimeout(() => this.playTone(150, 0.2), 150);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && !this.audioContext) {
      this.initAudio();
    }
  }
}

export const soundEffects = new SoundEffects(true);

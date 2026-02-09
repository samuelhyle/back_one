// Confetti animation on win
export function triggerConfetti() {
  const confettiPieces = 50;
  const duration = 3000;
  const startTime = Date.now();

  for (let i = 0; i < confettiPieces; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.width = '10px';
    confetti.style.height = '10px';
    confetti.style.backgroundColor = ['#d4af37', '#f4d03f', '#c9a227', '#ffd700'][Math.floor(Math.random() * 4)];
    confetti.style.borderRadius = '50%';
    confetti.style.left = Math.random() * window.innerWidth + 'px';
    confetti.style.top = '-10px';
    confetti.style.zIndex = '9999';
    confetti.style.pointerEvents = 'none';
    confetti.style.opacity = '1';

    document.body.appendChild(confetti);

    const vx = (Math.random() - 0.5) * 8;
    const vy = Math.random() * 5 + 3;
    const spin = Math.random() * 720 - 360;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        confetti.remove();
        return;
      }

      const y = -10 + vy * elapsed + 0.1 * elapsed * elapsed;
      const x = parseFloat(confetti.style.left.slice(0, -2)) + vx * (elapsed / 100);
      const rotation = spin * (elapsed / 100);

      confetti.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
      confetti.style.opacity = 1 - progress;

      requestAnimationFrame(animate);
    };

    animate();
  }
}

// Short two-note alert "ding" for new bookings landing in the queue.
// Generated with the Web Audio API instead of shipping an audio file —
// one less asset to manage, and it's a two-line function.
export function playAlertSound() {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContextClass();

    const playTone = (freq: number, startAt: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.18);
    playTone(1175, now + 0.16, 0.22);

    // Tear the context down once the notes finish playing.
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Autoplay can be blocked before the first user interaction on the
    // page — not worth surfacing an error for a notification sound.
  }
}

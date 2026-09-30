// Alert for new online requests landing on the Floor. Generated with the Web
// Audio API instead of shipping an audio file. "chime" is a bright two-note
// ding; "bell" is a longer, rounder strike that carries over a pressure washer.
export type AlertSound = "chime" | "bell" | "off";

export function playAlertSound(sound: AlertSound = "chime", volume = 0.6) {
  if (typeof window === "undefined" || sound === "off") return;
  const peak = Math.max(0, Math.min(1, volume)) * 0.4;
  if (peak <= 0) return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContextClass();

    const playTone = (freq: number, startAt: number, duration: number, level = 1, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(peak * level, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    const now = ctx.currentTime;
    let length: number;
    if (sound === "bell") {
      // A struck bell: fundamental plus inharmonic partials, rung twice.
      for (const t of [0, 0.7]) {
        playTone(660, now + t, 1.4);
        playTone(660 * 2.76, now + t, 0.6, 0.35);
        playTone(660 * 5.4, now + t, 0.3, 0.15);
      }
      length = 2200;
    } else {
      playTone(880, now, 0.18);
      playTone(1175, now + 0.16, 0.22);
      length = 500;
    }

    // Tear the context down once the notes finish playing.
    setTimeout(() => ctx.close(), length);
  } catch {
    // Autoplay can be blocked before the first user interaction on the
    // page — not worth surfacing an error for a notification sound.
  }
}

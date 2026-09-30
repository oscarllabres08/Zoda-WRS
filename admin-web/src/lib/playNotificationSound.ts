let audio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  try {
    if (!audio) {
      audio = new Audio('/notification.wav');
      audio.preload = 'auto';
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* Browser may block autoplay until user interaction */
    });
  } catch {
    /* ignore */
  }
}

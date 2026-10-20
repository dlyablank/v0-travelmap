// Small muted previews use the same public/served URL contract as S3 media.
export function createMapVideoPreview(button: HTMLButtonElement, url: string, seconds?: number) {
  let video: HTMLVideoElement | null = null;
  let failed = false;
  function stop() {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    video = null;
    button.classList.remove('is-playing');
  }
  return {
    start() {
      if (video || failed) return;
      const player = document.createElement('video');
      video = player;
      player.muted = true;
      player.loop = true;
      player.playsInline = true;
      player.preload = 'none';
      if (seconds)
        player.ontimeupdate = () => {
          if (player.currentTime >= seconds) player.currentTime = 0;
        };
      player.setAttribute('aria-hidden', 'true');
      player.onplaying = () => button.classList.add('is-playing');
      player.onerror = () => {
        failed = true;
        stop();
      };
      player.src = url;
      button.append(player);
      player.play().catch(() => {
        if (video === player) {
          failed = true;
          stop();
        }
      });
    },
    stop,
  };
}

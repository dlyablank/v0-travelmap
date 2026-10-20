import { demoVideos } from './demo-videos';

// Small muted previews use the same public/served URL contract as S3 media.
export function createMapVideoPreview(button: HTMLButtonElement, url: string, seconds?: number) {
  let video: HTMLVideoElement | null = null;
  let failed = false;
  let blocked = false;
  let pending = false;
  let motion: HTMLImageElement | null = null;
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  const demoId = Object.keys(demoVideos).find(
    (id) => demoVideos[id].previewUrl === url || demoVideos[id].playbackUrl === url,
  );
  function showMotion() {
    if (!video || motion || !demoId || document.hidden) return;
    motion = document.createElement('img');
    const image = motion;
    motion.className = 'motion-preview';
    motion.alt = '';
    motion.src = `/media/videos/${demoId}-motion.webp`;
    motion.onerror = () => {
      image.remove();
      if (motion === image) motion = null;
    };
    button.append(motion);
  }
  function clearMotion() {
    clearTimeout(loadingTimer);
    motion?.remove();
    motion = null;
  }
  const gestures = ['touchend', 'click', 'keydown'] as const;
  function clearGestureRetry() {
    gestures.forEach((event) => document.removeEventListener(event, retryAfterGesture, true));
  }
  function retryAfterGesture() {
    blocked = false;
    play();
  }
  function play() {
    const player = video;
    if (!player || pending || !player.paused || document.hidden) return;
    pending = true;
    player.play().then(
      () => {
        if (video !== player) return;
        pending = false;
        blocked = false;
        clearGestureRetry();
      },
      (error: DOMException) => {
        if (video !== player) return;
        pending = false;
        if (error.name === 'NotAllowedError') {
          // Low Power Mode / browser policy may require a real user gesture.
          // Keep the poster and player so the first touch can resume this preview.
          blocked = true;
          showMotion();
          gestures.forEach((event) =>
            document.addEventListener(event, retryAfterGesture, { capture: true, passive: true }),
          );
        }
        // An interrupted play is retryable; only a media error disables this source.
      },
    );
  }
  function stop() {
    clearMotion();
    clearGestureRetry();
    blocked = false;
    pending = false;
    const player = video;
    video = null;
    if (!player) return;
    player.onplaying = null;
    player.onerror = null;
    player.onpause = null;
    player.pause();
    player.removeAttribute('src');
    player.load();
    player.remove();
    button.classList.remove('is-playing');
  }
  return {
    start() {
      if (failed) return;
      if (video) {
        if (!blocked) play();
        return;
      }
      const player = document.createElement('video');
      video = player;
      player.muted = true;
      player.defaultMuted = true;
      player.autoplay = true;
      player.loop = true;
      player.playsInline = true;
      player.setAttribute('muted', '');
      player.setAttribute('playsinline', '');
      player.setAttribute('webkit-playsinline', '');
      player.preload = 'auto';
      player.poster = button.querySelector('img')?.src || '';
      if (seconds)
        player.ontimeupdate = () => {
          if (player.currentTime >= seconds) player.currentTime = 0;
        };
      player.setAttribute('aria-hidden', 'true');
      player.onplaying = () => {
        clearMotion();
        button.classList.add('is-playing');
        clearGestureRetry();
      };
      player.onpause = showMotion;
      player.onerror = () => {
        if (demoId) showMotion();
        else {
          failed = true;
          stop();
        }
      };
      player.src = url;
      button.append(player);
      loadingTimer = setTimeout(() => {
        if (player.paused || player.readyState < 2) showMotion();
      }, 1500);
      play();
    },
    stop,
  };
}

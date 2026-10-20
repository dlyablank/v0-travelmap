'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, ExternalLink, LoaderCircle, RotateCcw } from 'lucide-react';
import type { Place } from '@/lib/types';
import { youtubeId } from '@/lib/validation';
import { PlaceImage } from './place-image';

export function VideoPlayer({
  place,
  active = true,
  muted: controlledMuted,
  onMutedChange,
  preload = 'auto',
}: {
  place: Place;
  active?: boolean;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  preload?: 'auto' | 'metadata' | 'none';
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [localMuted, setMuted] = useState(true);
  const muted = controlledMuted ?? localMuted;
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [embed, setEmbed] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [retry, setRetry] = useState(0);
  const [playBlocked, setPlayBlocked] = useState(false);
  const source = place.video?.playbackUrl;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // React Strict Mode replays effects without rebuilding the DOM. Restore a
    // source released by the simulated unmount before resuming/preloading.
    if (source && v.getAttribute('src') !== source) {
      v.setAttribute('src', source);
      v.load();
    }
    let disposed = false;
    let resume = false;
    function play() {
      v!.play().catch((e: Error) => {
        if (disposed || e.name === 'AbortError') return;
        setPlaying(false);
        setWaiting(false);
        setShowLoading(false);
        setPlayBlocked(true);
      });
    }
    // Playback starts here, after every outgoing player's cleanup has paused it.
    // Do not use autoPlay on buffered elements: only this selected player may play.
    if (active && !document.hidden) play();
    else v.pause();
    function visibility() {
      if (document.hidden) {
        resume = !v!.paused;
        v!.pause();
      } else if (active && resume) play();
    }
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      v.pause();
    };
  }, [active, source, retry]);

  useEffect(() => {
    const v = ref.current;
    return () => {
      // Release requests/decoders when a clip leaves the bounded buffer.
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    };
  }, [retry]);

  useEffect(() => {
    if (!active || !waiting || !source || error) return;
    const timer = setTimeout(() => setShowLoading(true), 300);
    return () => clearTimeout(timer);
  }, [active, waiting, source, error]);

  function ready() {
    setPlaying(true);
    setWaiting(false);
    setShowLoading(false);
    setPlayBlocked(false);
    const v = ref.current;
    // A decoded/presented frame, rather than metadata, replaces the poster.
    if (v?.requestVideoFrameCallback) v.requestVideoFrameCallback(() => setFrameReady(true));
    else requestAnimationFrame(() => setFrameReady(true));
  }
  function retryVideo() {
    setError(false);
    setFrameReady(false);
    setWaiting(true);
    setShowLoading(false);
    setPlayBlocked(false);
    setProgress(0);
    setRetry((n) => n + 1);
  }
  const video = place.video;
  const id = video?.sourceType === 'youtube' ? youtubeId(video.originalUrl || '') : null;
  return (
    <div className="video-frame" data-active={active} data-place-id={place.id}>
      {source && !error ? (
        <>
          <video
            ref={ref}
            src={source}
            poster={place.thumbnailUrl}
            muted={muted}
            loop
            playsInline
            preload={preload}
            data-active={active}
            onError={() => {
              ref.current?.pause();
              setError(true);
              setShowLoading(false);
            }}
            onPlaying={ready}
            onPause={() => setPlaying(false)}
            onWaiting={() => setWaiting(true)}
            onTimeUpdate={(event) => {
              const v = event.currentTarget;
              if (Number.isFinite(v.duration) && v.duration > 0)
                setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
            }}
          />
          <div className={`video-cover ${frameReady ? 'is-ready' : ''}`} aria-hidden="true">
            <PlaceImage place={place} loading="eager" />
          </div>
        </>
      ) : (
        <PlaceImage place={place} loading={active ? 'eager' : 'lazy'} />
      )}
      {id && embed && active && (
        <iframe
          title={`Видео: ${place.name}`}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {!video && (
        <div className="photo-label">
          {place.thumbnailUrl.endsWith('.svg')
            ? 'Иллюстрация · видео пока нет'
            : 'Фото региона · добавьте своё видео'}
        </div>
      )}
      {active && source && waiting && showLoading && !error && (
        <div className="video-loading" role="status">
          <LoaderCircle size={20} className="spin" />
          Загружаем видео…
        </div>
      )}
      {active && playBlocked && !error && (
        <div className="video-play-notice">Нажмите ▶, чтобы начать просмотр</div>
      )}
      {active && error && (
        <div className="video-error" role="alert">
          <p>Видео не загрузилось. Проверьте соединение или источник.</p>
          <button onClick={retryVideo}>
            <RotateCcw size={16} />
            Повторить
          </button>
        </div>
      )}
      {active && source && !error && (
        <>
          <div className="video-controls">
            <button
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              onClick={() => {
                const v = ref.current;
                if (!v) return;
                if (v.paused)
                  v.play().catch(() => {
                    setPlayBlocked(true);
                    setWaiting(false);
                  });
                else v.pause();
              }}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button
              aria-label={muted ? 'Включить звук' : 'Выключить звук'}
              onClick={() => {
                setMuted(!muted);
                onMutedChange?.(!muted);
              }}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          </div>
          <div
            className="video-progress"
            role="progressbar"
            aria-label="Ход видео"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </>
      )}
      {active && video?.originalUrl && !source && (
        <div className="external-video">
          {id && !embed && (
            <button className="button button-primary" onClick={() => setEmbed(true)}>
              <Play size={16} /> Смотреть YouTube
            </button>
          )}
          <a href={video.originalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> Открыть оригинал
          </a>
          <small>Плеер может быть ограничен автором или платформой</small>
        </div>
      )}
    </div>
  );
}

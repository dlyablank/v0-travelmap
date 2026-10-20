'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import type { Place } from '@/lib/types';
import { youtubeId } from '@/lib/validation';
import { PlaceImage } from './place-image';
export function VideoPlayer({ place, active = true }: { place: Place; active?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(false);
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.play().catch(() => setPlaying(false));
    } else v.pause();
    return () => v.pause();
  }, [active, place.id]);
  const video = place.video;
  const id = video?.sourceType === 'youtube' ? youtubeId(video.originalUrl || '') : null;
  return (
    <div className="video-frame">
      {video?.playbackUrl && !error ? (
        <video
          ref={ref}
          src={video.playbackUrl}
          poster={place.thumbnailUrl}
          muted={muted}
          loop
          playsInline
          autoPlay={active}
          preload="metadata"
          onError={() => setError(true)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      ) : (
        <PlaceImage place={place} loading="eager" />
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
      {!video && <div className="photo-label">Фото региона · добавьте своё видео</div>}
      {error && (
        <div className="video-error">Видео не загрузилось. Проверьте соединение или источник.</div>
      )}
      {video?.playbackUrl && !error && (
        <div className="video-controls">
          <button
            aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            onClick={() => {
              const v = ref.current;
              if (!v) return;
              if (v.paused) v.play().catch(() => setError(true));
              else v.pause();
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      )}
      {video?.originalUrl && !video.playbackUrl && (
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

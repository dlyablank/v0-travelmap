'use client';
import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import * as D from '@radix-ui/react-dialog';
import { ArrowUp, ArrowDown, X, MapPin, Bookmark, Plus, Check } from 'lucide-react';
import type { Place } from '@/lib/types';
import { VideoPlayer } from './video-player';
import { PlaceImage } from './place-image';
import { ReelMiniMap } from './reel-mini-map';
import { VideoAttribution } from './video-attribution';
import { useVideoBuffer } from '@/lib/video-buffer';

export function VideoReel({
  places: initialPlaces,
  onLoadMore,
  initialId,
  saved,
  trip,
  onClose,
  onSave,
  onTrip,
  onMap,
  onCurrentChange,
}: {
  places: Place[];
  onLoadMore: (seen: string[], signal: AbortSignal) => Promise<Place[]>;
  initialId: string;
  saved: string[];
  trip: string[];
  onClose: () => void;
  onSave: (id: string) => void;
  onTrip: (id: string) => void;
  onMap: (place: Place) => void;
  onCurrentChange: (place: Place) => void;
}) {
  const [places, setPlaces] = useState(initialPlaces);
  const [feedState, setFeedState] = useState<'loading' | 'ready' | 'end' | 'error'>('ready');
  const [reload, setReload] = useState(0);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      places.findIndex((p) => p.id === initialId),
    ),
  );
  const [muted, setMuted] = useState(true);
  const buffer = useVideoBuffer();
  const track = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ start: number; delta: number } | null>(null);
  const place = places[index];
  const nearEnd = index >= places.length - 3;
  useEffect(() => {
    if (!nearEnd) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return [];
        setFeedState('loading');
        return onLoadMore(
          places.map((p) => p.id),
          controller.signal,
        );
      })
      .then((incoming) => {
        if (controller.signal.aborted) return;
        const seen = new Set(places.map((p) => p.id));
        const fresh = incoming.filter((p) => {
          if (!p.video || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        if (fresh.length) setPlaces((previous) => [...previous, ...fresh]);
        setFeedState(fresh.length ? 'ready' : 'end');
      })
      .catch(() => {
        if (!controller.signal.aborted) setFeedState('error');
      });
    return () => controller.abort();
  }, [nearEnd, places, onLoadMore, reload]);
  const step = (delta: number) => {
    if (timer.current) clearTimeout(timer.current);
    if (track.current) track.current.scrollTop = track.current.clientHeight;
    setIndex((i) => Math.max(0, Math.min(places.length - 1, i + delta)));
  };
  useEffect(() => {
    onCurrentChange(place);
  }, [place, onCurrentChange]);
  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollTop = el.clientHeight;
  }, [index]);
  useEffect(() => {
    const resize = () => {
      if (track.current) track.current.scrollTop = track.current.clientHeight;
    };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return (
    <D.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <D.Portal>
        <D.Overlay className="reel-backdrop" />
        <D.Content
          className="video-reel"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onOpenAutoFocus={() => {
            if (track.current) track.current.scrollTop = track.current.clientHeight;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).closest('.reel-info-sheet,summary')) return;
            if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              step(['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1);
            }
          }}
        >
          <D.Title className="reel-sr-only">Видео путешествий</D.Title>
          <D.Description className="reel-sr-only">
            Листайте вверх и вниз, чтобы смотреть места. Новые видео подгружаются по мере просмотра.
          </D.Description>
          <D.Close className="reel-close" aria-label="Закрыть видеоленту">
            <X />
          </D.Close>
          <div
            className="reel-track"
            ref={track}
            onTouchStart={(event) => {
              if (event.touches.length !== 1) return;
              if (timer.current) clearTimeout(timer.current);
              gesture.current = { start: event.touches[0].clientY, delta: 0 };
              if (track.current) track.current.style.scrollSnapType = 'none';
            }}
            onTouchMove={(event) => {
              const current = gesture.current;
              if (!current || !track.current) return;
              current.delta = current.start - event.touches[0].clientY;
              track.current.scrollTop = track.current.clientHeight + current.delta;
            }}
            onTouchEnd={() => {
              const current = gesture.current;
              gesture.current = null;
              if (track.current) {
                track.current.scrollTop = track.current.clientHeight;
                track.current.style.scrollSnapType = '';
              }
              if (current && Math.abs(current.delta) > 50) step(current.delta > 0 ? 1 : -1);
            }}
            onTouchCancel={() => {
              gesture.current = null;
              if (track.current) {
                track.current.scrollTop = track.current.clientHeight;
                track.current.style.scrollSnapType = '';
              }
            }}
            onScroll={() => {
              if (gesture.current) return;
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => {
                const el = track.current;
                if (!el) return;
                const delta = Math.round(el.scrollTop / el.clientHeight) - 1;
                if (delta) step(delta);
              }, 130);
            }}
          >
            {[-1, 0, 1].map((offset) => {
              const item = places[index + offset];
              if (!item)
                return (
                  <article
                    className="reel-slide reel-boundary"
                    key={`boundary:${offset}`}
                    aria-hidden
                    inert
                  />
                );
              // Stable place keys preserve the preloaded player when it becomes current.
              return (
                <article
                  className="reel-slide"
                  key={item.id}
                  aria-hidden={offset !== 0}
                  inert={offset !== 0}
                  data-place-id={item.id}
                  data-active={offset === 0}
                >
                  {offset === 0 || buffer ? (
                    <VideoPlayer
                      place={item}
                      active={offset === 0}
                      muted={muted}
                      onMutedChange={setMuted}
                      preload="auto"
                    />
                  ) : (
                    <PlaceImage place={item} />
                  )}
                </article>
              );
            })}
          </div>
          <div className="reel-top">
            <span>Вдохновение рядом</span>
          </div>
          <ReelMiniMap places={places} current={place} onOpen={() => onMap(place)} />
          <div className="reel-details" key={place.id}>
            <span>
              {place.category} · {place.city}
            </span>
            <h2>{place.name}</h2>
            {place.video?.credit && (
              <div className="reel-author">
                <a
                  aria-label={`Автор видео: ${place.video.credit.author}`}
                  href={place.video.credit.authorUrl || place.video.credit.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Видео: {place.video.credit.author}
                </a>
                <a href={place.video.credit.licenseUrl} target="_blank" rel="noopener noreferrer">
                  {place.video.credit.license}
                </a>
              </div>
            )}
            <div className="reel-primary-actions">
              <button
                className="reel-trip-button"
                aria-label={trip.includes(place.id) ? 'Убрать из поездки' : 'Добавить в поездку'}
                aria-pressed={trip.includes(place.id)}
                onClick={() => onTrip(place.id)}
              >
                {trip.includes(place.id) ? <Check size={18} /> : <Plus size={18} />}
                {trip.includes(place.id) ? 'В поездке' : 'В поездку'}
              </button>
              <details
                className="reel-place-details"
                onToggle={(e) => {
                  if (e.currentTarget.open && track.current)
                    track.current.scrollTop = track.current.clientHeight;
                }}
              >
                <summary>О месте</summary>
                <div className="reel-info-sheet">
                  <div className="reel-info-heading">
                    <strong>О месте</strong>
                    <button
                      className="reel-info-close"
                      aria-label="Закрыть сведения о месте"
                      onClick={(event) => {
                        const details = event.currentTarget.closest('details');
                        if (details) {
                          details.open = false;
                          details.querySelector('summary')?.focus({ preventScroll: true });
                        }
                      }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <p>{place.description}</p>
                  <VideoAttribution place={place} />
                  <button className="reel-map-button" onClick={() => onMap(place)}>
                    <MapPin size={16} /> Показать на карте
                  </button>
                </div>
              </details>
            </div>
          </div>
          <div className="reel-actions">
            <button
              aria-label={saved.includes(place.id) ? 'Убрать из сохранённого' : 'Сохранить место'}
              aria-pressed={saved.includes(place.id)}
              onClick={() => onSave(place.id)}
            >
              <Bookmark fill={saved.includes(place.id) ? 'currentColor' : 'none'} />
              <small>Сохранить</small>
            </button>
          </div>
          <div className="reel-navigation">
            <button aria-label="Предыдущее видео" disabled={index === 0} onClick={() => step(-1)}>
              <ArrowUp />
            </button>
            <button
              aria-label="Следующее видео"
              disabled={index === places.length - 1}
              onClick={() => step(1)}
            >
              <ArrowDown />
            </button>
          </div>
          {index === places.length - 1 ? (
            <div className="reel-feed-status" role="status">
              <span>
                {feedState === 'loading'
                  ? 'Загружаем новые видео…'
                  : feedState === 'error'
                    ? 'Не удалось загрузить видео'
                    : 'Пока новых видео нет'}
              </span>
              {feedState !== 'loading' && (
                <button onClick={() => setReload((v) => v + 1)}>Проверить ещё</button>
              )}
            </div>
          ) : (
            <div className="reel-hint">Листайте вверх · новые места дальше</div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

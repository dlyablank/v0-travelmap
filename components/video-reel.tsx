'use client';
import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import * as D from '@radix-ui/react-dialog';
import { ArrowUp, ArrowDown, X, MapPin, Bookmark, Plus, Check } from 'lucide-react';
import type { Place } from '@/lib/types';
import { VideoPlayer } from './video-player';
import { PlaceImage } from './place-image';
import { ReelMiniMap } from './reel-mini-map';
import { VideoAttribution } from './video-attribution';

export function VideoReel({
  places,
  initialId,
  saved,
  trip,
  onClose,
  onSave,
  onTrip,
  onMap,
}: {
  places: Place[];
  initialId: string;
  saved: string[];
  trip: string[];
  onClose: () => void;
  onSave: (id: string) => void;
  onTrip: (id: string) => void;
  onMap: (place: Place) => void;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      places.findIndex((p) => p.id === initialId),
    ),
  );
  const [muted, setMuted] = useState(true);
  const track = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ start: number; delta: number } | null>(null);
  const wrap = (i: number) => (i + places.length) % places.length;
  const place = places[wrap(index)];
  const step = (delta: number) => {
    if (timer.current) clearTimeout(timer.current);
    if (track.current && places.length === 1) track.current.scrollTop = track.current.clientHeight;
    setIndex((i) => (i + delta + places.length) % places.length);
  };
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
          onOpenAutoFocus={() => {
            if (track.current) track.current.scrollTop = track.current.clientHeight;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
          onKeyDown={(event) => {
            if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              step(['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1);
            }
          }}
        >
          <D.Title className="reel-sr-only">Видео путешествий</D.Title>
          <D.Description className="reel-sr-only">
            Листайте вверх и вниз, чтобы смотреть места. После последнего ролика лента продолжается
            с первого.
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
              const item = places[wrap(index + offset)];
              return (
                <article className="reel-slide" key={offset} aria-hidden={offset !== 0}>
                  {offset === 0 ? (
                    <VideoPlayer
                      key={item.id}
                      place={item}
                      muted={muted}
                      onMutedChange={setMuted}
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
            <small>
              {wrap(index) + 1} / {places.length}
            </small>
          </div>
          <ReelMiniMap places={places} current={place} onOpen={() => onMap(place)} />
          <div className="reel-details" key={place.id}>
            <span>
              {place.category} · {place.city}
            </span>
            <h2>{place.name}</h2>
            <p>{place.description}</p>
            <VideoAttribution place={place} />
            <button className="reel-map-button" onClick={() => onMap(place)}>
              <MapPin size={16} /> Показать на карте
            </button>
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
            <button
              aria-label={trip.includes(place.id) ? 'Убрать из поездки' : 'Добавить в поездку'}
              aria-pressed={trip.includes(place.id)}
              onClick={() => onTrip(place.id)}
            >
              {trip.includes(place.id) ? <Check /> : <Plus />}
              <small>В поездку</small>
            </button>
          </div>
          <div className="reel-navigation">
            <button aria-label="Предыдущее видео" onClick={() => step(-1)}>
              <ArrowUp />
            </button>
            <button aria-label="Следующее видео" onClick={() => step(1)}>
              <ArrowDown />
            </button>
          </div>
          <div className="reel-hint">Листайте вверх · новые места дальше</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

'use client';
import { useState } from 'react';
import { ArrowRight, Film, MapPin } from 'lucide-react';
import type { DaySegment } from '@/lib/weekend-plan';
import { clockLabel } from '@/lib/day-plan';
import { PlaceImage } from './place-image';
import { VideoPlayer } from './video-player';

export function TripDayReport({
  days,
  degraded,
}: {
  days: DaySegment[];
  degraded?: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!days.length) return null;

  return (
    <section className="trip-day-report" aria-label="Видеоотчёт выходных">
      <div className="day-section-title">
        <Film size={17} />
        <h3>Видеоотчёт: где вы и куда дальше</h3>
      </div>
      <p className="trip-hint">
        Смотрите кадры по порядку дней. Одновременно играет одно видео — так проще ориентироваться.
      </p>
      {degraded && (
        <p className="route-warning" role="status">
          Время переездов неизвестно. Порядок посещений ориентировочный по длительности остановок.
        </p>
      )}
      {days.map((day) => (
        <div key={day.dayIndex} className="report-day">
          <header className="report-day-header">
            <MapPin size={16} />
            <div>
              <h4>{day.label}</h4>
              <p>
                {day.stops.length} мест
                {day.complete && day.finish != null
                  ? ` · финиш около ${clockLabel(day.finish)}`
                  : ''}
              </p>
            </div>
          </header>
          <ol className="report-timeline">
            {day.stops.map((place, index) => {
              const next = day.stops[index + 1];
              const playing = activeId === place.id;
              const hasVideo = Boolean(place.video?.playbackUrl || place.video?.previewUrl);
              return (
                <li key={place.id}>
                  <article className={`report-stop${playing ? ' playing' : ''}`}>
                    <div className="report-media">
                      {hasVideo ? (
                        <button
                          type="button"
                          className="report-video-trigger"
                          aria-label={
                            playing ? `Пауза: ${place.name}` : `Смотреть: ${place.name}`
                          }
                          onClick={() => setActiveId(playing ? null : place.id)}
                        >
                          {playing && place.video?.playbackUrl ? (
                            <VideoPlayer place={place} active muted={false} />
                          ) : (
                            <PlaceImage place={place} />
                          )}
                        </button>
                      ) : (
                        <PlaceImage place={place} />
                      )}
                    </div>
                    <div className="report-copy">
                      <span className="report-here">
                        {index === 0 ? 'Начинаете здесь' : `Остановка ${index + 1}`}
                      </span>
                      <h5>{place.name}</h5>
                      <p>{place.description}</p>
                      {next ? (
                        <p className="report-next">
                          <ArrowRight size={14} /> Дальше: {next.name}
                        </p>
                      ) : day.eveningPlace && day.dayIndex === 0 ? (
                        <p className="report-next">
                          <ArrowRight size={14} /> Вечер здесь · ночёвка рядом
                        </p>
                      ) : (
                        <p className="report-next">Финиш дня</p>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

'use client';
import { CalendarDays, Check, Moon } from 'lucide-react';
import type { WeekendVariant } from '@/lib/weekend-plan';
import { timeLabel } from '@/lib/utils';

export function WeekendVariants({
  variants,
  selectedId,
  onSelect,
}: {
  variants: WeekendVariant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!variants.length) return null;
  return (
    <section className="weekend-variants" aria-label="Варианты выходных">
      <div className="day-section-title">
        <CalendarDays size={17} />
        <h3>Варианты на выходные</h3>
      </div>
      <p className="trip-hint">
        Оптимизируем порядок и предлагаем 1–2 дня, чтобы успеть за одни выходные. Выберите сценарий —
        отели, еда и отчёт пересчитаются.
      </p>
      <div className="weekend-variant-list">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          return (
            <button
              key={variant.id}
              type="button"
              className={`weekend-variant-card${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(variant.id)}
            >
              <span className="weekend-variant-title">
                {selected ? <Check size={16} /> : null}
                {variant.title}
              </span>
              <span className="weekend-variant-meta">
                {variant.durationDays === 1 ? '1 день' : '2 дня'}
                {variant.overnight ? (
                  <>
                    {' · '}
                    <Moon size={13} /> ночёвка
                  </>
                ) : null}
                {variant.optimized ? ' · порядок по близости' : ' · ваш порядок'}
              </span>
              <span className="weekend-variant-summary">{variant.summary}</span>
              <span className="weekend-variant-stats">
                {variant.days.map((day) => (
                  <span key={day.dayIndex}>
                    {day.label.split('·')[0].trim()}: {day.stops.length} мест ·{' '}
                    {timeLabel(day.visitMinutes * 60)} на месте
                  </span>
                ))}
              </span>
              {variant.fitStatus === 'overflow' && (
                <span className="weekend-variant-warn" role="status">
                  Не умещается в окно дня — уберите остановки или смените режим.
                </span>
              )}
              {variant.fitStatus === 'degraded' && (
                <span className="weekend-variant-note">
                  Время в пути неизвестно; дни ориентировочные по длительности посещений.
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

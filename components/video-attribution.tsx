import { ArrowUpRight } from 'lucide-react';
import type { Place } from '@/lib/types';

export function VideoAttribution({ place }: { place: Place }) {
  const credit = place.video?.credit;
  if (!credit) return null;
  const date =
    credit.recordedAt && /^\d{4}-\d{2}-\d{2}$/.test(credit.recordedAt)
      ? new Date(`${credit.recordedAt}T00:00:00Z`)
      : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          date,
        )
      : null;
  const basis =
    credit.rightsBasis === 'author-permission'
      ? 'С разрешения автора'
      : credit.rightsBasis === 'public-domain' || credit.license === 'Public domain'
        ? 'Общественное достояние'
        : credit.rightsBasis === 'open-license'
          ? 'Открытая лицензия'
          : 'Условия указаны в источнике';
  return (
    <section className="creator-card video-credit" aria-label="Автор и происхождение видео">
      <div className="creator-identity">
        <span className="creator-avatar" aria-hidden="true">
          {Array.from(credit.author)[0]}
        </span>
        <div>
          <small>Автор этого открытия</small>
          <a
            aria-label={`Автор видео: ${credit.author}`}
            href={credit.authorUrl || credit.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {credit.author}
          </a>
        </div>
        <a
          className="creator-original"
          href={credit.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Оригинал <ArrowUpRight size={12} />
        </a>
      </div>
      <div className="creator-provenance">
        {dateLabel ? `Снято: ${dateLabel} · ` : ''}
        {basis}
      </div>
      <details className="creator-license">
        <summary>Источник и условия использования</summary>
        <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">
          {credit.license}
        </a>
        <span>{credit.changes || 'Кадрировано в превью'}</span>
        {credit.rightsBasis === 'author-permission' && (
          <span>Спасибо автору за возможность показать это место.</span>
        )}
      </details>
    </section>
  );
}

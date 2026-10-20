import { Route, X, ArrowUpRight } from 'lucide-react';
import type { Place } from '@/lib/types';
import { PlaceImage } from './place-image';

export function TripStopsStrip({
  stops,
  onRemove,
  onSelect,
  onOpen,
}: {
  stops: Place[];
  onRemove: (id: string) => void;
  onSelect: (p: Place) => void;
  onOpen: () => void;
}) {
  if (!stops.length) return null;
  return (
    <section className="selected-stops" aria-label="Выбранные остановки">
      <div className="selected-stops-title">
        <Route size={19} />
        <div>
          <b>Ваша поездка</b>
          <small>Остановок: {stops.length}</small>
        </div>
      </div>
      <ol>
        {stops.map((place, index) => (
          <li key={place.id}>
            <button
              className="selected-stop-open"
              aria-label={`Остановка ${index + 1}: ${place.name}`}
              onClick={() => onSelect(place)}
            >
              <PlaceImage place={place} />
              <span>{index + 1}</span>
              <b>{place.name}</b>
            </button>
            <button
              className="selected-stop-remove"
              aria-label={`Убрать остановку: ${place.name}`}
              onClick={() => onRemove(place.id)}
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ol>
      <button className="selected-stops-build" onClick={onOpen}>
        Собрать поездку <ArrowUpRight size={17} />
      </button>
    </section>
  );
}

import type { Place } from './types';

// Sibling buttons keep a direct trip action independent of opening the place card.
export function addMapMarkerActions(element: HTMLElement, place: Place, onTrip: () => void) {
  element.setAttribute('role', 'group');
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'map-place-open';
  open.setAttribute('aria-label', `Показать ${place.name}`);
  element.append(open);
  if (!place.video) return;
  const trip = document.createElement('button');
  trip.type = 'button';
  trip.className = 'map-trip-toggle';
  trip.dataset.placeName = place.name;
  trip.onclick = (event) => {
    event.stopPropagation();
    onTrip();
  };
  element.append(trip);
}
export function syncMapMarkerTrip(element: HTMLElement, added: boolean) {
  const button = element.querySelector<HTMLButtonElement>('.map-trip-toggle');
  if (!button || button.getAttribute('aria-pressed') === String(added)) return;
  button.setAttribute('aria-pressed', String(added));
  button.setAttribute(
    'aria-label',
    `${added ? 'Убрать из поездки' : 'Добавить в поездку'} ${button.dataset.placeName}`,
  );
  button.title = added ? 'В поездке' : 'Добавить в поездку';
  button.innerHTML = added
    ? '<span aria-hidden="true">✓</span>'
    : '<span aria-hidden="true">+</span>';
}

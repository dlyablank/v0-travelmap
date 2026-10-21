export type RoutingStep = {
  distance?: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string; exit?: number };
};

// Only translate explicit provider maneuvers; an unknown maneuver is never guessed.
export function routeInstructions(steps: RoutingStep[] = []) {
  const directions: Record<string, string> = {
    left: 'налево',
    right: 'направо',
    straight: 'прямо',
    'slight left': 'плавно налево',
    'slight right': 'плавно направо',
    'sharp left': 'резко налево',
    'sharp right': 'резко направо',
    uturn: 'в обратном направлении',
  };
  return steps.map((step) => {
    const m = step.maneuver;
    const direction = directions[m?.modifier || ''];
    let text = 'Продолжайте движение';
    if (m?.type === 'depart') text = 'Начните движение';
    if (m?.type === 'arrive') text = 'Прибытие к остановке';
    if (m?.type === 'turn' && direction) text = `Поверните ${direction}`;
    if (m?.type === 'continue' && direction) text = `Продолжайте ${direction}`;
    if (m?.type === 'fork' && direction) text = `На развилке держитесь ${direction}`;
    if (m?.type === 'roundabout')
      text = `На круговом движении${m.exit ? ` используйте съезд ${m.exit}` : ' продолжайте по маршруту'}`;
    if (step.name) text += ` · ${step.name}`;
    return { text, distance: step.distance ?? 0 };
  });
}

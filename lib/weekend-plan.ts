import type { Place, RouteResult } from './types';
import { clockMinutes, dayPlan, type DaySettings } from './day-plan';
import { optimizeStops } from './routing';

export type FitStatus = 'fits' | 'overflow' | 'degraded';

export type DaySegment = {
  dayIndex: number;
  label: string;
  stops: Place[];
  /** Last stop of the day; overnight anchor when another day follows. */
  eveningPlace: Place | null;
  visitMinutes: number;
  travelMinutes: number | null;
  overflow: number;
  finish: number | null;
  complete: boolean;
};

export type WeekendVariant = {
  id: string;
  title: string;
  summary: string;
  order: Place[];
  optimized: boolean;
  days: DaySegment[];
  overnight: boolean;
  eveningPlace: Place | null;
  fitStatus: FitStatus;
  durationDays: 1 | 2;
  degraded: boolean;
};

function legTravelMinutes(
  route: RouteResult | null,
  fromIndex: number,
): number | null {
  if (!route || fromIndex <= 0) return 0;
  const leg = route.legs[fromIndex - 1];
  if (!leg || leg.duration == null) return null;
  return Math.ceil(leg.duration / 60);
}

/** Slice route legs for a contiguous stop range within the full ordered list. */
function sliceRoute(
  fullOrder: Place[],
  segment: Place[],
  route: RouteResult | null,
): RouteResult | null {
  if (!route || segment.length < 2) return route;
  const start = fullOrder.findIndex((p) => p.id === segment[0].id);
  if (start < 0) return null;
  const end = start + segment.length - 1;
  const legs = route.legs.slice(start, end);
  const duration = legs.every((l) => l.duration != null)
    ? legs.reduce((sum, l) => sum + (l.duration || 0), 0)
    : null;
  return {
    ...route,
    legs,
    distance: legs.reduce((sum, l) => sum + l.distance, 0),
    duration,
    stopIds: segment.map((p) => p.id),
  };
}

function segmentFromStops(
  stops: Place[],
  dayIndex: number,
  route: RouteResult | null,
  settings: DaySettings,
  fullOrder: Place[],
  overnightAfter: boolean,
): DaySegment {
  const segmentRoute = sliceRoute(fullOrder, stops, route);
  const plan = dayPlan(stops, segmentRoute, settings);
  return {
    dayIndex,
    label: dayIndex === 0 ? 'День 1 · суббота' : 'День 2 · воскресенье',
    stops,
    eveningPlace: overnightAfter && stops.length ? stops[stops.length - 1] : null,
    visitMinutes: plan.visits,
    travelMinutes: plan.travel,
    overflow: plan.overflow,
    finish: plan.finish,
    complete: plan.complete,
  };
}

/**
 * Greedy pack into day windows. When travel durations are missing, only visitMinutes
 * count toward the budget (degraded mode A).
 */
export function packDays(
  ordered: Place[],
  route: RouteResult | null,
  settings: DaySettings,
  maxDays = 2,
): { days: Place[][]; degraded: boolean; overflowStops: Place[] } {
  const budget = clockMinutes(settings.end) - clockMinutes(settings.start);
  if (budget <= 0 || !ordered.length) {
    return { days: [], degraded: false, overflowStops: ordered };
  }

  const degraded =
    ordered.length >= 2 &&
    (!route ||
      route.duration == null ||
      route.legs.some((leg, i) => i < ordered.length - 1 && leg.duration == null));

  const days: Place[][] = [];
  let current: Place[] = [];
  let used = 0;

  for (let i = 0; i < ordered.length; i++) {
    const place = ordered[i];
    const travel =
      current.length === 0
        ? 0
        : degraded
          ? 0
          : (legTravelMinutes(route, i) ?? 0);
    // When not degraded but this leg is somehow null, treat as visit-only for that hop.
    const hopTravel =
      current.length === 0
        ? 0
        : degraded
          ? 0
          : legTravelMinutes(route, i) === null
            ? 0
            : travel;
    const cost = hopTravel + place.visitMinutes;

    if (!current.length) {
      current = [place];
      used = place.visitMinutes;
      continue;
    }

    if (used + cost <= budget) {
      current.push(place);
      used += cost;
      continue;
    }

    if (days.length + 1 >= maxDays) {
      // Try to force onto last day; mark overflow later.
      current.push(place);
      used += cost;
      continue;
    }

    days.push(current);
    current = [place];
    used = place.visitMinutes;
  }

  if (current.length) days.push(current);

  // Cap at maxDays: merge leftover into last day and report overflow separately.
  while (days.length > maxDays) {
    const extra = days.pop()!;
    days[days.length - 1].push(...extra);
  }

  const overflowStops: Place[] = [];
  if (days.length) {
    const last = days[days.length - 1];
    let probe = 0;
    const kept: Place[] = [];
    for (let i = 0; i < last.length; i++) {
      const globalIndex = ordered.findIndex((p) => p.id === last[i].id);
      const travel =
        kept.length === 0
          ? 0
          : degraded
            ? 0
            : (legTravelMinutes(route, globalIndex) ?? 0);
      const cost = travel + last[i].visitMinutes;
      if (!kept.length) {
        kept.push(last[i]);
        probe = last[i].visitMinutes;
      } else if (probe + cost <= budget) {
        kept.push(last[i]);
        probe += cost;
      } else {
        overflowStops.push(...last.slice(i));
        break;
      }
    }
    days[days.length - 1] = kept.length ? kept : [last[0]];
    if (!kept.length && last.length > 1) overflowStops.push(...last.slice(1));
  }

  return { days, degraded, overflowStops };
}

function buildVariant(
  id: string,
  title: string,
  summary: string,
  order: Place[],
  route: RouteResult | null,
  settings: DaySettings,
  optimized: boolean,
  forceDays: 1 | 2 | 'auto',
): WeekendVariant {
  const oneDayPack = packDays(order, route, settings, 1);
  const fitsOne =
    oneDayPack.overflowStops.length === 0 &&
    oneDayPack.days.length === 1 &&
    oneDayPack.days[0]?.length === order.length;

  let dayGroups: Place[][];
  let degraded: boolean;
  let overflowStops: Place[];

  if (forceDays === 1 || (forceDays === 'auto' && fitsOne)) {
    dayGroups = [order];
    degraded = oneDayPack.degraded;
    overflowStops = fitsOne ? [] : oneDayPack.overflowStops;
    if (!fitsOne && forceDays === 1) {
      const check = packDays(order, route, settings, 1);
      overflowStops = check.overflowStops.length
        ? check.overflowStops
        : order.slice(Math.max(1, Math.floor(order.length / 2)));
    }
  } else {
    const packed = packDays(order, route, settings, 2);
    dayGroups = packed.days;
    degraded = packed.degraded;
    overflowStops = packed.overflowStops;
    if (!dayGroups.length) dayGroups = [order];
    // Intentional 2-day weekend pace: if greedy pack still fits in one day,
    // split near the midpoint so the calmer variant stays distinct.
    if (forceDays === 2 && dayGroups.length === 1 && order.length >= 3) {
      const mid = Math.ceil(order.length / 2);
      dayGroups = [order.slice(0, mid), order.slice(mid)];
      overflowStops = [];
    }
  }

  const overnight = dayGroups.length > 1;
  const days = dayGroups.map((stops, index) =>
    segmentFromStops(
      stops,
      index,
      route,
      settings,
      order,
      overnight && index < dayGroups.length - 1,
    ),
  );

  // Recompute overflow for forced one-day that doesn't fit.
  if (forceDays === 1 && days[0]) {
    const plan = dayPlan(order, route, settings);
    days[0].overflow = plan.overflow;
    days[0].visitMinutes = plan.visits;
    days[0].travelMinutes = plan.travel;
    days[0].finish = plan.finish;
    days[0].complete = plan.complete;
    if (plan.overflow > 0) overflowStops = overflowStops.length ? overflowStops : [order[order.length - 1]];
  }

  const hasOverflow =
    overflowStops.length > 0 || days.some((d) => d.overflow > 0);
  const fitStatus: FitStatus = hasOverflow
    ? 'overflow'
    : degraded
      ? 'degraded'
      : 'fits';

  return {
    id,
    title,
    summary,
    order,
    optimized,
    days,
    overnight,
    eveningPlace: overnight ? days[0]?.eveningPlace || null : null,
    fitStatus,
    durationDays: overnight ? 2 : 1,
    degraded,
  };
}

function sameDaySplit(a: Place[][], b: Place[][]) {
  if (a.length !== b.length) return false;
  return a.every(
    (day, i) =>
      day.length === b[i].length && day.every((p, j) => p.id === b[i][j].id),
  );
}

/**
 * Build 2–3 distinct weekend variants for one set of stops and the current route.
 * Never proposes a 3+ day tour.
 */
export function weekendVariants(
  stops: Place[],
  route: RouteResult | null,
  settings: DaySettings,
  options?: { userOrder?: Place[] },
): WeekendVariant[] {
  if (stops.length < 2) return [];

  const optimized = optimizeStops(stops);
  const userOrder = options?.userOrder?.length ? options.userOrder : stops;
  const optimizedIds = optimized.map((p) => p.id).join(',');
  const userIds = userOrder.map((p) => p.id).join(',');
  const orderChanged = optimizedIds !== userIds;

  const variants: WeekendVariant[] = [];

  const oneDayOpt = buildVariant(
    'one-day-optimized',
    'Один день',
    'Все остановки в одном окне дня. Порядок подобран по близости, чтобы успеть за выходные.',
    optimized,
    route,
    settings,
    true,
    1,
  );

  const twoDayOpt = buildVariant(
    'two-day-optimized',
    'Выходные · 2 дня',
    'Разбивка на субботу и воскресенье с ночёвкой у вечерней точки первого дня.',
    optimized,
    route,
    settings,
    true,
    2,
  );

  const oneFits = oneDayOpt.fitStatus !== 'overflow';
  const needOvernight = !oneFits;
  const calmSplit =
    oneFits &&
    twoDayOpt.days.length === 2 &&
    twoDayOpt.fitStatus !== 'overflow' &&
    optimized.length >= 4;

  variants.push({
    ...oneDayOpt,
    title: 'Один день',
    summary: oneFits
      ? oneDayOpt.degraded
        ? 'Укладывается по длительности посещений. Время в пути неизвестно — раскладка ориентировочная.'
        : 'Все выбранные места умещаются в один день при вашем окне.'
      : 'Плотный сценарий: при текущем окне дня, скорее всего, не успеете — сравните с вариантом на выходные.',
  });

  if (needOvernight || calmSplit) {
    variants.push({
      ...twoDayOpt,
      title: needOvernight ? 'Выходные · 2 дня' : 'Спокойнее · 2 дня',
      summary: needOvernight
        ? twoDayOpt.fitStatus === 'overflow'
          ? 'Даже за два дня при текущем окне не всё умещается. Уберите остановки или смените режим.'
          : 'Ночёвка у вечерней точки первого дня. Выбор отеля не обязателен.'
        : 'Более спокойный темп: часть мест переносится на второй день выходных.',
    });
  }

  if (orderChanged) {
    const userForce: 1 | 2 = oneFits ? 1 : 2;
    const userVariant = buildVariant(
      'user-order',
      'Как вы выбрали',
      userForce === 1
        ? 'Ваш порядок остановок без оптимизации по близости.'
        : 'Ваш порядок с разбиением на два дня выходных.',
      userOrder,
      route,
      settings,
      false,
      userForce,
    );
    const duplicate = variants.some(
      (v) =>
        v.order.map((p) => p.id).join(',') === userIds &&
        sameDaySplit(
          v.days.map((d) => d.stops),
          userVariant.days.map((d) => d.stops),
        ),
    );
    if (!duplicate) variants.push(userVariant);
  } else if (variants.length === 1 && twoDayOpt.days.length === 2 && !needOvernight) {
    // Ensure a second meaningful option when optimize equals user order.
    variants.push({
      ...twoDayOpt,
      id: 'two-day-relaxed',
      title: 'Спокойнее · 2 дня',
      summary: 'Тот же порядок, но с ночёвкой и более спокойным темпом.',
    });
  }

  // If nothing fits even in 2 days, still surface the overflow variant.
  if (!variants.length) {
    variants.push({
      ...twoDayOpt,
      title: 'Выходные · 2 дня',
      summary:
        'При текущем окне дня маршрут не умещается в выходные. Уберите остановки или смените транспорт.',
    });
  }

  return variants.slice(0, 3);
}

export function optimizeForWeekend(stops: Place[]) {
  return optimizeStops(stops);
}

export { clockMinutes };

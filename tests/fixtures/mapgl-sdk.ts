// Contract fixture, not a rendering of 2GIS tiles. Live MapGL needs a domain-restricted key.
export function installMapGLFixture() {
  type Point = number[];
  type Padding = { top: number; right: number; bottom: number; left: number };
  type Handler = (event: { lngLat: number[] }) => void;
  type Animation = { animate?: boolean; duration?: number };
  type Bounds = { southWest: Point; northEast: Point };
  const state = { maps: 0, destroyed: 0, markerDestroys: 0, cleanupErrors: 0, lines: 0 };
  const mercator = (p: Point) => [
    (p[0] + 180) / 360,
    (1 - Math.log(Math.tan(Math.PI / 4 + (p[1] * Math.PI) / 360)) / Math.PI) / 2,
  ];
  const inverse = (p: Point) => [
    p[0] * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - p[1] * 2))) * 180) / Math.PI,
  ];

  class FixtureMap {
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    center: Point;
    zoom: number;
    padding: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
    events = new globalThis.Map<string, Set<Handler>>();
    markers = new Set<FixtureHtmlMarker>();
    polylines = new Set<FixturePolyline>();
    dead = false;
    constructor(container: HTMLElement, options: { center: Point; zoom: number; key?: string }) {
      this.container = container;
      this.center = options.center;
      this.zoom = options.zoom;
      if (!options.key) throw new Error('The SDK needs a key');
      state.maps++;
      Object.assign(window, {
        mapglNavigate: (coordinates: number[]) => this.setCenter(coordinates),
        mapglView: () => ({ center: this.getCenter(), zoom: this.getZoom() }),
      });
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'mapgl-fixture-canvas';
      Object.assign(this.canvas.style, { width: '100%', height: '100%', touchAction: 'none' });
      container.append(this.canvas);
      let drag: { x: number; y: number; center: Point; moved: boolean } | undefined;
      this.canvas.addEventListener('pointerdown', (e) => {
        this.canvas.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, center: mercator(this.center), moved: false };
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const scale = 512 * 2 ** this.zoom;
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        drag.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
        this.center = inverse([drag.center[0] - dx / scale, drag.center[1] - dy / scale]);
        this.render();
        this.emit('move');
      });
      this.canvas.addEventListener('pointerup', (e) => {
        const moved = drag?.moved;
        drag = undefined;
        if (moved) this.emit('moveend');
        else {
          const rect = this.canvas.getBoundingClientRect();
          this.emit('click', {
            lngLat: this.unproject([e.clientX - rect.left, e.clientY - rect.top]),
          });
        }
      });
      queueMicrotask(() => this.emit('styleload'));
    }
    on(name: string, listener: Handler) {
      if (!this.events.has(name)) this.events.set(name, new Set());
      this.events.get(name)!.add(listener);
      return this;
    }
    off(name: string, listener: Handler) {
      this.events.get(name)?.delete(listener);
      return this;
    }
    once(name: string, listener: Handler) {
      const fn: Handler = (event) => {
        this.off(name, fn);
        listener(event);
      };
      return this.on(name, fn);
    }
    emit(name: string, event = { lngLat: [0, 0] }) {
      this.events.get(name)?.forEach((fn) => fn(event));
      return this;
    }
    getSize() {
      return [this.container.clientWidth, this.container.clientHeight];
    }
    getCenter() {
      return [...this.center];
    }
    getZoom() {
      return this.zoom;
    }
    getStyleZoom() {
      return this.zoom;
    }
    getContainer() {
      return this.container;
    }
    getCanvas() {
      return this.canvas;
    }
    invalidateSize() {
      this.render();
      return this;
    }
    setCenter(point: Point) {
      this.center = [...point];
      this.change();
      return this;
    }
    setZoom(zoom: number) {
      this.zoom = Math.max(2, Math.min(19, zoom));
      this.change();
      return this;
    }
    setPadding(padding: Padding) {
      this.padding = { ...padding };
      this.change();
      return this;
    }
    project(point: Point) {
      const p = mercator(point),
        c = mercator(this.center),
        size = this.getSize(),
        scale = 512 * 2 ** this.zoom;
      return [
        (p[0] - c[0]) * scale + (size[0] + this.padding.left - this.padding.right) / 2,
        (p[1] - c[1]) * scale + (size[1] + this.padding.top - this.padding.bottom) / 2,
      ];
    }
    unproject(point: Point) {
      const c = mercator(this.center),
        size = this.getSize(),
        scale = 512 * 2 ** this.zoom;
      return inverse([
        c[0] + (point[0] - (size[0] + this.padding.left - this.padding.right) / 2) / scale,
        c[1] + (point[1] - (size[1] + this.padding.top - this.padding.bottom) / 2) / scale,
      ]);
    }
    getBounds() {
      const size = this.getSize();
      return { southWest: this.unproject([0, size[1]]), northEast: this.unproject([size[0], 0]) };
    }
    fitBounds(
      bounds: Bounds,
      options: {
        padding?: Padding;
        maxZoom?: number;
        skipMapPadding?: boolean;
        animation?: Animation;
      } = {},
    ) {
      const a = mercator(bounds.southWest),
        b = mercator(bounds.northEast),
        size = this.getSize();
      const padding = options.padding || { top: 0, right: 0, bottom: 0, left: 0 };
      const w = Math.max(1, size[0] - padding.left - padding.right),
        h = Math.max(1, size[1] - padding.top - padding.bottom);
      this.zoom = Math.max(
        2,
        Math.min(
          options.maxZoom || 19,
          Math.log2(w / (512 * Math.max(1e-9, b[0] - a[0]))),
          Math.log2(h / (512 * Math.max(1e-9, a[1] - b[1]))),
        ),
      );
      const scale = 512 * 2 ** this.zoom;
      this.center = inverse([
        (a[0] + b[0]) / 2 +
          (this.padding.left - this.padding.right - padding.left + padding.right) / (2 * scale),
        (a[1] + b[1]) / 2 +
          (this.padding.top - this.padding.bottom - padding.top + padding.bottom) / (2 * scale),
      ]);
      this.change();
      return this;
    }
    change() {
      this.render();
      this.emit('move');
      this.emit('moveend');
    }
    render() {
      this.markers.forEach((marker) => marker.render());
    }
    destroy() {
      if (this.markers.size || this.polylines.size) state.cleanupErrors++;
      this.dead = true;
      state.destroyed++;
      this.events.clear();
      this.canvas.remove();
    }
  }

  class FixtureHtmlMarker {
    map: FixtureMap;
    coordinates: Point;
    anchor: Point;
    root: HTMLDivElement;
    constructor(
      map: FixtureMap,
      options: { coordinates: Point; anchor: Point; html: HTMLElement },
    ) {
      this.map = map;
      this.coordinates = options.coordinates;
      this.anchor = options.anchor;
      this.root = document.createElement('div');
      Object.assign(this.root.style, { position: 'absolute', left: '0', top: '0' });
      this.root.append(options.html);
      map.container.append(this.root);
      map.markers.add(this);
      this.render();
    }
    render() {
      const p = this.map.project(this.coordinates);
      this.root.style.transform = `translate(${p[0] - this.anchor[0]}px, ${p[1] - this.anchor[1]}px)`;
      this.root.dataset.sdkCoordinates = JSON.stringify(this.coordinates);
      this.root.dataset.sdkPixel = JSON.stringify(p);
    }
    getCoordinates() {
      return this.coordinates;
    }
    setCoordinates(coordinates: Point) {
      this.coordinates = coordinates;
      this.render();
      return this;
    }
    getContent() {
      return this.root;
    }
    setZIndex(z: number) {
      this.root.style.zIndex = String(z);
      return this;
    }
    destroy() {
      if (this.map.dead) state.cleanupErrors++;
      this.root.remove();
      this.map.markers.delete(this);
      state.markerDestroys++;
    }
  }

  class FixturePolyline {
    map: FixtureMap;
    element: HTMLElement;
    constructor(map: FixtureMap, options: { coordinates: Point[]; dashLength?: number }) {
      this.map = map;
      this.element = document.createElement('div');
      this.element.className = 'mapgl-fixture-route';
      this.element.dataset.coordinates = JSON.stringify(options.coordinates);
      this.element.dataset.dashed = String(!!options.dashLength);
      map.container.append(this.element);
      map.polylines.add(this);
      state.lines++;
    }
    destroy() {
      if (this.map.dead) state.cleanupErrors++;
      this.element.remove();
      this.map.polylines.delete(this);
    }
  }
  Object.assign(window, {
    mapgl: { Map: FixtureMap, HtmlMarker: FixtureHtmlMarker, Polyline: FixturePolyline },
    mapglFixture: state,
  });
}

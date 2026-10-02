import {
  blockGlyphs,
  DrawNode,
  Marker,
  NODE_HOVERED,
  NODE_SELECTED,
  nodeGlyphs,
  nodeRect,
  serializeLinks,
  serializeNodes,
  serializeText
} from './buffers';
import { Camera } from './camera';
import {
  forEachNode,
  layout,
  removePlaceholders,
  setTreeLanguage,
  typesetTree
} from './layout';
import { Mouse, type PointerKind } from './mouse';
import { Renderer } from './renderer/webgpu';
import { Typesetter } from './text/typesetter';
import { Language, Node, Point, Rect } from './types';

/** Duration of layout transitions (collapse/expand) */
const LAYOUT_TRANSITION_MS = 450;
/** Duration of camera focus animations */
const CAMERA_TRANSITION_MS = 650;
/**
 * Zoom limits when focusing a node, in world units per CSS pixel:
 * text is 12 world units, so 1.0 keeps it at least 12px tall.
 */
const MAX_FOCUS_ZOOM = 1.0;
const MIN_FOCUS_ZOOM = 0.6;

/** The "›" marking collapsed propositions */
const MARKER_FONT_SIZE = 18;
const MARKER_COLOR = [0.45, 0.45, 0.45, 1] as const;

/** Width of the clickable "›" zone right of a proposition, in world units */
const MARKER_ZONE = 28;
/** Extra hit area around propositions for fingers, in CSS px */
const TOUCH_SLOP = 10;

/** Selections within this interval share one browser history entry */
const HISTORY_COALESCE_MS = 1000;

export interface ViewerOptions {
  /** Initial language of the propositions (default: English) */
  language?: Language;
  /** Called when the browser can't render with WebGPU */
  onUnsupported?: () => void;
  /** Loading progress, 0..1, with a short description of the current step */
  onProgress?: (fraction: number, label: string) => void;
}

/** A node's displayed rectangle and opacity, animating from → to */
interface Transition {
  from: Rect;
  to: Rect;
  fromAlpha: number;
  toAlpha: number;
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Viewer {
  private renderer?: Renderer;
  private camera = new Camera();
  private mouse!: Mouse;
  private resizeObserver: ResizeObserver;
  private renderFrame: number = 0;

  private tree!: Node;
  private typesetter?: Typesetter;
  private parentOf = new Map<Node, Node>();
  private glyphCache = new Map<Node, Float32Array>();
  private marker?: Marker;

  /** Displayed nodes and their current transitions */
  private transitions = new Map<Node, Transition>();
  private transitionStart = -Infinity;
  /** Layout targets of the visible nodes */
  private targets = new Map<Node, Rect>();
  private layoutOffset: Point = { x: 0, y: 0 };
  private drawList: DrawNode[] = [];
  /** Buffers need re-upload (layout, animation or highlight changed) */
  private dirty = true;

  private cameraTween?: { from: CameraState; to: CameraState; start: number };

  private language: Language;
  private hovered: Node | null = null;
  private selected: Node | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: ViewerOptions = {}
  ) {
    this.language = options.language ?? 'en';
    this.mouse = new Mouse(canvas, this.camera);
    this.mouse.on('update', this.requestRedraw);
    this.mouse.on('interact', () => (this.cameraTween = undefined));
    this.mouse.on('hover', this.onHover);
    this.mouse.on('click', this.onClick);
    window.addEventListener('keydown', this.onKeyDown);
    this.camera.zoom = 0.2;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.updateSize(width, height);
      }
    });
    this.resizeObserver.observe(canvas);
    this.init();
  }

  private progress(fraction: number, label: string) {
    this.options.onProgress?.(fraction, label);
  }

  async init() {
    this.progress(0, 'Loading fonts');
    try {
      if (!Renderer.isSupported()) throw new Error('WebGPU is not available');
      this.renderer = new Renderer(this.canvas);
      await this.renderer.init(this.camera.getViewProjMatrix());
    } catch (error) {
      console.error('Cannot render with WebGPU:', error);
      this.renderer = undefined;
      this.options.onUnsupported?.();
      return;
    }

    const [tree, typesetter] = await Promise.all([
      fetch('data.json').then((response) => response.json() as Promise<Node>),
      Typesetter.load().catch((error) => {
        console.error('Failed to load fonts, rendering without text:', error);
        return undefined;
      })
    ]);
    removePlaceholders(tree);
    this.tree = tree;
    this.typesetter = typesetter;

    // Typeset all propositions, then generate the glyph atlas once
    if (typesetter) {
      this.progress(0.1, 'Typesetting propositions');
      await typesetTree(tree, typesetter, this.language, (f) =>
        this.progress(0.1 + 0.4 * f, 'Typesetting propositions')
      );
      // "›" after collapsed propositions
      const markerBlock = typesetter.layout(
        [{ type: 'text', text: '›', italic: false, script: 0, math: false }],
        MARKER_FONT_SIZE
      );
      const atlas = await typesetter.buildAtlas((f) =>
        this.progress(0.5 + 0.5 * f, 'Generating glyphs')
      );
      this.renderer?.initTextRendering(atlas);
      this.marker = {
        glyphs: blockGlyphs(markerBlock, typesetter, MARKER_COLOR),
        height: markerBlock.height
      };
    }

    forEachNode(tree, (node) => {
      for (const child of node.children || []) this.parentOf.set(child, node);
    });

    // Start with the seven main propositions, everything below collapsed
    this.collapseBelowTop();

    // Optionally open on the proposition named in the URL hash (e.g. #4.1252)
    const focus = this.propositionFromUrl();
    if (focus) this.reveal(focus);

    this.relayout(this.tree, false);
    this.updateSize();
    if (focus) {
      this.selected = focus;
      this.moveCamera(this.focusTarget(focus), false);
    } else {
      this.center(false);
    }
    this.progress(1, '');
    this.requestRedraw();
    window.addEventListener('popstate', this.onUrlChange);
    window.addEventListener('hashchange', this.onUrlChange);
  }

  // --- URL navigation ------------------------------------------------------

  /** The proposition named in the URL hash, e.g. #4.1252 */
  private propositionFromUrl(): Node | null {
    const id = decodeURIComponent(location.hash.slice(1));
    return id ? this.findProposition(id) : null;
  }

  /** Expands all ancestors of a node; returns whether anything changed */
  private reveal(node: Node): boolean {
    let changed = false;
    for (let n = this.parentOf.get(node); n; n = this.parentOf.get(n)) {
      if (n.collapsed) {
        n.collapsed = false;
        changed = true;
      }
    }
    return changed;
  }

  /** Browser back/forward or an edited hash: navigate to that proposition */
  private onUrlChange = () => {
    const node = this.propositionFromUrl();
    if (node === this.selected) return;
    if (!node) {
      this.select(null, false);
      this.center();
      return;
    }
    if (this.reveal(node)) this.relayout(this.selected ?? this.tree);
    this.select(node, false);
  };

  /**
   * Mirrors the selection in the URL hash. Steps in quick succession (e.g.
   * arrow keys) replace the history entry instead of adding one each.
   */
  private lastHistoryPush = 0;
  private updateUrl(node: Node | null) {
    const hash = node?.data ? `#${node.data.id}` : '';
    if (location.hash === hash) return;
    const url = `${location.pathname}${location.search}${hash}`;
    const now = performance.now();
    if (now - this.lastHistoryPush < HISTORY_COALESCE_MS) {
      history.replaceState(null, '', url);
    } else {
      history.pushState(null, '', url);
    }
    this.lastHistoryPush = now;
  }

  // --- Public controls ----------------------------------------------------

  /** Expands every branch of the tree */
  expandAll() {
    if (!this.tree) return;
    forEachNode(this.tree, (node) => (node.collapsed = false));
    this.relayout(this.selected ?? this.tree);
    this.center();
  }

  /** Collapses everything below the seven main propositions */
  collapseAll() {
    if (!this.tree) return;
    this.collapseBelowTop();
    this.relayout(this.tree);
    this.center();
  }

  /** Switches the propositions between the English translation and the German original */
  setLanguage(language: Language) {
    if (language === this.language) return;
    this.language = language;
    if (!this.tree) return;
    setTreeLanguage(this.tree, language);
    this.glyphCache.clear();
    this.relayout(this.selected ?? this.tree);
    if (this.selected) this.moveCamera(this.focusTarget(this.selected));
  }

  /** Frames the whole visible tree */
  center(animate = true) {
    const rects = [...this.targets.values()];
    if (!rects.length) return;
    this.moveCamera(this.fitCamera(unionRects(rects), 1.1), animate);
  }

  private findProposition(id: string): Node | null {
    let found: Node | null = null;
    forEachNode(this.tree, (node) => {
      if (node.data?.id === id) found = node;
    });
    return found;
  }

  // --- Layout and transitions ----------------------------------------------

  private collapseBelowTop() {
    forEachNode(this.tree, (node) => {
      node.collapsed = node.depth >= 1 && node.children?.length > 0;
    });
  }

  /** Current displayed rectangle and opacity of every node on screen */
  private currentState(now: number) {
    const t = easeInOutCubic(
      Math.min(1, (now - this.transitionStart) / LAYOUT_TRANSITION_MS)
    );
    const state = new Map<Node, { rect: Rect; alpha: number }>();
    for (const [node, tr] of this.transitions) {
      const alpha = lerp(tr.fromAlpha, tr.toAlpha, t);
      if (alpha <= 0.001 && tr.toAlpha === 0) continue;
      state.set(node, {
        rect: {
          x: lerp(tr.from.x, tr.to.x, t),
          y: lerp(tr.from.y, tr.to.y, t),
          width: tr.to.width,
          height: tr.to.height
        },
        alpha
      });
    }
    return state;
  }

  /**
   * Recomputes the layout and starts a transition to it. `anchor` keeps its
   * on-screen position, so the part of the tree being edited doesn't jump.
   */
  private relayout(anchor: Node, animate = true) {
    const now = performance.now();
    const current = this.currentState(now);

    const root = layout(this.tree);
    const targets = new Map<Node, Rect>();
    for (const d of root.descendants()) targets.set(d.data, nodeRect(d));

    // Shift the new layout so the anchor stays where it is now
    const anchorNow = current.get(anchor)?.rect;
    const anchorNext = targets.get(anchor);
    if (anchorNow && anchorNext) {
      this.layoutOffset = {
        x: anchorNow.x - anchorNext.x,
        y: anchorNow.y - anchorNext.y
      };
    }
    for (const rect of targets.values()) {
      rect.x += this.layoutOffset.x;
      rect.y += this.layoutOffset.y;
    }

    const transitions = new Map<Node, Transition>();
    for (const [node, to] of targets) {
      const cur = current.get(node);
      if (!animate) {
        transitions.set(node, { from: to, to, fromAlpha: 1, toAlpha: 1 });
      } else if (cur) {
        transitions.set(node, { from: cur.rect, to, fromAlpha: cur.alpha, toAlpha: 1 });
      } else {
        // Appearing: grow out of the nearest ancestor that is on screen
        const ancestor = this.nearestAncestor(node, current);
        const from = ancestor ? attachTo(to, current.get(ancestor)!.rect) : to;
        transitions.set(node, { from, to, fromAlpha: 0, toAlpha: 1 });
      }
    }
    if (animate) {
      for (const [node, cur] of current) {
        if (targets.has(node)) continue;
        // Disappearing: fold into the nearest ancestor that stays
        const ancestor = this.nearestAncestor(node, targets);
        const to = ancestor ? attachTo(cur.rect, targets.get(ancestor)!) : cur.rect;
        transitions.set(node, { from: cur.rect, to, fromAlpha: cur.alpha, toAlpha: 0 });
      }
    }

    this.transitions = transitions;
    this.targets = targets;
    this.transitionStart = animate ? now : -Infinity;
    if (this.hovered && !targets.has(this.hovered)) this.hovered = null;
    if (this.selected && !targets.has(this.selected)) {
      this.selected = null;
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
    this.dirty = true;
    this.requestRedraw();
  }

  private nearestAncestor(node: Node, within: Map<Node, unknown>) {
    for (let n = this.parentOf.get(node); n; n = this.parentOf.get(n)) {
      if (within.has(n)) return n;
    }
    return null;
  }

  // --- Interaction -----------------------------------------------------------

  /**
   * Proposition under a canvas point. `onMarker` is true in the "›" zone to
   * the right of a proposition with children. `slop` (CSS px) widens the
   * targets, for fingers.
   */
  private hitTest(
    point: Point,
    slop = 0
  ): { node: Node; onMarker: boolean } | null {
    const world = this.camera.screenToWorld(point.x, point.y);
    const pad = slop * this.camera.zoom;
    for (let i = this.drawList.length - 1; i >= 0; i--) {
      const { node, rect, alpha } = this.drawList[i];
      if (alpha < 0.5 || !node.data) continue;
      if (world.y < rect.y - pad || world.y > rect.y + rect.height + pad) continue;
      const right = rect.x + rect.width;
      if (world.x >= rect.x - pad && world.x <= right) {
        return { node, onMarker: false };
      }
      if (
        node.children?.length &&
        world.x > right &&
        world.x <= right + MARKER_ZONE + pad
      ) {
        return { node, onMarker: true };
      }
    }
    return null;
  }

  private onHover = (point: Point | null) => {
    const hit = point ? this.hitTest(point)?.node ?? null : null;
    this.canvas.style.cursor = hit ? 'pointer' : '';
    if (hit === this.hovered) return;
    this.hovered = hit;
    this.dirty = true;
    this.requestRedraw();
  };

  private onClick = (point: Point, pointer: PointerKind) => {
    const touch = pointer !== 'mouse';
    const hit = this.hitTest(point, touch ? TOUCH_SLOP : 0);
    if (!hit) {
      this.select(null);
      return;
    }
    const { node, onMarker } = hit;
    if (onMarker || node === this.selected) {
      // "›" or a second click: collapse/expand
      if (node !== this.selected) this.selected = node;
      this.toggle(node);
      this.updateUrl(node);
    } else if (touch && node.collapsed && node.children?.length) {
      // No hover on touch screens: one tap opens a collapsed proposition
      this.selected = node;
      this.toggle(node);
      this.updateUrl(node);
    } else {
      this.select(node);
    }
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.tree || event.metaKey || event.ctrlKey || event.altKey) return;
    const selected = this.selected;

    let handled = true;
    if (!selected) {
      if (event.key.startsWith('Arrow')) {
        this.select(this.tree.children?.[0] ?? null);
      } else {
        handled = false;
      }
    } else {
      const parent = this.parentOf.get(selected);
      const siblings = parent ? parent.children : [];
      const index = siblings.indexOf(selected);
      switch (event.key) {
        case 'ArrowLeft':
          if (parent?.data) this.select(parent);
          break;
        case 'ArrowRight':
          if (selected.collapsed && selected.children?.length) {
            this.toggle(selected);
          } else if (selected.children?.length) {
            this.select(selected.children[0]);
          }
          break;
        case 'ArrowUp':
          if (index > 0) this.select(siblings[index - 1]);
          break;
        case 'ArrowDown':
          if (index >= 0 && index < siblings.length - 1) {
            this.select(siblings[index + 1]);
          }
          break;
        case 'Enter':
        case ' ':
          this.toggle(selected);
          break;
        case 'Escape':
          this.select(null);
          break;
        default:
          handled = false;
      }
    }
    if (handled) event.preventDefault();
  };

  /** Selects a node (or clears the selection) and focuses the camera on it */
  select(node: Node | null, updateUrl = true) {
    this.selected = node;
    this.dirty = true;
    if (updateUrl) this.updateUrl(node);
    if (node) this.moveCamera(this.focusTarget(node));
    this.requestRedraw();
  }

  /** Collapses or expands a node's children */
  toggle(node: Node) {
    if (!node.children?.length) return;
    node.collapsed = !node.collapsed;
    this.relayout(node);
    if (node === this.selected) this.moveCamera(this.focusTarget(node));
  }

  // --- Camera ----------------------------------------------------------------

  /** Camera state that frames a node and its visible children */
  private focusTarget(node: Node): CameraState {
    const rect = this.targets.get(node);
    if (!rect) return { ...this.camera.position, zoom: this.camera.zoom };
    const children = node.collapsed ? [] : node.children || [];
    const rects = [rect];
    for (const child of children) {
      const childRect = this.targets.get(child);
      if (childRect) rects.push(childRect);
    }
    const bounds = unionRects(rects);
    const fit = this.fitCamera(bounds, 1.15);
    const zoom = Math.min(MAX_FOCUS_ZOOM, Math.max(MIN_FOCUS_ZOOM, fit.zoom));
    const header = this.headerHeight();

    if (rects.length > 1 && bounds.width / zoom > this.camera.width) {
      // Narrow screen (phone): the node and its children don't fit side by
      // side, so show the children's column, with the incoming links
      const column = unionRects(rects.slice(1));
      const visibleHeight = this.camera.height - header;
      const y =
        column.height / zoom <= visibleHeight * 0.9
          ? column.y + column.height / 2 + (header / 2) * zoom
          : // Taller than the screen: start at the first child, below the header
            column.y + column.height - (this.camera.height / 2 - header - 16) * zoom;
      const x = Math.max(
        column.x + column.width / 2,
        column.x - 24 * zoom + (this.camera.width / 2) * zoom
      );
      return { x: Math.min(x, column.x + column.width / 2 + 24 * zoom), y, zoom };
    }

    if (zoom < fit.zoom) {
      // Children don't fit at a readable size: keep the node centered
      // vertically and show as much of the children as fits to its right
      const leftEdge = rect.x - 40 * zoom;
      return {
        x: Math.min(fit.x, leftEdge + (this.camera.width * zoom) / 2),
        y: rect.y + rect.height / 2 + (header / 2) * zoom,
        zoom
      };
    }
    return { x: fit.x, y: fit.y, zoom };
  }

  /** Camera that fits `bounds` into the canvas area below the page header */
  private fitCamera(bounds: Rect, padding: number): CameraState {
    const top = this.headerHeight();
    const width = Math.max(this.camera.width, 1);
    const height = Math.max(this.camera.height - top, 1);
    const zoom = Math.max(
      (bounds.width * padding) / width,
      (bounds.height * padding) / height
    );
    return {
      x: bounds.x + bounds.width / 2,
      // Shift up so the bounds are centered in the area below the header
      y: bounds.y + bounds.height / 2 + (top / 2) * zoom,
      zoom
    };
  }

  /** Height of the page header overlapping the top of the canvas, in CSS px */
  private headerHeight() {
    const header = document.querySelector('header');
    if (!header) return 0;
    const canvasTop = this.canvas.getBoundingClientRect().top;
    return Math.max(0, header.getBoundingClientRect().bottom - canvasTop);
  }

  private moveCamera(to: CameraState, animate = true) {
    const zoom = Math.min(
      this.camera.maxZoom,
      Math.max(this.camera.minZoom, to.zoom)
    );
    if (!animate) {
      this.cameraTween = undefined;
      this.camera.position = { x: to.x, y: to.y };
      this.camera.zoom = zoom;
    } else {
      this.cameraTween = {
        from: { ...this.camera.position, zoom: this.camera.zoom },
        to: { x: to.x, y: to.y, zoom },
        start: performance.now()
      };
    }
    this.requestRedraw();
  }

  private stepCamera(now: number): boolean {
    const tween = this.cameraTween;
    if (!tween) return false;
    const t = Math.min(1, (now - tween.start) / CAMERA_TRANSITION_MS);
    const e = easeInOutCubic(t);
    this.camera.position = {
      x: lerp(tween.from.x, tween.to.x, e),
      y: lerp(tween.from.y, tween.to.y, e)
    };
    // Interpolate zoom geometrically so zooming feels uniform
    this.camera.zoom = Math.exp(
      lerp(Math.log(tween.from.zoom), Math.log(tween.to.zoom), e)
    );
    if (t >= 1) this.cameraTween = undefined;
    return t < 1;
  }

  // --- Rendering -------------------------------------------------------------

  requestRedraw = () => {
    if (this.renderFrame) return;
    this.renderFrame = requestAnimationFrame(this.redraw);
  };

  updateSize(
    width = this.canvas.clientWidth,
    height = this.canvas.clientHeight
  ) {
    // Render at device resolution; the camera works in CSS pixels
    const dpr = window.devicePixelRatio || 1;
    const deviceWidth = Math.max(1, Math.round(width * dpr));
    const deviceHeight = Math.max(1, Math.round(height * dpr));
    this.camera.width = width;
    this.camera.height = height;
    if (this.renderer) {
      this.renderer.resize(deviceWidth, deviceHeight);
      this.requestRedraw();
    }
  }

  private uploadScene(now: number) {
    if (!this.renderer) return;
    const typesetter = this.typesetter;

    this.drawList = [];
    for (const [node, { rect, alpha }] of this.currentState(now)) {
      let flags = 0;
      if (node === this.hovered) flags |= NODE_HOVERED;
      if (node === this.selected) flags |= NODE_SELECTED;
      this.drawList.push({ node, rect, alpha, state: flags });
    }

    const glyphsOf = (node: Node) => {
      let glyphs = this.glyphCache.get(node);
      if (!glyphs) {
        glyphs = typesetter ? nodeGlyphs(node, typesetter) : new Float32Array(0);
        this.glyphCache.set(node, glyphs);
      }
      return glyphs;
    };

    this.renderer.upload({
      ...serializeNodes(this.drawList),
      ...serializeLinks(this.drawList, this.parentOf),
      ...serializeText(this.drawList, glyphsOf, this.marker)
    });
  }

  private redraw = () => {
    this.renderFrame = 0;
    if (!this.renderer || !this.tree) return;
    const now = performance.now();

    const layoutAnimating = now - this.transitionStart < LAYOUT_TRANSITION_MS;
    if (this.dirty || layoutAnimating) {
      this.uploadScene(now);
      // Upload once more after the last animation frame to settle exactly
      this.dirty = layoutAnimating;
    }
    const cameraAnimating = this.stepCamera(now);

    this.renderer.updateViewProj(this.camera.getViewProjMatrix());
    this.renderer.draw();

    if (layoutAnimating || cameraAnimating || this.dirty) this.requestRedraw();
  };

  public destroy() {
    this.resizeObserver.disconnect();
    this.mouse.destroy();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('popstate', this.onUrlChange);
    window.removeEventListener('hashchange', this.onUrlChange);
    cancelAnimationFrame(this.renderFrame);
  }
}

function unionRects(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** `rect` moved onto `anchor`'s left edge, vertically centered on it */
function attachTo(rect: Rect, anchor: Rect): Rect {
  return {
    ...rect,
    x: anchor.x,
    y: anchor.y + (anchor.height - rect.height) / 2
  };
}

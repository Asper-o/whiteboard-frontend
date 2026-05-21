// src/app/services/drawing.service.ts

import { Injectable } from '@angular/core';
import { BoardStateService } from '../board-state/board-state';
import { ToolState } from '../tool-state/tool-state';
import { Transform } from '../transform/transform';
import { Path } from '../../models/path/path.model';
import { Box } from '../../models/box/box.model';

/**
 * Drawing handles complex vector interactions including freehand SVG path generation, 
 * raycast hit-testing for strokes, and a heuristic-based Shape Recognition Engine.
 */
@Injectable({ providedIn: 'root' })
export class Drawing {
  
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  /** The active SVG path currently being manipulated by the user. */
  currentPath: Path | null = null;
  /** Boolean lock preventing accidental strokes during camera panning. */
  isDrawing = false;
  /** Mathematical array of raw world coordinates making up the current stroke. */
  points: { x: number; y: number }[] = []; 

  private holdTimer: any;
  private hasSnapped = false; 
  private holdStartPos = { x: 0, y: 0 }; 
  private lastPointerPos = { x: 0, y: 0 };
  private pendingShapeBox: Box | null = null;
  private lastClickTime = 0;

  constructor(
    private board: BoardStateService,
    private tools: ToolState,
    private transform: Transform,
  ) {}

  // ============================================
  // 1. STROKE LIFECYCLE ROUTING
  // ============================================

  /**
   * Initializes a new vector drawing stroke.
   * Evaluates double-click raycasts to allow Pen users to select underlying items
   * without switching tools. Enforces strict boundary clamping if constrained to a page.
   */
  startPath(event: PointerEvent) {
    if (this.tools.tool !== 'pen') return;

    // 1. SMART SELECTION (Double-Click Hit Test)
    const now = Date.now();
    if (now - this.lastClickTime < 300) {
       const rawWorld = this.transform.toWorld(event.clientX, event.clientY);
       const clickedBox = this.findBoxAt(rawWorld); 

       if (clickedBox) {
         this.board.selectBox(clickedBox);
         this.isDrawing = false;
         return; 
       }
    }
    this.lastClickTime = now;

    // 2. COORDINATE RESOLUTION & CLAMPING
    let { x, y } = this.transform.toWorld(event.clientX, event.clientY);
    const config = this.board.board.pageConfig;
    
    if (config.type === 'fixed') {
        const pages = this.board.board.pages || [];
        const activePage = pages.find((p: any) => p.id === this.board.board.activePageId);
        
        if (activePage) {
            x = Math.max(activePage.x, Math.min(x, activePage.x + activePage.width));
            y = Math.max(activePage.y, Math.min(y, activePage.y + activePage.height));
        }
    }
    
    // 3. STATE INITIALIZATION
    this.isDrawing = true;
    this.hasSnapped = false; 
    this.points = [{ x, y }]; 
    this.holdStartPos = { x: event.clientX, y: event.clientY };
    this.lastPointerPos = { x: event.clientX, y: event.clientY };

    // 4. DOM INJECTION
    this.currentPath = {
      id: Date.now(),
      d: `M ${x} ${y}`, 
      color: this.tools.currentColorString, 
      width: this.tools.penWidth,
      points: [{ x, y }] 
    };

    this.board.board.paths.push(this.currentPath);
    this.resetHoldTimer();
  }

  /**
   * Captures pointer movements to append segment data to the live vector path.
   * Tracks stroke velocity/jitter to determine if the user is holding still (Triggering Shape Snap).
   */
  addPoint(event: PointerEvent) {
    if (!this.isDrawing || !this.currentPath || this.hasSnapped) return;

    this.lastPointerPos = { x: event.clientX, y: event.clientY };
    let { x, y } = this.transform.toWorld(event.clientX, event.clientY);

    const config = this.board.board.pageConfig;
    if (config.type === 'fixed') {
        const pages = this.board.board.pages || [];
        const activePage = pages.find((p: any) => p.id === this.board.board.activePageId);
        
        if (activePage) {
            x = Math.max(activePage.x, Math.min(x, activePage.x + activePage.width));
            y = Math.max(activePage.y, Math.min(y, activePage.y + activePage.height));
        }
    }

    this.points.push({ x, y }); 
    this.currentPath.points.push({ x, y });
    this.currentPath.d += ` L ${x} ${y}`;

    // JITTER TOLERANCE LOGIC
    const dist = Math.hypot(
      event.clientX - this.holdStartPos.x, 
      event.clientY - this.holdStartPos.y
    );

    // If movement exceeds noise threshold, reset the shape-recognition holding timer
    if (dist > 6) {
      this.holdStartPos = { x: event.clientX, y: event.clientY };
      this.resetHoldTimer();
    }
  }

  /**
   * Terminates the active stroke. 
   * Evaluates if the stroke was snapped into a geometric shape via the recognition engine,
   * otherwise normalizes the raw points into an independent bounding-box wrapper.
   */
  finishPath() {
    clearTimeout(this.holdTimer);

    if (!this.currentPath) {
        this.isDrawing = false;
        return;
    }

    const pathId = this.currentPath.id;
    this.board.board.paths = this.board.board.paths.filter(p => p.id !== pathId);

    if (this.hasSnapped && this.pendingShapeBox) {
       this.pendingShapeBox.id = Date.now();
       this.board.board.boxes.push(this.pendingShapeBox);
       this.board.selectBox(this.pendingShapeBox);
    } 
    else {
       if (this.points.length > 1) {
          this.createDrawingBox();
       }
    }

    this.board.notifyChange(); 
    this.isDrawing = false;
    this.currentPath = null;
    this.points = [];
    this.hasSnapped = false;
    this.pendingShapeBox = null;
    this.board.saveCheckpoint();
  }

  /**
   * Normalizes raw global stroke coordinates into a localized 0..1 ratio system.
   * Wraps the freehand path in a standardized Box element allowing it to be rotated/scaled.
   */
  private createDrawingBox() {
    const strokeW = this.tools.penWidth;
    const padding = strokeW / 2;
    
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    const minX = Math.min(...xs) - padding;
    const maxX = Math.max(...xs) + padding;
    const minY = Math.min(...ys) - padding;
    const maxY = Math.max(...ys) + padding;

    const width = Math.max(20, maxX - minX); 
    const height = Math.max(20, maxY - minY); 

    const normalizedPoints = this.points.map(p => ({
        x: (p.x - minX) / width,
        y: (p.y - minY) / height
    }));

    const drawingBox: Box = {
        id: Date.now(),
        type: 'drawing',
        x: minX,
        y: minY,
        width: width,
        height: height,
        rotate: 0,
        selected: true,
        editing: false,
        color: this.currentPath?.color || '#000',
        drawPoints: normalizedPoints, 
        text: "",
        strokeWidth: this.tools.penWidth
    };

    this.board.board.boxes.push(drawingBox);
    this.board.selectBox(drawingBox);
  }

  // ============================================
  // 2. COMPUTATIONAL GEOMETRY & RAYCASTING
  // ============================================

  /** Scans the Z-Index stack top-down to find the first bounding box intercepting the coordinates. */
  private findBoxAt(pt: {x:number, y:number}): Box | undefined {
    const boxes = this.board.board.boxes;
    for (let i = boxes.length - 1; i >= 0; i--) {
      if (this.hitTest(pt, boxes[i])) {
        return boxes[i];
      }
    }
    return undefined;
  }

  /**
   * Performs an initial broad-phase Axis-Aligned Bounding Box (AABB) intersection check,
   * accounting for counter-rotational matrix transforms. 
   */
  private hitTest(pt: {x:number, y:number}, box: Box): boolean {
    const dx = pt.x - box.x;
    const dy = pt.y - box.y;

    const angleRad = -box.rotate * (Math.PI / 180);
    const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
    const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

    const inBounds = localX >= 0 && localX <= box.width &&
                     localY >= 0 && localY <= box.height;

    if (!inBounds) return false;

    // Narrow-Phase checking for complex freehand curves
    if (box.type === 'drawing' && box.drawPoints && box.drawPoints.length > 1) {
      return this.preciseHitTest(localX, localY, box);
    }
    return true; 
  }

  /**
   * Narrow-Phase collision detection.
   * Evaluates if a click fell specifically on the painted pixels of a freehand vector stroke
   * by calculating proximity to underlying poly-line segments.
   */
  private preciseHitTest(localX: number, localY: number, box: Box): boolean {
    const safeStrokeWidth = box.strokeWidth ?? 4;
    const hitTolerance = (safeStrokeWidth / 2) + 4; // Padding for easier stylus selection

    for (let i = 0; i < box.drawPoints!.length - 1; i++) {
        const p1 = box.drawPoints![i];
        const p2 = box.drawPoints![i+1];

        const x1 = p1.x * box.width;
        const y1 = p1.y * box.height;
        const x2 = p2.x * box.width;
        const y2 = p2.y * box.height;

        const dist = this.distToSegment(
            { x: localX, y: localY }, 
            { x: x1, y: y1 }, 
            { x: x2, y: y2 }
        );

        if (dist <= hitTolerance) return true;
    }
    return false; 
  }

  /** Mathematical projection utility finding the shortest distance between a point and a line segment. */
  private distToSegment(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}): number {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t)); // Clamp projection to the bounds of the actual segment
    
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    
    return Math.hypot(p.x - projX, p.y - projY);
  }

  // ============================================
  // 3. HEURISTIC SHAPE RECOGNITION ENGINE
  // ============================================

  private resetHoldTimer() {
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
       this.trySnapToShape();
    }, 600);
  }

  /**
   * Invoked when stroke velocity drops near zero.
   * Passes the raw point array to the mathematical heuristic engine to determine if
   * the stroke intends to be a geometric primitive. Converts the DOM string directly if true.
   */
  private trySnapToShape() {
    if (this.points.length < 3 || !this.currentPath) return;

    const shapeType = this.recognizeShape(this.points);
    if (!shapeType) return;

    const strokeW = this.tools.penWidth;
    const padding = strokeW / 2;

    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    const minX = Math.min(...xs) - padding;
    const maxX = Math.max(...xs) + padding;
    const minY = Math.min(...ys) - padding;
    const maxY = Math.max(...ys) + padding;

    const width = maxX - minX;
    const height = maxY - minY;
    let isFlipped = false;

    let perfectD = '';
    if (shapeType === 'rectangle') {
        perfectD = `M ${minX} ${minY} L ${maxX} ${minY} L ${maxX} ${maxY} L ${minX} ${maxY} Z`;
    } 
    else if (shapeType === 'circle') {
        const rx = width / 2;
        const ry = height / 2;
        const cx = minX + rx;
        const cy = minY + ry;
        perfectD = `M ${minX} ${cy} A ${rx} ${ry} 0 1 1 ${maxX} ${cy} A ${rx} ${ry} 0 1 1 ${minX} ${cy}`;
    }
    else if (shapeType === 'line') {
        const start = this.points[0];
        const end = this.points[this.points.length-1];
        perfectD = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
        
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (dx * dy < 0) isFlipped = true;
    } 
    else if (shapeType === 'diamond') {
        const midX = minX + width / 2;
        const midY = minY + height / 2;
        perfectD = `M ${midX} ${minY} L ${maxX} ${midY} L ${midX} ${maxY} L ${minX} ${midY} Z`;
    }

    // Direct DOM Mutation for immediate visual feedback before Angular CD runs
    const pathElement = document.getElementById('path-' + this.currentPath.id);
    if (pathElement) {
        pathElement.setAttribute('d', perfectD);
    }
    this.currentPath.d = perfectD;

    this.pendingShapeBox = {
        id: Date.now(),
        type: 'shape',
        shapeType: shapeType,
        x: minX, y: minY, width, height,
        color: this.currentPath!.color,
        rotate: 0, text: '', selected: true, editing: false,
        flip: isFlipped,
        strokeWidth: this.tools.penWidth,
    };

    this.hasSnapped = true; 
  }

  /**
   * The Math Brain. Uses geometric ratios to classify freehand strokes.
   * Evaluates Linearity (Displacement vs Ink used), Roundness (Radius Variance), 
   * and Corner Hits (AABB bounding tests) to predict user intent.
   */
  private recognizeShape(points: {x:number, y:number}[]): 'circle' | 'rectangle' | 'line' | 'diamond' | null {
    if (points.length < 5) return null;

    const start = points[0];
    const end = points[points.length - 1];

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    
    let totalPathLen = 0;
    for (let i = 1; i < points.length; i++) {
        totalPathLen += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
    }
    const displacement = Math.hypot(start.x - end.x, start.y - end.y);

    // 1. Linearity: Distance traveled relative to ink used.
    const linearity = displacement / totalPathLen;
    if (linearity > 0.85) return 'line';

    // 2. Roundness: Radius Variance from bounding center point.
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    let totalRadius = 0;
    points.forEach(p => totalRadius += Math.hypot(p.x - centerX, p.y - centerY));
    const avgRadius = totalRadius / points.length;

    let variance = 0;
    points.forEach(p => {
        const r = Math.hypot(p.x - centerX, p.y - centerY);
        variance += Math.pow(r - avgRadius, 2);
    });
    
    const roundness = variance / (avgRadius * avgRadius * points.length);
    if (roundness < 0.04) return 'circle';

    // 3. Corner Weighting: Distinguishes Squares vs Diamonds based on vertex alignment.
    let cornerHits = 0;
    const tolerance = (width + height) * 0.15; 

    points.forEach(p => {
        if (Math.hypot(p.x - minX, p.y - minY) < tolerance) cornerHits++;
        else if (Math.hypot(p.x - maxX, p.y - minY) < tolerance) cornerHits++;
        else if (Math.hypot(p.x - maxX, p.y - maxY) < tolerance) cornerHits++;
        else if (Math.hypot(p.x - minX, p.y - maxY) < tolerance) cornerHits++;
    });

    return cornerHits > 0 ? 'rectangle' : 'diamond';
  }
}
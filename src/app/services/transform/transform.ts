// src/app/services/transform.service.ts

import { Injectable } from '@angular/core';
import { BoardStateService } from '../board-state/board-state';
import { Box } from '../../models/box/box.model';
import { ToolState } from '../tool-state/tool-state';

/**
 * Transform operates as the central mathematical engine for the infinite canvas.
 * It handles Affine transformations, coordinate conversions (Screenspace to Worldspace),
 * trigonometry for vector rotations, and algorithmic grid-snapping logic.
 */
@Injectable({ providedIn: 'root' })
export class Transform {
  
  // ============================================
  // INTERACTION FLAGS
  // ============================================
  isPanning = false;
  isRotating = false;
  isResizing = false;
  isDraggingBox = false;
  isPinching = false;

  private targetBox: Box | null = null;

  // ============================================
  // MATHEMATICAL STATE CACHE
  // ============================================
  private lastPinchDist = 0;
  private lastPinchCenter = { x: 0, y: 0 };

  private lastX = 0;
  private lastY = 0;
  
  private initialAngle = 0;
  private initialBoxCenter = { x: 0, y: 0 };
  
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startHeight = 0;
  private startFontSize = 0;
  private aspectRatio = 1;

  private dragStartBoxX = 0;
  private dragStartBoxY = 0;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(
    private boardState: BoardStateService,
    private tools: ToolState
  ) {}

  // ============================================
  // 1. THE MATH ENGINE (Coordinate Conversion)
  // ============================================

  /**
   * Translates Screen Pixels (Client Mouse) into SVG World Coordinates.
   * Reverses the global zoom scale and pan offsets to pinpoint exact geometric locations.
   * 
   * @param x Screenspace X coordinate
   * @param y Screenspace Y coordinate
   */
  toWorld(x: number, y: number): { x: number, y: number } {
    const board = this.boardState.board;
    return {
      x: (x - board.canvasX) / board.scale,
      y: (y - board.canvasY) / board.scale
    };
  }

  // ============================================
  // 2. PINCH-TO-ZOOM (Touchpad/Mobile)
  // ============================================

  /**
   * Evaluates multi-touch point distances to scale the global workspace.
   * Uses an Anchor-based logic model to prevent accidental panning drift while zooming.
   */
  handlePinch(p1: {x: number, y: number}, p2: {x: number, y: number}): void {
    const currDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const currCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    if (!this.isPinching) {
      this.isPinching = true;
      this.lastPinchDist = currDist;
      this.lastPinchCenter = currCenter; 
      
      this.isPanning = false;
      this.isDraggingBox = false;
      return;
    }

    const board = this.boardState.board;
    const scaleRatio = currDist / this.lastPinchDist;
    const newScale = Math.max(0.1, Math.min(5, board.scale * scaleRatio));

    // Anchor Matrix calculations to zoom directly into the pinch center
    const anchor = this.lastPinchCenter; 
    const worldPointX = (anchor.x - board.canvasX) / board.scale;
    const worldPointY = (anchor.y - board.canvasY) / board.scale;

    board.scale = newScale;
    board.canvasX = anchor.x - (worldPointX * newScale);
    board.canvasY = anchor.y - (worldPointY * newScale);

    this.lastPinchDist = currDist;
  }

  endPinch(): void {
    this.isPinching = false;
  }

  // ============================================
  // 3. PANNING & SCROLL ZOOM LOGIC
  // ============================================

  startPan(event: PointerEvent): void {
    this.isPanning = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  pan(event: PointerEvent): void {
    if (!this.isPanning || this.isPinching) return;
    
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;

    this.boardState.board.canvasX += dx;
    this.boardState.board.canvasY += dy;

    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  stopPan(): void {
    this.isPanning = false;
  }

  /** Calculates scroll-wheel deltas and applies localized scaling targeting the cursor matrix. */
  zoom(deltaY: number, mouseX: number, mouseY: number): void {
    const board = this.boardState.board;
    const zoomIntensity = 0.1;
    
    const direction = deltaY > 0 ? -1 : 1;
    const newScale = Math.max(0.1, Math.min(5, board.scale + (direction * zoomIntensity * board.scale)));

    const worldMouse = this.toWorld(mouseX, mouseY);

    board.scale = newScale;
    board.canvasX = mouseX - (worldMouse.x * newScale);
    board.canvasY = mouseY - (worldMouse.y * newScale);
  }

  resetZoom(): void {
    this.boardState.board.canvasX = 0;
    this.boardState.board.canvasY = 0;
    this.boardState.board.scale = 1;
  }

  // ============================================
  // 4. ELEMENT TRANSFORMATIONS (Rotate/Resize)
  // ============================================

  /** Caches the geometric center of an element to establish a stable rotation pivot point. */
  startRotate(box: Box, event: PointerEvent): void {
    this.isRotating = true;
    this.targetBox = box; 
    
    const board = this.boardState.board;
    const screenBoxX = (box.x * board.scale) + board.canvasX;
    const screenBoxY = (box.y * board.scale) + board.canvasY;
    
    const angleRad = (box.rotate || 0) * (Math.PI / 180);
    const w = box.width * board.scale;
    const h = box.height * board.scale;

    // Mathematical deduction of the visual center
    const centerX = screenBoxX + (w/2 * Math.cos(angleRad)) - (h/2 * Math.sin(angleRad));
    const centerY = screenBoxY + (w/2 * Math.sin(angleRad)) + (h/2 * Math.cos(angleRad));

    this.initialBoxCenter = { x: centerX, y: centerY };

    const currentMouseAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    this.initialAngle = currentMouseAngle - angleRad;
  }

  /** Applies trigonometric rotations using ArcTangent matrices to map mouse arcs to DOM rotations. */
  rotate(event: PointerEvent): void {
    if (!this.isRotating || !this.targetBox) return;
    const box = this.targetBox; 

    const mouseAngle = Math.atan2(
      event.clientY - this.initialBoxCenter.y, 
      event.clientX - this.initialBoxCenter.x
    );
    
    const newAngleRad = mouseAngle - this.initialAngle;
    box.rotate = newAngleRad * (180 / Math.PI);

    const w = box.width;
    const h = box.height;
    
    const worldCenterX = (this.initialBoxCenter.x - this.boardState.board.canvasX) / this.boardState.board.scale;
    const worldCenterY = (this.initialBoxCenter.y - this.boardState.board.canvasY) / this.boardState.board.scale;

    const newX = worldCenterX - (w/2 * Math.cos(newAngleRad)) + (h/2 * Math.sin(newAngleRad));
    const newY = worldCenterY - (w/2 * Math.sin(newAngleRad)) - (h/2 * Math.cos(newAngleRad));

    box.x = newX;
    box.y = newY;
  }

  startResize(box: Box, event: PointerEvent): void {
    this.isResizing = true;
    this.targetBox = box;
    this.startX = event.clientX;
    this.startY = event.clientY;

    this.startWidth = box.width;
    this.startHeight = box.height;
    this.startFontSize = box.fontSize || 16;
    this.aspectRatio = box.width / box.height;
  }

  /**
   * Processes vector scaling utilizing inverse cosine projections.
   * Dynamically routes logic to preserve image aspect ratios or scale typography linearly.
   */
  resize(e: PointerEvent): void {
    if (!this.isResizing || !this.targetBox) return;
    
    const box = this.targetBox;
    const scale = this.boardState.board.scale;
    const dx = (e.clientX - this.startX) / scale;
    const dy = (e.clientY - this.startY) / scale;

    const angleRad = (box.rotate || 0) * (Math.PI / 180);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const localDeltaX = (dx * cos) + (dy * sin);
    const localDeltaY = (dy * cos) - (dx * sin);
    
    if (box.type === 'image') {
      const newWidth = Math.max(20, this.startWidth + localDeltaX);
      box.width = newWidth;
      box.height = newWidth / this.aspectRatio; 
    } 
    else if (box.type === 'text') {
      box.width = Math.max(20, this.startWidth + localDeltaX);
      if (!box.isFixedFont) {
          const heightRatio = (this.startHeight + localDeltaY) / this.startHeight;
          box.fontSize = Math.max(8, this.startFontSize * heightRatio);
      }
    } 
    else {
      box.width = Math.max(20, this.startWidth + localDeltaX);
      box.height = Math.max(20, this.startHeight + localDeltaY);
    }
  }

  // ============================================
  // 5. DRAG & SOFT SNAP ENGINE
  // ============================================

  startDragBox(box: Box, event: PointerEvent): void {
    this.isDraggingBox = true;
    this.targetBox = box;
    
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartBoxX = box.x;
    this.dragStartBoxY = box.y;

    if (!box.selected) {
      this.boardState.selectBox(box);
    }
  }

  /**
   * Applies absolute coordinate translations and evaluates grid thresholds 
   * to provide a satisfying "soft snap" alignment feeling.
   */
  dragBox(event: PointerEvent): void {
    if (!this.isDraggingBox || !this.targetBox || this.isPinching) return;

    const scale = this.boardState.board.scale;
    const totalDx = (event.clientX - this.dragStartX) / scale;
    const totalDy = (event.clientY - this.dragStartY) / scale;

    let finalX = this.dragStartBoxX + totalDx;
    let finalY = this.dragStartBoxY + totalDy;

    // SOFT SNAP LOGIC (Hybrid: Page or Global)
    if (this.tools.snapToGrid) {
        const size = this.tools.gridSize || 40;
        const threshold = 8; 
        const activePage = this.boardState.getActivePage();
        
        const originX = activePage ? activePage.x : 0;
        const originY = activePage ? activePage.y : 0;

        const relativeX = finalX - originX;
        const nearestLocalX = Math.round(relativeX / size) * size;
        const nearestX = nearestLocalX + originX;

        if (Math.abs(finalX - nearestX) < threshold) {
            finalX = nearestX; 
        }

        const relativeY = finalY - originY;
        const nearestLocalY = Math.round(relativeY / size) * size;
        const nearestY = nearestLocalY + originY;

        if (Math.abs(finalY - nearestY) < threshold) {
            finalY = nearestY;
        }
    }

    const diffX = finalX - this.targetBox.x;
    const diffY = finalY - this.targetBox.y;

    if (this.targetBox.selected) {
        this.boardState.board.boxes.forEach(b => {
            if (b.selected) {
                b.x += diffX;
                b.y += diffY;
            }
        });
    } else {
        this.targetBox.x = finalX;
        this.targetBox.y = finalY;
    }
  }

  // ============================================
  // 6. LIFECYCLE CLEANUP
  // ============================================

  /** Safely terminates tracking operations and commits active states to the timeline history. */
  stopInteraction(): void {
    if (this.isResizing && this.targetBox) {
        if (this.targetBox.type === 'text' && this.targetBox.fontSize) {
            this.tools.setTextStyle('fontSize', this.targetBox.fontSize);
            this.tools.defaultTextWidth = this.targetBox.width;
        }
    }
    
    this.isRotating = false;
    this.isResizing = false;
    this.isPanning = false;
    this.isDraggingBox = false;
    this.targetBox = null;
  }
}
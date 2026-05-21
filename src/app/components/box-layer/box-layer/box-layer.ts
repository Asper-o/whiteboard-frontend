// src/app/components/box-layer.component.ts

import { Component, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { map, Observable, startWith } from 'rxjs';
import { Box } from '../../../models/box/box.model';
import { BoardStateService } from '../../../services/board-state/board-state';
import { Transform } from '../../../services/transform/transform';
import { ToolState } from '../../../services/tool-state/tool-state';
import { Drawing } from '../../../services/drawing/drawing';

/**
 * BoxLayer renders and manages interactive canvas elements (text, vectors, shapes, images).
 * Orchestrates viewport spatial transformations, element-relative scaling/rotations,
 * and high-performance layout calculations.
 */
@Component({
  selector: 'app-box-layer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './box-layer.html',
  styleUrls: ['./box-layer.css']
})
export class BoxLayer {
  /** Timestamp record used to calculate double-tap durations. */
  private lastClickTime = 0;
  
  /** Stores client interaction starting points during input operations. */
  private startPos = { x: 0, y: 0 };
  
  /** Tracks the previously interacted canvas item signature to distinguish selection intent. */
  private lastClickId: string | number | null = null;
  
  /** Reactive stream streaming active graphic elements from the centralized board pipeline. */
  readonly boxes$: Observable<Box[]>;

  constructor(
    public boardState: BoardStateService,
    private transform: Transform,
    private elementRef: ElementRef,
    public tools: ToolState,
    public drawing: Drawing
  ) { 
    this.boxes$ = this.boardState.updates$.pipe(
      startWith(0), 
      map(() => this.boardState.board.boxes)
    );
  }

  /**
   * Generates CSS matrix-equivalent string transformations to position the global coordinate map view.
   */
  getGlobalTransform(): string {
    const b = this.boardState.board;
    return `translate(${b.canvasX}px, ${b.canvasY}px) scale(${b.scale})`;
  }

  /**
   * Computes localized item transform strings using translate3d to leverage 
   * hardware-accelerated GPU rasterization.
   */
  getBoxTransform(box: Box): string {
    return `translate3d(${box.x}px, ${box.y}px, 0) rotate(${box.rotate}deg)`;
  }

  /**
   * Main pointer event dispatcher checking spatial raycasts, 
   * operation restrictions, edit mode assertions, and structural canvas selections.
   */
  handleDown(e: PointerEvent, box: Box): void {
    // 1. BOUNDARY LOGIC: Assign page context within fixed layout limits
    if (this.boardState.board.pageConfig.type === 'fixed') {
      const pages = this.boardState.board.pages || [];
      const clickedPage = pages.find((p: any) => 
        box.x >= p.x && box.x <= p.x + p.width && 
        box.y >= p.y && box.y <= p.y + p.height
      );
      
      if (clickedPage && this.boardState.board.activePageId !== clickedPage.id) {
        this.boardState.board.activePageId = clickedPage.id;
        this.boardState.notifyChange();
      }
    }
    
    // ==========================================================
    // 2. SMART SELECTION (X-RAY VISION RAYCAST ALGORITHM) 🧠
    // ==========================================================
    // Converts screenspace mouse coordinates into absolute 2D vector space coordinates
    const worldPos = this.transform.toWorld(e.clientX, e.clientY);

    // Filter structural items whose 2D AABB intersect with pointer locations
    const candidates = this.boardState.board.boxes.filter(b => 
      worldPos.x >= b.x && worldPos.x <= b.x + b.width &&
      worldPos.y >= b.y && worldPos.y <= b.y + b.height
    );

    // If shapes overlap, sort by surface area parameters to prioritize tiny details over large blocks
    if (candidates.length > 0) {
      candidates.sort((a, b) => (a.width * a.height) - (b.width * b.height));
      box = candidates[0]; // Intercept target assignment
    }

    // 3. BRUSH OVERRIDE FILTER
    if (this.tools.tool === 'pen') {
      if (['text', 'drawing', 'shape', 'image'].includes(box.type)) return;
    }

    // 4. ACTIVE FORM SUBMISSION INTEGRITY INTERCEPT
    if (box.editing) {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'textarea') return; 

      this.boardState.finishEditing();
      this.lastClickTime = 0; 
      this.lastClickId = null;
      return;
    }
    this.startPos = { x: e.clientX, y: e.clientY };

    // 5. DOUBLE CLICK ASSESMENT ROUTER
    const now = Date.now();
    const isTimeDouble = (now - this.lastClickTime < 300);
    const isSameBox = (this.lastClickId === box.id);
    
    this.lastClickTime = now;
    this.lastClickId = box.id;
    const isDouble = isTimeDouble && isSameBox;

    if (isDouble) {
      e.stopPropagation();
      e.preventDefault(); 

      if (box.selected) {
        const selectedCount = this.boardState.board.boxes.filter(b => b.selected).length;
        if (selectedCount > 1) {
          this.boardState.toggleBoxSelection(box);
        } else {
          this.enterEditing(box);
        }
      } else {
        this.boardState.addBoxToSelection(box);
        this.transform.startDragBox(box, e); 
      }
      return;
    }

    // 6. SINGLE TARGET RESOLUTION
    if (box.selected) {
      e.stopPropagation();
      e.preventDefault();
      this.transform.startDragBox(box, e);
    } else {
      e.stopPropagation();
      e.preventDefault();
      this.transform.startPan(e); // Fallback to canvas navigation
    }
  }

  /**
   * Clears state modifiers upon pointer release and updates matrix geometry data structures.
   */
  handleUp(e: PointerEvent, box: Box): void {
    if (box.editing) return;
    if (this.transform.isResizing) this.syncDimensions(box);
    this.transform.stopInteraction();
  }

  /* Interaction passthrough bindings mapped from DOM template entry hooks */
  onBoxDown(e: PointerEvent, box: Box): void { this.handleDown(e, box); }
  onTextDown(e: PointerEvent, box: Box): void { this.handleDown(e, box); }
  onBoxUp(e: PointerEvent, box: Box): void { this.handleUp(e, box); }
  onTextUp(e: PointerEvent, box: Box): void { this.handleUp(e, box); }

  /**
   * Programmatically recalibrates the layout heights of active inputs using scroll parameters
   * to eliminate text clipping bugs.
   */
  autoGrow(box: Box, event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    const newHeight = textarea.scrollHeight;
    textarea.style.height = `${newHeight}px`;
    box.height = newHeight;
  }

  /**
   * Captures modified layout metrics directly from real viewport pixel allocations
   * and saves them back to persistent tracking states.
   */
  syncDimensions(box: Box): void {
    const el = document.getElementById(`box-${box.id}`);
    if (el) {
      box.height = el.offsetHeight;
      box.width = el.offsetWidth;
    }
  }

  /** Initializes matrix bounding box sizing transformations via user handle controls. */
  onResizeDown(e: PointerEvent, box: Box): void {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    this.transform.startResize(box, e);
  }

  /** Attaches vector rotation tracking matrices onto active reference nodes. */
  onRotateDown(e: PointerEvent, box: Box): void {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    this.transform.startRotate(box, e);
  }

  /** Sets internal flags to mount editor user inputs and forces focus arrays. */
  enterEditing(box: Box): void {
    box.editing = true;
    setTimeout(() => {
      const boxEl = document.getElementById(`box-${box.id}`);
      const textarea = boxEl?.querySelector('textarea');
      
      if (textarea) {
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }, 0);
  }

  /** Closes input forms and saves modified textual strings. */
  finishEditing(box: Box): void {
    this.boardState.finishEditing();
  }
  
  /** Directive tracking optimizer hook used to restrict DOM loop operations. */
  trackByBoxId(index: number, box: Box): string | number {
    return box.id;
  }

  /**
   * Formats structural vectors into standard scalar markup path definitions.
   */
  getSvgPath(points: {x: number, y: number}[] | undefined, box?: Box): string {
    if (!points || !box) return '';
    return points.map((p, i) => {
      const x = p.x * box.width;
      const y = p.y * box.height;
      return (i === 0 ? 'M' : 'L') + ` ${x} ${y}`;
    }).join(' ');
  }
}
// src/app/components/canvas-layer.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map, Observable, startWith } from 'rxjs';
import { Path } from '../../../models/path/path.model';
import { BoardStateService } from '../../../services/board-state/board-state';
import { ToolState } from '../../../services/tool-state/tool-state';

/**
 * CanvasLayer is a dedicated, high-performance rendering engine for freehand SVG drawing paths.
 * It operates entirely on an RxJS reactive pipeline to ensure smooth 60fps rendering 
 * without triggering unnecessary Angular change detection cycles across the rest of the application.
 */
@Component({
  selector: 'app-canvas-layer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas-layer.html',
  styleUrls: ['./canvas-layer.css']
})
export class CanvasLayer {

  /** 
   * A reactive data stream that automatically pushes the latest drawing paths to the DOM.
   * Using an Observable with the 'async' pipe in HTML prevents memory leaks and boosts performance.
   */
  readonly paths$: Observable<Path[]>;

  constructor(
    public boardState: BoardStateService,
    public tools: ToolState
  ) {
    // Pipeline initialization: Listens to global board updates and extracts just the path data
    this.paths$ = this.boardState.updates$.pipe(
      startWith(0), // Forces an initial render payload on component mount
      map(() => this.boardState.board.paths)
    );
  }

  /**
   * Captures pointer interactions directly on individual SVG path elements.
   * Acts as a highly specific event interceptor for the Eraser tool to allow pixel-perfect deletion.
   * 
   * @param e The raw PointerEvent triggered by the user's mouse/stylus
   * @param path The specific structural Path data object being clicked
   */
  onPathClick(e: PointerEvent, path: Path): void {
    // Intercept interaction ONLY if the Eraser tool is active
    if (this.tools.tool === 'eraser') {
      e.stopPropagation(); // Block the click from hitting the background and triggering a pan
      e.preventDefault();
      
      this.boardState.deletePath(path.id);
    }
  }

  /**
   * Generates hardware-accelerated CSS transform strings to position the entire SVG layer.
   * This aligns the mathematical path coordinates with the user's current zoom and pan viewport.
   * 
   * @returns A formatted CSS transform directive (e.g., 'translate(X, Y) scale(Z)')
   */
  getTransform(): string {
    const b = this.boardState.board;
    return `translate(${b.canvasX}, ${b.canvasY}) scale(${b.scale})`;
  }

  /**
   * DOM Rendering Optimizer.
   * Forces Angular's rendering engine to track paths by their unique ID rather than their array index.
   * This is critical for performance; when a path is drawn or erased, Angular will only update 
   * that specific path in the DOM instead of destroying and recreating the entire SVG layer.
   * 
   * @param index The array index position of the path
   * @param path The path object being evaluated
   * @returns The unique identifier of the path
   */
  trackByPathId(index: number, path: Path): number | string {
    return path.id; 
  }
}
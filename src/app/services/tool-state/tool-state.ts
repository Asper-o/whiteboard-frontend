// src/app/services/tool-state.service.ts

import { Injectable } from '@angular/core';

/** Defines the core interaction profiles available to the user. */
export type ToolType = 'hand' | 'pen' | 'eraser';

/**
 * ToolState acts as the centralized configuration memory for user interaction profiles.
 * It tracks active cursors, manages a chromatic LRU (Least Recently Used) history cache, 
 * retains typography settings, and controls grid-snapping constraints.
 */
@Injectable({ providedIn: 'root' })
export class ToolState {
  
  // ============================================
  // CORE STATE PROPERTIES
  // ============================================
  
  /** The currently active viewport interaction cursor. */
  tool: ToolType = 'hand';
  /** Stroke thickness for the freehand vector brush. */
  penWidth: number = 3;
  /** Active hexadecimal color string applied to new strokes and shapes. */
  currentColor: string = '#000000'; 
  
  /** Flag allowing multiple items to be selected simultaneously. */
  isMultiSelectMode: boolean = false;
  /** Default pixel width assigned to newly instantiated text elements. */
  defaultTextWidth: number = 100;
  /** Toggles the mathematical coordinate snapping engine. */
  snapToGrid: boolean = false; 
  /** Dimensional size of the invisible snap-grid squares in pixels. */
  gridSize: number = 40;      

  /** 
   * LRU (Least Recently Used) Cache array tracking the last 10 colors the user engaged with.
   * Used to populate quick-select palettes in the UI.
   */
  colorHistory: string[] = ['#000000', '#ff0000', '#0000ff'];

  /** Persisted typography memory applied automatically to newly generated text boxes. */
  textStyle = {
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      fontSize: 16
  };

  // ============================================
  // TOOL MODIFIERS
  // ============================================

  /** Switches the global operational cursor profile. */
  setTool(tool: ToolType): void {
    this.tool = tool;
  }

  /** Toggles the ability to group select elements. */
  toggleMultiSelect(): void {
    this.isMultiSelectMode = !this.isMultiSelectMode;
  }

  /** Toggles the geometric constraint engine for element movement. */
  toggleSnap(): void {
    this.snapToGrid = !this.snapToGrid;
  }

  /**
   * Adjusts the stroke diameter of the drawing tools.
   * Enforces mathematical clamping to prevent invisible strokes or rendering blowouts.
   */
  setPenWidth(width: number): void {
    this.penWidth = Math.max(1, Math.min(50, width));
  }

  // ============================================
  // COLOR & HISTORY MANAGEMENT
  // ============================================

  /**
   * Updates the active chromatic profile.
   * Optionally registers the color to the LRU history cache and forces a workflow 
   * switch to the Pen tool to streamline user interaction.
   */
  setColor(color: string, saveToHistory: boolean = true): void {
    this.currentColor = color;
    
    if (saveToHistory) {
      this.addToHistory(color);
    }
    
    // UX Optimization: Auto-equip the drawing brush when selecting a color
    if (this.tool !== 'pen') {
      this.tool = 'pen';
    }
  }

  /**
   * Maintains an LRU (Least Recently Used) Stack of hexadecimal color strings.
   * Shifts new colors to the front, removes duplicates, and trims overflow beyond 10 items.
   */
  addToHistory(color: string): void {
    this.colorHistory = this.colorHistory.filter(c => c !== color);
    this.colorHistory.unshift(color);
    
    if (this.colorHistory.length > 10) {
      this.colorHistory.pop();
    }
  }

  /** Accessor resolving the active drawing color. */
  get currentColorString(): string {
    return this.currentColor;
  }

  // ============================================
  // TYPOGRAPHY CONFIGURATION
  // ============================================

  /**
   * Patches the typography configuration memory.
   * Ensures new text nodes inherit the styling the user was last working with.
   * 
   * @param key The specific CSS-style property to update (e.g., 'fontWeight')
   * @param value The value to assign to that property
   */
  setTextStyle(key: string, value: any): void {
      this.textStyle = { ...this.textStyle, [key]: value };
  }
}
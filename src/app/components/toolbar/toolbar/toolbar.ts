// src/app/components/toolbar/toolbar.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToolState } from '../../../services/tool-state/tool-state';
import { BoardStateService } from '../../../services/board-state/board-state';

/**
 * Interface contract defining structured web-safe typefaces for rendering dropdown overlays.
 */
interface FontOption {
  name: string;
  value: string;
}

/**
 * Toolbar manages global application tool states, element context controls,
 * and contextual text typography modifications for active canvas selections.
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: 'toolbar.html',
  styleUrls: ['toolbar.css']
})
export class Toolbar {

  /** Toggles the viewport visibility state of the font family selection popover drop menu. */
  isFontMenuOpen: boolean = false;

  /** Immutable array containing supported canvas font stacks mapped to safe fallbacks. */
  readonly fonts: FontOption[] = [
    { name: 'Arial', value: 'Arial, sans-serif' },
    { name: 'Verdana', value: 'Verdana, sans-serif' },
    { name: 'Times', value: "'Times New Roman', serif" },
    { name: 'Courier', value: "'Courier New', monospace" },
    { name: 'Script', value: "'Brush Script MT', cursive" },
    { name: 'Impact', value: 'Impact, sans-serif' },
    { name: 'Hindi / Marathi', value: 'Mangal, "Arial Unicode MS", sans-serif' },
    { name: 'Chinese (Simplified)', value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
    { name: 'Chinese (Traditional)', value: '"Microsoft JhengHei", "PingFang TC", sans-serif' },
    // Vietnamese uses Latin Extended. Tahoma renders its complex accents beautifully.
    { name: 'Vietnamese', value: 'Tahoma, Arial, sans-serif' }
  ];

  constructor(
    public tools: ToolState,
    public board: BoardStateService
  ) {}

  // ==========================================
  // 1. CORE APPLICATION TOOL CONTROLS
  // ==========================================

  /**
   * Updates the global workspace cursor action state. 
   * Mutates layout context automatically to force selection purges if switching modes.
   * 
   * @param tool Selected operational cursor focus profile string ('hand' | 'pen')
   */
  activateTool(tool: 'hand' | 'pen'): void {
    this.tools.setTool(tool);

    // Structural Isolation Safeguard: Force element deselection when activating freehand brushes
    if (tool === 'pen') {
      this.board.deselectAll();
      this.board.finishEditing();
    }
  }

  /**
   * Deletes all currently selected canvas elements from the active viewport tree.
   */
  deleteItems(): void {
    this.board.deleteSelected();
  }

  // ==========================================
  // 2. PALETTE & CHROMATIC HANDLERS
  // ==========================================

  /**
   * Realtime Input Intercept: Updates vector fill stroke preview styles without committing historical checkpoints.
   */
  onColorPreview(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.tools.setColor(input.value, false); 
  }

  /**
   * Final Input Handler: Commits structural color assignments directly to item configurations and history logs.
   */
  onColorCommit(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.tools.addToHistory(input.value);
  }

  // ==========================================
  // 3. CONTEXTUAL TYPOGRAPHY FILTERS & MENU GETTERS
  // ==========================================

  /**
   * Evaluates if contextual inline vector type tools should mount on the template workspace.
   * 
   * @returns boolean validation flag tracking text adjustments permissions
   */
  get showTextTools(): boolean {
    // Structural Guard: Freehand brush workflows immediately mask element configurations
    if (this.tools.tool === 'pen') {
      return false;
    }

    const box = this.board.board.activeBox;
    return !!(box && box.type === 'text');
  }

  /**
   * Computes the display name of the typeface currently assigned to the active context.
   */
  get currentFontName(): string {
    const activeFont = this.board.board.activeBox?.fontFamily || this.tools.textStyle.fontFamily;
    const found = this.fonts.find(f => f.value === activeFont);
    return found ? found.name : 'Arial';
  }

  /** Toggles the structural display layer status of the typography font menu. */
  toggleFontMenu(): void {
    this.isFontMenuOpen = !this.isFontMenuOpen;
  }

  /** Captures user selection events from custom drop lists to update font family parameters. */
  selectFont(fontValue: string): void {
    this.setFont(fontValue);
    this.isFontMenuOpen = false; 
  }

  /**
   * Sets the font family property across global tracking memory and targeted item nodes.
   */
  setFont(font: string): void {
    const box = this.board.board.activeBox;
    if (box && box.type === 'text') {
      box.fontFamily = font;
    }
    this.tools.setTextStyle('fontFamily', font);
  }

  // ==========================================
  // 4. TYPOGRAPHY INLINE ACTION MUTATORS
  // ==========================================

  /** Toggles font-weight properties between structural bold and regular rendering. */
  toggleBold(): void {
    const box = this.board.board.activeBox;
    const currentWeight = box?.fontWeight || this.tools.textStyle.fontWeight;
    const newWeight = (currentWeight === 'bold') ? 'normal' : 'bold';

    if (box && box.type === 'text') {
      box.fontWeight = newWeight;
    }
    this.tools.setTextStyle('fontWeight', newWeight);
  }

  /** Toggles text decoration style sheets between italic slants and regular layouts. */
  toggleItalic(): void {
    const box = this.board.board.activeBox;
    const currentStyle = box?.fontStyle || this.tools.textStyle.fontStyle;
    const newStyle = (currentStyle === 'italic') ? 'normal' : 'italic';

    if (box && box.type === 'text') {
      box.fontStyle = newStyle;
    }
    this.tools.setTextStyle('fontStyle', newStyle);
  }

  /** Toggles typography text decorations between continuous underlines and raw text lines. */
  toggleUnderline(): void {
    const box = this.board.board.activeBox;
    const currentDeco = box?.textDecoration || this.tools.textStyle.textDecoration;
    const newDeco = (currentDeco === 'underline') ? 'none' : 'underline';

    if (box && box.type === 'text') {
      box.textDecoration = newDeco;
    }
    this.tools.setTextStyle('textDecoration', newDeco);
  }

  /** Toggles between responsive relative auto-scaling typography and locked structural point values. */
  toggleFontMode(): void {
    const activeBox = this.board.board.activeBox;
    if (activeBox && activeBox.type === 'text') {
      activeBox.isFixedFont = !activeBox.isFixedFont;

      // Assign core fallback constraints to prevent breaking render scales
      if (activeBox.isFixedFont) {
        activeBox.fontSize = 16; 
      }
      if (activeBox.isFixedFont && !activeBox.fontSize) {
        activeBox.fontSize = 24; 
      }
      
      this.board.notifyChange();
      this.board.saveCheckpoint();
    }
  }

  /**
   * Modifies the text tracking font metric via scalar step variables.
   * Restricts sizing mutations within strict bounding values to block DOM canvas breaks.
   * 
   * @param delta Signed numerical scaling mutation indicator variable (e.g., +2 or -2)
   */
  changeFontSize(delta: number): void {
    const box = this.board.board.activeBox;
    if (box && box.type === 'text' && box.isFixedFont) {
      let currentSize = box.fontSize || 16;
      currentSize += delta;
      
      // Structural Constraint: Cap font sizing metrics to prevent rendering blowouts
      if (currentSize < 8) currentSize = 8;
      if (currentSize > 200) currentSize = 200;
      
      box.fontSize = currentSize;
      this.board.notifyChange();
      this.board.saveCheckpoint();
    }
  }
}
// src/app/services/board-state.service.ts

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Box } from '../../models/box/box.model';
import { Path } from '../../models/path/path.model';
import { ToolState } from '../tool-state/tool-state';

/** Defines the global spatial boundary rules for the workspace environment. */
export interface PageConfig {
  type: 'infinite' | 'fixed'; 
  width: number;
  height: number;
  name: string; 
}

/** Represents a localized artboard instance mapped to specific 2D world coordinates. */
export interface PageBounds {
  id: number;
  x: number;       
  y: number;       
  width: number;
  height: number;
}

/** 
 * The Root Application State Tree.
 * Acts as the strict "Single Source of Truth" containing all renderable entities, 
 * camera viewport metrics, and structural layout configurations.
 */
export interface Board {
  boxes: Box[];
  paths: Path[];
  pageConfig: { type: string, width: number, height: number, name: string };
  
  canvasX: number;
  canvasY: number;
  scale: number;
  
  activeBox: Box | null;
  selectedPaths: Path[];
  pages: PageBounds[];
  activePageId: number | null;
}

/**
 * BoardStateService acts as the centralized data management engine.
 * It enforces state immutability, orchestrates time-travel history tracking (Undo/Redo),
 * manages local persistence (Autosave), and calculates complex multi-page grid layouts.
 */
@Injectable({ providedIn: 'root' })
export class BoardStateService {
  
  /** Multicast stream acting as the primary render pulse for all subscriber layers. */
  public updates$ = new Subject<void>();
  
  /** The live, mutated state object. */
  board: Board = {
    boxes: [],
    paths: [],
    pageConfig: { type: 'infinite', width: 0, height: 0, name: 'Infinite' },
    canvasX: 0,
    canvasY: 0,
    scale: 1,
    activeBox: null,
    selectedPaths: [],
    pages: [],
    activePageId: null, 
  };

  /** Memory stack containing serialized JSON checkpoints for chronological restoration. */
  private historyStack: string[] = [];
  /** Pointer tracking the current active timeline state. */
  private historyIndex = 0; 
  /** Maximum structural depth limit for the timeline array to prevent memory leaks. */
  private maxHistory = 50;

  constructor(private tools: ToolState) {
    this.historyStack.push(this.createSnapshot());
  }

  // ============================================
  // 1. CORE SERIALIZATION & HISTORY
  // ============================================

  /**
   * Serializes the active structural tree into a compressed string payload.
   * Purges ephemeral UI flags (selections, edit modes) and empty text nodes 
   * to optimize chronological memory storage footprints.
   */
  private createSnapshot(): string {
    const validBoxes = this.board.boxes.filter(b => {
        if (b.type === 'text' && b.editing && !b.text.trim()) return false;
        return true;
    });

    const cleanBoxes = validBoxes.map(b => ({
        ...b,
        selected: false,
        editing: false
    }));
    
    const cleanPaths = this.board.paths.map(p => ({
        ...p,
        selected: false
    }));

    return JSON.stringify({
      boxes: cleanBoxes,
      paths: cleanPaths
    });
  }

  /** Wipes the timeline tracking memory arrays entirely. */
  public clearHistory(): void {
      this.historyStack = [];
      this.historyIndex = -1; 
  }

  /**
   * Commits the active state into the memory timeline.
   * Evaluates structural equality to prevent duplicate save spamming, enforces 
   * branch truncation on new edits during an undo state, and triggers physical local storage.
   */
  saveCheckpoint(): void {
    const newSnapshot = this.createSnapshot();
    const currentSnapshot = this.historyStack[this.historyIndex];

    if (newSnapshot === currentSnapshot) return;

    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
    }

    this.historyStack.push(newSnapshot);
    this.historyIndex++;
    
    console.log(`✅ History Saved! (Index: ${this.historyIndex})`);

    if (this.historyStack.length > this.maxHistory) {
      this.historyStack.shift();
      this.historyIndex--;
    }

    try {
      localStorage.setItem('whiteboard_autosave', JSON.stringify(this.board));
    } catch (e) {
      console.warn("Local storage full or disabled", e);
    }
  }

  /** Reverts the application state backward along the structural timeline array. */
  undo(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--; 
      this.restoreSnapshot(this.historyStack[this.historyIndex]);
    }
  }

  /** Reapplies truncated future application states along the structural timeline array. */
  redo(): void {
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyIndex++;
      this.restoreSnapshot(this.historyStack[this.historyIndex]);
    }
  }

  /** Private helper executing the memory payload overwrite against the live board tree. */
  private restoreSnapshot(jsonString: string): void {
     const data = JSON.parse(jsonString);
     
     this.board = {
        ...this.board,       
        boxes: data.boxes, 
        paths: data.paths,    
        activeBox: null,     
        selectedPaths: []    
     };

     this.notifyChange();
  }

  // ============================================
  // 2. LAYOUT & GRID ARCHITECTURE
  // ============================================

  /**
   * Calculates boundaries and toggles rendering modes between limitless canvas space 
   * and strict physical paper emulation targets.
   * 
   * @param name The human-readable preset layout identifier
   */
  setPageFormat(name: string): void {
      let width = 0;
      let height = 0;
      let type: 'infinite' | 'fixed' = 'fixed';

      if (this.board.pages.length === 0) {
            const firstPage = {
                id: Date.now(),
                x: 0, 
                y: 0, 
                width: width,
                height: height
            };
            this.board.pages = [firstPage];
            this.board.activePageId = firstPage.id;
        }

      switch (name) {
          case 'A4': width = 794; height = 1123; break;
          case 'A3': width = 1123; height = 1587; break;
          case '16:9': width = 1920; height = 1080; break;
          case 'Square': width = 1080; height = 1080; break;
          case 'Infinite': type = 'infinite'; break;
      }

      this.board.pageConfig = { type, width, height, name };

      if (type === 'fixed') {
          if (!this.board.pages) this.board.pages = [];

          if (this.board.pages.length === 0) {
              const firstPage = {
                  id: Date.now(),
                  x: -width / 2, 
                  y: -height / 2,
                  width: width,
                  height: height
              };
              this.board.pages = [firstPage];
              this.board.activePageId = firstPage.id;
          } else {
              this.board.pages.forEach(p => {
                  p.width = width;
                  p.height = height;
              });
          }
      } else {
          this.board.pages = [];
          this.board.activePageId = null;
      }

      this.notifyChange();
      this.saveCheckpoint(); 
  }

  /**
   * Executes a mathematical matrix algorithm to append physical pages within 
   * defined spatial columns, utilizing automated coordinate offsets.
   */
  addPageToGrid(): void {
      const config = this.board.pageConfig;
      if (config.type === 'infinite') return;

      const pages = this.board.pages || [];
      const newIndex = pages.length;

      const columns = 6; 
      const gap = 100;  

      const col = newIndex % columns;
      const row = Math.floor(newIndex / columns);

      const x = col * (config.width + gap);
      const y = row * (config.height + gap);

      const newPage = {
          id: Date.now(),
          x: x,
          y: y,
          width: config.width,
          height: config.height
      };

      this.board.pages = [...pages, newPage];
      this.board.activePageId = newPage.id;
      this.saveCheckpoint();
  }

  /** Resolves the layout limits of the currently engaged artboard. */
  getActivePage(): PageBounds | null {
    if (this.board.pageConfig.type === 'infinite') return null;
    return this.board.pages.find(p => p.id === this.board.activePageId) || null;
  }

  /** Destroys the final page block array entry and refocuses the active target pointer. */
  removeLastPage(): void {
      if (!this.board.pages || this.board.pages.length <= 1) return;

      this.board.pages.pop();

      const newLastPage = this.board.pages[this.board.pages.length - 1];
      this.board.activePageId = newLastPage.id;

      this.notifyChange();
      this.saveCheckpoint(); 
  }

  // ============================================
  // 3. ENTITY & SELECTION ENGINES
  // ============================================

  /**
   * Instantiates a dynamic vector element aligned to the world coordinate grid.
   */
  createBox(x: number, y: number): void {
    const newBox: Box = {
      id: Date.now(),
      x: x - 50, 
      y: y - 25, 
      height: 25,
      rotate: 0,
      text: '',
      type: 'text',
      selected: true,
      editing: true, 
      fontSize: this.tools.textStyle.fontSize,
      fontFamily: this.tools.textStyle.fontFamily,
      fontWeight: this.tools.textStyle.fontWeight as any,
      fontStyle: this.tools.textStyle.fontStyle as any,
      textDecoration: this.tools.textStyle.textDecoration as any,
      width: this.tools.defaultTextWidth,
      strokeWidth: this.tools.penWidth,
    };

    this.deselectAll();
    this.board.boxes.push(newBox);
    this.board.activeBox = newBox;
    this.notifyChange();
  }

  /** Forces exclusive selection priority onto a designated structural item. */
  selectBox(box: Box): void {
    this.deselectAll();
    box.selected = true;
    this.board.activeBox = box;
    this.notifyChange();
  }

  /** Safely appends an element to the active memory selection stack. */
  addBoxToSelection(box: Box): void {
    if (box.selected) return;
    box.selected = true;
    this.board.activeBox = box; 
    this.notifyChange();
  }

  /** Reverses the current selection profile mapping of a specific element node. */
  toggleBoxSelection(box: Box): void {
    box.selected = !box.selected;
    
    if (box.selected) {
      this.board.activeBox = box;
    } else {
     if (this.board.activeBox?.id === box.id) {
         this.board.activeBox = this.board.boxes.find(b => b.selected) || null;
      }
    }
    this.notifyChange();
  }

  /** Integrates a fully formed SVG drawing string trace into the persistence layout map. */
  addPath(path: Path): void {
    this.board.paths.push(path);
  }

  /** Executes an area-based raycast sorting function resolving nested element collision limits. */
  getBoxAt(x: number, y: number): Box | null {
    const candidates = this.board.boxes.filter(b => 
      x >= b.x && x <= b.x + b.width &&
      y >= b.y && y <= b.y + b.height
    );

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        return areaA - areaB;
    });

    return candidates[0];
  }

  /** Broadcaster terminating focus mappings across the entire application interface. */
  deselectAll(): void {
    let changed = false;
    this.board.boxes.forEach(b => {
      if(b.selected || b.editing) changed = true;
      b.selected = false;
      b.editing = false;
    });
    this.board.activeBox = null;

    this.board.paths.forEach(p => p.selected = false);
    this.board.selectedPaths = [];
    if (changed) this.notifyChange();
  }

  /** Safety accessor verifying valid active selections prior to firing deletion tasks. */
  get hasSelection(): boolean {
    return this.board.boxes.some(b => b.selected);
  }

  /** Erases active component nodes and forces a pipeline rendering cycle alert. */
  deleteSelected(): void {
    const initialCount = this.board.boxes.length;
    this.board.boxes = this.board.boxes.filter(b => !b.selected);
    this.board.activeBox = null;

    if (this.board.boxes.length !== initialCount) {
      this.notifyChange();
      this.saveCheckpoint();
    }
  }

  /** Clears precise SVG vector structures via unique identifier queries. */
  deletePath(pathId: number): void { 
    const initialCount = this.board.paths.length;
    this.board.paths = this.board.paths.filter(p => p.id !== pathId);
    
    if (this.board.paths.length !== initialCount) {
        this.notifyChange();
    }
  }

  /** Safely closes dynamic template inputs and verifies layout text integrity. */
  finishEditing(): void {
    const active = this.board.activeBox;
    if (active && active.editing) {
      active.editing = false;
      
      if (active.type === 'text' && !active.text.trim()) {
        this.deleteSelected(); 
      } else {
        this.saveCheckpoint();
      }
    }
  }

  // ============================================
  // 4. STORAGE & SIGNAL EMITTERS
  // ============================================

  /** Triggers the reactive RxJS pipeline forcing components to update visually. */
  notifyChange(): void {
    this.updates$.next();
  }

  /**
   * Initializes application environment by unpacking deep browser storage data.
   * Ensures history trees are forcibly overwritten to prevent rollback corruptions.
   */
  loadAutosave(): boolean {
      const savedData = localStorage.getItem('whiteboard_autosave');
      if (savedData) {
          try {
              this.board = JSON.parse(savedData);
              this.historyStack = [JSON.parse(JSON.stringify(this.board))];
              this.historyIndex = 0;

              this.notifyChange();
              return true; 
          } catch (e) {
              console.error("Failed to parse autosave", e);
              return false;
          }
      }
      return false; 
  }

  /** Overrides the active state with a cloud-provided layout payload sequence. */
  loadNewState(newData: Board): void {
    this.deselectAll();
    this.board = {
        ...newData,
        activeBox: null,
        selectedPaths: [] 
    };
    this.notifyChange();
  }

  /** 
   * Complete destructive wipe of active structural states, local browser caches, 
   * and functional history timelines.
   */
  resetBoard(): void {
      localStorage.removeItem('whiteboard_autosave');
      
      this.board.boxes = [];
      this.board.paths = [];
      this.board.pages = [];
      this.board.activeBox = null;
      this.board.activePageId = null;
      this.board.canvasX = window.innerWidth / 2;
      this.board.canvasY = window.innerHeight / 2;
      this.board.scale = 1;
      
      this.historyStack = []; 
      this.historyIndex = -1; 

      if (this.board.pageConfig.type === 'fixed') {
          this.setPageFormat(this.board.pageConfig.name);
      } else {
          this.notifyChange();
          this.saveCheckpoint();
      }
  }
}
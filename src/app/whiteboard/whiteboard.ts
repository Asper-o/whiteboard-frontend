// src/app/whiteboard.component.ts

import { Component, HostListener, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime } from 'rxjs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Components & Services
import { BoxLayer } from '../components/box-layer/box-layer/box-layer';
import { CanvasLayer } from '../components/canvas-layer/canvas-layer/canvas-layer';
import { Toolbar } from '../components/toolbar/toolbar/toolbar';
import { Board, BoardStateService, PageBounds } from '../services/board-state/board-state';
import { Drawing } from '../services/drawing/drawing';
import { ToolState } from '../services/tool-state/tool-state';
import { Transform } from '../services/transform/transform';
import { StorageService } from '../services/Storage/storage';
import { AuthService } from '../auth/service/auth-service';
import { CanvasDTO, canvasService } from '../services/Canvas/canvasDTO';
/**
 * The Root Whiteboard Orchestrator.
 * Acts as the primary controller binding the DOM interface to the mathematical,
 * state, and persistence services. Manages gesture routing, keyboard shortcuts,
 * and high-level file operations (PDF Export, JSON serialization).
 */
@Component({
  selector: 'app-whiteboard',
  standalone: true,
  imports: [CommonModule, CanvasLayer, BoxLayer, Toolbar, FormsModule],
  templateUrl: './whiteboard.html',
  styleUrl: './whiteboard.css',
  encapsulation: ViewEncapsulation.None
})
export class Whiteboard implements OnInit {

  // ==========================================
  // 1. STATE & PROPERTIES
  // ==========================================
  
  /** UI Flags controlling contextual menu popovers. */
  isUserMenuOpen: boolean = false;
  showCanvasMenu: boolean = false;
  isMainMenuOpen: boolean = false;
  showPageMenu: boolean = false;
  
  /** Cloud persistence states. */
  isLoggedIn: boolean = false;
  savedCanvases: CanvasDTO[] = [];
  currentCanvasId: string | null = null;
  currentCanvasName: string = 'Untitled Canvas';

  /** Debounce tracking to determine double-clicks vs single interactions. */
  private lastClickTime = 0;
  /** UI safety flag preventing accidental destructive page deletions. */
  private hasWarnedPageDelete = false;
  /** Registry of active touch points used to calculate multi-finger pinch gestures. */
  private activePointers: Map<number, {x: number, y: number}> = new Map();

  constructor(
    public board: BoardStateService,
    public tools: ToolState,
    public drawing: Drawing,
    public transform: Transform,
    public storage: StorageService,
    private authService: AuthService,
    private canvasService: canvasService,
    private router: Router
  ) {}

  // ==========================================
  // 2. LIFECYCLE
  // ==========================================

  ngOnInit(): void {
      const didLoad = this.board.loadAutosave();

      this.authService.isLoggedIn$.subscribe(status => {
        this.isLoggedIn = status;
        if (this.isLoggedIn) {
          this.loadCanvasList();
        }
      });

      // Background Worker: Debounced API calls to persist board state 
      // silently 1.5s after the user stops drawing.
      if (this.board.updates$) {
        this.board.updates$.pipe(
          debounceTime(1500) 
        ).subscribe(() => {
          this.saveCurrentCanvas(true); 
        });
      }

      if (!didLoad) {
          if (this.board.board.pageConfig.type === 'fixed') {
              if (!this.board.board.pages || this.board.board.pages.length === 0) {
                  this.setPage(this.board.board.pageConfig.name);
              }
          }
          this.board.saveCheckpoint();
      }
  }

  // ==========================================
  // 3. POINTER & INTERACTION EVENTS
  // ==========================================

  /**
   * Primary interaction router. Intercepts screen touches and clicks,
   * evaluates multi-touch pinch states, validates boundaries, and forwards
   * coordinate data to the appropriate interaction service (Drawing or Transforming).
   */
  onPointerDown(e: PointerEvent): void {
    this.activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

    // Delegate to Transform Service if multi-touch is detected
    if (this.activePointers.size === 2) {
       this.drawing.isDrawing = false;
       this.transform.stopInteraction(); 
       return; 
    }

    if (this.activePointers.size === 1) {
       const worldPos = this.transform.toWorld(e.clientX, e.clientY);
       let isOutside = false;

       // Spatial verification: Prevent drawing outside active paper bounds
       if (this.board.board.pageConfig.type === 'fixed') {
           const pages = this.board.board.pages || [];
           const clickedPage = pages.find((p: any) => 
               worldPos.x >= p.x && worldPos.x <= p.x + p.width && 
               worldPos.y >= p.y && worldPos.y <= p.y + p.height
           );

           if (clickedPage) {
               if (this.board.board.activePageId !== clickedPage.id) {
                   this.board.board.activePageId = clickedPage.id;
                   this.board.notifyChange();
               }
               isOutside = false; 
           } else {
               isOutside = true; 
           }
       }

       this.board.finishEditing();
       const now = Date.now();

       // Implicit Object Generation: Double tap empty space to spawn text box
       if (now - this.lastClickTime < 300 && this.tools.tool === 'hand') {
         if (isOutside) return; 
         this.board.createBox(worldPos.x, worldPos.y);
         return;
       }
       
       this.lastClickTime = now;
       this.board.deselectAll();

       // Tool Execution Routing
       if (this.tools.tool === 'pen') {
         if (isOutside) return; 
         this.drawing.startPath(e);
       } else {
         const clickedBox = this.board.getBoxAt(worldPos.x, worldPos.y);
         if (clickedBox) {
             this.board.selectBox(clickedBox);
             return; 
         }
         this.transform.startPan(e);
       }
    }
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(e: PointerEvent): void {
    this.activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

    if (this.activePointers.size === 2) {
       const points = Array.from(this.activePointers.values());
       this.transform.handlePinch(points[0], points[1]);
       return; 
    }

    if (this.drawing.isDrawing) {
      this.drawing.addPoint(e);
      return;
    }

    if (this.transform.isRotating) {
       this.transform.rotate(e); 
    } else if (this.transform.isResizing) {
       this.transform.resize(e);
    } else if (this.transform.isDraggingBox) {
       this.transform.dragBox(e);
    } else if (this.transform.isPanning) {
      this.transform.pan(e);
    }
  }

  @HostListener('document:pointerup', ['$event'])
  onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size < 2) {
       this.transform.endPinch();
    }
    if (this.activePointers.size === 1 && this.tools.tool === 'hand') {
       this.transform.stopInteraction();
    }

    try {
      (e.target as Element)?.releasePointerCapture(e.pointerId);
    } catch {}

    this.drawing.finishPath();
    this.transform.stopInteraction(); 
    this.board.saveCheckpoint();
  }

  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    // Prevent default browser scroll mapping to preserve infinite canvas pan/zoom logic
    e.preventDefault();
    this.transform.zoom(e.deltaY, e.clientX, e.clientY);
  }

  // ==========================================
  // 4. KEYBOARD & INPUT EVENTS
  // ==========================================

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'h' || e.code === 'Space') this.tools.setTool('hand');
    if (e.key === 'p') this.tools.setTool('pen');
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
       const active = this.board.board.activeBox;
       // Prevent deleting boxes while actively typing text
       if (!active || !active.editing) {
         this.board.deleteSelected();
       }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); 
        this.board.undo();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        this.board.redo();
        return;
    }
    
    if (e.key === 'Escape') this.board.deselectAll();
  }

  /**
   * Processes local file uploads, converts image buffers to Base64 data strings,
   * scales large resolutions to performant sizes, and mounts them to the canvas matrix.
   */
  handleImageUpload(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
        const src = e.target.result;
        const img = new Image();
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            const maxSize = 500; // Strict texture memory ceiling
            
            if (w > h && w > maxSize) {
                h = (h * maxSize) / w;
                w = maxSize;
            } else if (h > maxSize) {
                w = (w * maxSize) / h;
                h = maxSize;
            }

            const board = this.board.board;
            const centerX = (window.innerWidth / 2 - board.canvasX) / board.scale;
            const centerY = (window.innerHeight / 2 - board.canvasY) / board.scale;

            const imageBox: any = { 
                id: Date.now(),
                type: 'image',
                src: src,
                x: centerX - (w / 2),
                y: centerY - (h / 2),
                width: w, 
                height: h,
                rotate: 0,
                selected: true,
                editing: false
            };

            this.board.board.boxes.push(imageBox);
            this.board.selectBox(imageBox);
            this.board.saveCheckpoint();
        };
        img.src = src;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  // ==========================================
  // 5. PAGE MANAGEMENT
  // ==========================================

  setPage(format: string): void {
      this.board.setPageFormat(format);
      this.showPageMenu = false; 
      
      if (format !== 'Infinite') {
          const config = this.board.board.pageConfig;
          const scale = 0.8;
          
          this.board.board.canvasX = (window.innerWidth / 2) - ((config.width / 2) * scale);
          this.board.board.canvasY = (window.innerHeight / 2) - ((config.height / 2) * scale);
          this.board.board.scale = scale;
          this.board.notifyChange();
      }
  }

  addPage(): void {
      this.board.addPageToGrid();
      const pages = this.board.board.pages;
      if (!pages || pages.length === 0) return;
      
      const newPage = pages[pages.length - 1]; 
      const scale = this.board.board.scale;

      this.board.board.canvasX = (window.innerWidth / 2) - ((newPage.x + (newPage.width / 2)) * scale);
      this.board.board.canvasY = (window.innerHeight / 2) - ((newPage.y + (newPage.height / 2)) * scale);
      this.board.notifyChange();
  }

  removePage(): void {
      if (!this.hasWarnedPageDelete) {
          const isSure = confirm("Are you sure you want to remove the last page? Any drawings left outside the remaining pages may be lost.\n\n(This warning will not show again until you refresh).");
          if (!isSure) return; 
          this.hasWarnedPageDelete = true; 
      }

      this.board.removeLastPage();
      const pages = this.board.board.pages;
      if (!pages || pages.length === 0) return;
      
      const lastPage = pages[pages.length - 1];
      const scale = this.board.board.scale;

      this.board.board.canvasX = (window.innerWidth / 2) - ((lastPage.x + (lastPage.width / 2)) * scale);
      this.board.board.canvasY = (window.innerHeight / 2) - ((lastPage.y + (lastPage.height / 2)) * scale);
      this.board.notifyChange();
  }

  setActivePage(pageId: number): void {
      this.board.board.activePageId = pageId;
      this.board.notifyChange();
  }

  /**
   * Generates a dynamic CSS geometric mask to hide strokes drawn outside 
   * the designated boundaries of the active physical paper format.
   */
  getClipPath(): string {
    const config = this.board.board.pageConfig;
    if (config.type === 'infinite') return 'none';

    const pages = this.board.board.pages || [];
    const activePage = pages.find((p: any) => p.id === this.board.board.activePageId);
    if (!activePage) return 'none';

    const { canvasX, canvasY, scale } = this.board.board;
    const screenLeft = (activePage.x * scale) + canvasX;
    const screenTop = (activePage.y * scale) + canvasY;
    const screenWidth = activePage.width * scale;
    const screenHeight = activePage.height * scale;

    const rightInset = window.innerWidth - (screenLeft + screenWidth);
    const bottomInset = window.innerHeight - (screenTop + screenHeight);

    return `inset(${screenTop}px ${rightInset}px ${bottomInset}px ${screenLeft}px)`;
  }

  // ==========================================
  // 6. CANVAS SAVE / LOAD (CLOUD DATABASE)
  // ==========================================

  createNewCanvas(): void {
    const name = prompt('Enter a name for your new canvas:', 'New Canvas');
    if (!name) return; 

    this.board.resetBoard(); 
    
    const newCanvas = {
      name: name,
      data: '', 
    };

    this.canvasService.createCanvas(newCanvas).subscribe({
      next: (savedCanvasFromDB) => {
        this.savedCanvases.push(savedCanvasFromDB);
        this.currentCanvasId = savedCanvasFromDB.id || null;
        this.currentCanvasName = savedCanvasFromDB.name;
        this.toggleCanvasMenu(); 
      },
      error: (err) => console.error("Failed to create canvas in DB", err)
    });
  }

  saveCurrentCanvas(isSilent: boolean = false): void {
    if (!this.isLoggedIn || !this.currentCanvasId) {
      if (!isSilent) alert("Please log in and select a canvas to save!");
      return;
    }

    const index = this.savedCanvases.findIndex(c => c.id === this.currentCanvasId);
    if (index > -1) {
      const cleanData = {
        ...this.board.board,
        boxes: [...this.board.board.boxes], 
        paths: [...this.board.board.paths],
        pages: [...this.board.board.pages],
        pageConfig: { ...this.board.board.pageConfig },
        activeBox: null,      
        selectedPaths: []     
      };

      const stringifiedData = JSON.stringify(cleanData);
      const canvasToUpdate = {
        name: this.currentCanvasName,
        data: stringifiedData
      };

      this.canvasService.updateCanvas(this.currentCanvasId, canvasToUpdate).subscribe({
        next: () => {
          this.savedCanvases[index].data = stringifiedData;
          this.savedCanvases[index].updatedAt = Date.now();
          if (!isSilent) console.log(`✅ Saved ${this.currentCanvasName} to Database manually!`);
        },
        error: (err) => {
          console.error("Failed to save to DB!", err);
          if (!isSilent) alert("Failed to save to database. Check connection.");
        }
      });
    }
  }

  loadCanvas(id?: string): void {
    if (!id) return;
    
    const canvasToLoad = this.savedCanvases.find(c => c.id === id);
    if (canvasToLoad) {
      this.currentCanvasId = canvasToLoad.id || null;
      this.currentCanvasName = canvasToLoad.name;
      
      if (canvasToLoad.data) {
        const parsedData = JSON.parse(canvasToLoad.data);
        
        this.board.board.boxes.length = 0;
        this.board.board.paths.length = 0;
        this.board.board.pages.length = 0;

        if (parsedData.boxes) this.board.board.boxes.push(...parsedData.boxes);
        if (parsedData.paths) this.board.board.paths.push(...parsedData.paths);
        if (parsedData.pages) this.board.board.pages.push(...parsedData.pages);
        if (parsedData.pageConfig) this.board.board.pageConfig = parsedData.pageConfig;
        
        this.board.board.activeBox = null;
        this.board.board.activePageId = null;
        this.board.board.canvasX = parsedData.canvasX || window.innerWidth / 2;
        this.board.board.canvasY = parsedData.canvasY || window.innerHeight / 2;
        this.board.board.scale = parsedData.scale || 1;

        this.board.clearHistory();
        if (this.board.notifyChange) this.board.notifyChange();
        if (this.board.updates$) this.board.updates$.next(); 
      } else {
        this.board.resetBoard(); 
      }
      
      this.isUserMenuOpen = false;
    }
  }

  loadCanvasList(): void {
    this.canvasService.getAllCanvases().subscribe({
      next: (canvases) => this.savedCanvases = canvases,
      error: (err) => console.error("Failed to load canvases from DB", err)
    });
  }

  // ==========================================
  // 7. FILE EXPORT / IMPORT
  // ==========================================

  saveProject(): void {
    this.storage.downloadBoard(this.board.board);
  }

  loadProject(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    this.storage.loadBoard(file).then((data: Board) => {
       this.board.loadNewState(data);
    }).catch((err: any) => {
       alert("Failed to load project: " + (err.message || err));
    });

    event.target.value = ''; 
  }

  /**
   * Async Viewport Renderer Engine.
   * Programmatically isolates individual multi-page blocks, moves the application camera
   * over them instantly, captures DOM raster buffers via html2canvas, and dynamically
   * stitches them into a multi-page PDF document.
   */
  async exportToPDF(): Promise<void> {
    if (this.board.board.pageConfig.type === 'infinite' || !this.board.board.pages.length) {
        alert("Please select a Page Format (like A4) first.");
        return;
    }

    const oldScale = this.board.board.scale;
    const oldX = this.board.board.canvasX;
    const oldY = this.board.board.canvasY;
    const oldActivePageId = this.board.board.activePageId;

    const selectedBoxIds = this.board.board.boxes
        .filter(b => b.selected)
        .map(b => b.id);

    this.board.deselectAll();
    
    const uiElements = document.querySelectorAll('app-toolbar, .file-controls, .undo-redo-controls, .recenter-btn, .delete-btn') as NodeListOf<HTMLElement>;
    uiElements.forEach(el => el.style.visibility = 'hidden');

    const flashlight = document.querySelector('.flashlight-grid') as HTMLElement;
    if (flashlight) flashlight.style.display = 'none';

    const pageSheets = document.querySelectorAll('.page-sheet') as NodeListOf<HTMLElement>;
    pageSheets.forEach(sheet => sheet.style.boxShadow = 'none');

    let pdf: jsPDF | null = null;

    try {
        const pages = this.board.board.pages;

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const padding = 40; 
            const scaleX = (window.innerWidth - padding) / page.width;
            const scaleY = (window.innerHeight - padding) / page.height;
            const fitScale = Math.min(scaleX, scaleY, 1); 

            this.board.board.scale = fitScale;
            this.board.board.canvasX = (window.innerWidth / 2) - ((page.x + page.width / 2) * fitScale);
            this.board.board.canvasY = (window.innerHeight / 2) - ((page.y + page.height / 2) * fitScale);
            this.board.board.activePageId = page.id; 
            this.board.notifyChange();

            await new Promise(resolve => setTimeout(resolve, 300));

            const screenW = page.width * fitScale;
            const screenH = page.height * fitScale;
            const rectLeft = (window.innerWidth / 2) - (screenW / 2);
            const rectTop = (window.innerHeight / 2) - (screenH / 2);

            const canvas = await html2canvas(document.body, {
                x: rectLeft,
                y: rectTop,
                width: screenW,
                height: screenH,
                scale: Math.min(3 / fitScale, 2),
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.8);
            const orientation = page.width > page.height ? 'l' : 'p';

            if (i === 0) {
                pdf = new jsPDF({
                    orientation: orientation,
                    unit: 'px',
                    format: [page.width, page.height],
                    compress: true
                });
            } else {
                pdf!.addPage([page.width, page.height], orientation);
            }
            
            pdf!.addImage(imgData, 'JPEG', 0, 0, page.width, page.height);
        }

        pdf!.save(`whiteboard-export-${Date.now()}.pdf`);

    } catch (err) {
        console.error("PDF Export Error:", err);
    } finally {
        uiElements.forEach(el => el.style.visibility = 'visible');
        if (flashlight) flashlight.style.display = '';
        pageSheets.forEach(sheet => sheet.style.boxShadow = '');

        this.board.board.scale = oldScale;
        this.board.board.canvasX = oldX;
        this.board.board.canvasY = oldY;
        this.board.board.activePageId = oldActivePageId;

        this.board.board.boxes.forEach(b => {
            if (selectedBoxIds.includes(b.id)) b.selected = true;
        });

        this.board.notifyChange();
    }
  }

  // ==========================================
  // 8. UTILITIES & UI TOGGLES
  // ==========================================

  clearBoard(): void {
    const isSure = confirm("Are you sure you want to clear the entire whiteboard? This cannot be undone.");
    if (isSure) {
        this.board.resetBoard();
    }
  }

  toggleMainMenu(): void {
    this.isMainMenuOpen = !this.isMainMenuOpen;
    if (this.isMainMenuOpen) {
      this.isUserMenuOpen = false;
      this.showCanvasMenu = false; 
    }
    if (!this.isMainMenuOpen) {
      this.showPageMenu = false; 
    }
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    if (this.isUserMenuOpen) {
      this.isMainMenuOpen = false;
      this.showPageMenu = false;
    }
    if (!this.isUserMenuOpen) {
      this.showCanvasMenu = false;
    }
  }

  toggleCanvasMenu(): void {
    this.showCanvasMenu = !this.showCanvasMenu;
  }

  togglePageMenu(): void {
      this.showPageMenu = !this.showPageMenu;
  }

  @HostListener('document:pointerdown')
  closeAllMenus(): void {
    this.isMainMenuOpen = false;
    this.showPageMenu = false;
    this.isUserMenuOpen = false;
    this.showCanvasMenu = false;
  }

  // ==========================================
  // 9. AUTH NAVIGATION
  // ==========================================

  handleLogin(): void {
    this.router.navigate(['/login']);
  }

  handleLogout(): void {
    this.authService.logout();
    this.isUserMenuOpen = false;
  }
}
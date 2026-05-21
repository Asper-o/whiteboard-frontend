// src/app/services/storage.service.ts

import { Injectable } from '@angular/core';
import { Board } from '../board-state/board-state';

/**
 * StorageService manages the local serialization and deserialization of the canvas environment.
 * It provides browser-native bridging to export structural state trees to physical JSON files,
 * and asynchronously unpack external files back into the application.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {

  // ==========================================
  // 1. SERIALIZATION & EXPORT
  // ==========================================

  /**
   * Packages the active canvas state into a downloadable JSON file.
   * Strips ephemeral UI flags (like active selections) to ensure a clean structural load in the future.
   * Utilizes Blob API to generate a temporary virtual file directly in the browser's memory.
   * 
   * @param boardData The raw state tree of the current canvas board
   */
  downloadBoard(boardData: Board): void {
    // 1. Clean the payload: Remove UI-specific states
    const cleanData = {
      ...boardData,
      activeBox: null,      
      selectedPaths: []     
    };

    // 2. Serialize to formatted JSON
    const jsonString = JSON.stringify(cleanData, null, 2); 

    // 3. Construct a virtual memory Blob
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // 4. Mount and trigger hidden anchor download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${Date.now()}.json`; 
    a.click();
    
    // 5. Memory Cleanup: Destroy the virtual URL to prevent memory leaks
    window.URL.revokeObjectURL(url);
  }

  // ==========================================
  // 2. DESERIALIZATION & IMPORT
  // ==========================================

  /**
   * Asynchronously reads and parses an external JSON file uploaded by the user.
   * Wraps the event-driven FileReader API inside a Promise for modern async/await consumption.
   * 
   * @param file The raw File object provided by a file input HTML element
   * @returns A Promise resolving to a validated Board data structure
   */
  loadBoard(file: File): Promise<Board> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        try {
          const json = JSON.parse(e.target.result);
          
          // Structural Integrity Check: Ensure the payload matches the expected schema
          if (!Array.isArray(json.boxes) || !Array.isArray(json.paths)) {
             throw new Error("Invalid Board File: Missing required arrays");
          }
          
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };

      reader.readAsText(file);
    });
  }
}
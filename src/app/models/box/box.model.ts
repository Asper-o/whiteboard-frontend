// src/app/models/box/box.model.ts

export interface Box {
  // --- Core Identity & Position ---
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;       // In degrees

  isFixedFont?: boolean;

  // --- Type definition ---
  type: 'text' | 'shape' | 'drawing' | 'image';
  src?: string;
  
  // --- Visuals ---
  color?: string;       // Hex code (Text color or Shape stroke)
  selected: boolean;    // Is the box currently selected (Blue outline)?

  // --- Specific to Text Boxes ---
  text: string;
  fontSize?: number;
  editing: boolean;     // Is the user currently typing inside?

  // --- Specific to Shapes ---
  shapeType?: 'circle' | 'rectangle' | 'line' | 'diamond';
  
  // --- Specific to Lines ---
  // true = Bottom-Left to Top-Right (/)
  // false/undefined = Top-Left to Bottom-Right (\)
  flip?: boolean;  
  
  drawPoints?: {x: number, y: number}[];
  strokeWidth?: number;


  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
}
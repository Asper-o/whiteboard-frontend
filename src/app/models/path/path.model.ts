export interface Path {
  id: number;
  d: string;
  color: string;
  width: number;

  shapeInfo?: {
    type: 'circle' | 'rectangle' | 'line';
    cx: number;
    cy: number;
    w: number;
    h: number;
    angle: number;
  };

  selected?: boolean;

  points: { x: number, y: number }[];
}

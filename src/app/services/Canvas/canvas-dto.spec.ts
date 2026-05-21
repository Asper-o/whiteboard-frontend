import { TestBed } from '@angular/core/testing';
import { canvasService } from './canvasDTO';

describe('CanvasDTO', () => {
  let service: canvasService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(canvasService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

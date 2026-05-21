import { TestBed } from '@angular/core/testing';

import { BoardStateService } from './board-state';

describe('BoardState', () => {
  let service: BoardStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BoardStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

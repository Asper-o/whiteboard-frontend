import { TestBed } from '@angular/core/testing';

import { ToolState } from './tool-state';

describe('ToolState', () => {
  let service: ToolState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToolState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

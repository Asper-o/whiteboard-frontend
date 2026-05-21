import { TestBed } from '@angular/core/testing';

import { Transform } from './transform';

describe('Transform', () => {
  let service: Transform;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Transform);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

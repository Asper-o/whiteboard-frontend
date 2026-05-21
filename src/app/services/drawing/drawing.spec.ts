import { TestBed } from '@angular/core/testing';
import { Drawing } from './drawing';


describe('Drawing', () => {
  let service: Drawing;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Drawing);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

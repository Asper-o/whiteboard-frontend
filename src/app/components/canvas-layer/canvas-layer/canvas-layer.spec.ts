import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CanvasLayer } from './canvas-layer';

describe('CanvasLayer', () => {
  let component: CanvasLayer;
  let fixture: ComponentFixture<CanvasLayer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CanvasLayer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CanvasLayer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

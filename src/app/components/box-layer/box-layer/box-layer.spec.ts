import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoxLayer } from './box-layer';

describe('BoxLayer', () => {
  let component: BoxLayer;
  let fixture: ComponentFixture<BoxLayer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoxLayer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoxLayer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

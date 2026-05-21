import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Whiteboard } from './whiteboard';

describe('Whiteboard', () => {
  let component: Whiteboard;
  let fixture: ComponentFixture<Whiteboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Whiteboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Whiteboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

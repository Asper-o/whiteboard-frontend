import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Whiteboard } from './whiteboard/whiteboard';
@Component({
  selector: 'app-root',
   standalone: true,
  // imports: [Whiteboard, RouterOutlet],
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('whiteboard-frontend');
}

// src/app/app.routes.ts

import { Routes } from '@angular/router';
import { Login } from './auth/components/login/login';
import { authGuard } from './auth/guard/auth-guard';
import { Whiteboard } from './whiteboard/whiteboard';

export const routes: Routes = [

  { path: '', redirectTo: 'whiteboard', pathMatch: 'full' },


  { path: 'login', component: Login },
  
  // Notice the canActivate array here! The Bouncer is now on duty.
  { path: 'whiteboard', component: Whiteboard, canActivate: [authGuard] },
  
  // If they type a random URL, send them to login
  { path: '**', redirectTo: 'login' } 
];
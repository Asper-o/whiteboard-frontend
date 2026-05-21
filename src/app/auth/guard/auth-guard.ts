// src/app/auth/auth.guard.ts

import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../service/auth-service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);

  if (authService.getAccessToken()) {
    return true;
  } 
  
  if (!authService.isGuest()) {
    authService.setGuestMode();
  }
  
  return true;
};
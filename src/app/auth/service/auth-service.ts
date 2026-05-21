// src/app/auth/service/auth-service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from '../model/auth.models';
import { environment } from '../../../environments/environment';

/**
 * AuthService coordinates core identity architecture including registration,
 * stateful JWT authentication, background token refresh handshakes, and guest routing flags.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  /** Base API target route mapped to the Spring Boot security filter chain. */
  private readonly API_URL = `${environment.apiUrl}/auth`; 

  /** Stateful source stream managing runtime user authentication visibility flags. */
  private loggedInSubject = new BehaviorSubject<boolean>(this.hasToken());
  
  /** Public observable stream letting UI layers reactively monitor authentication status shifts. */
  public isLoggedIn$ = this.loggedInSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ==========================================
  // 1. CORE AUTHENTICATION ACTIONS
  // ==========================================

  /**
   * Forwards registration records to the backend database.
   * Expects a un-jsonified raw text server response confirming record creation.
   * 
   * @param data Raw structural parameters for a new User registration profile
   */
  register(data: RegisterRequest): Observable<any> {
    return this.http.post(`${this.API_URL}/register`, data, { responseType: 'text' });
  }

  /**
   * Authenticates user credentials via security validation.
   * Intercepts successful payload responses to securely commit authorization 
   * access tokens in local storage cache memory.
   * 
   * @param data Form validation object containing email and password credentials
   */
  login(data: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, data).pipe(
      tap(response => {
        this.saveTokens(response);
        this.loggedInSubject.next(true);
      })
    );
  }

  /**
   * Dispatches a cryptographic handshake to replace an expired session token sequence.
   * 
   * @param refreshToken Currently stored long-lived validation refresh string token
   */
  refreshToken(refreshToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/refresh`, { refreshToken }).pipe(
      tap(response => {
        this.saveTokens(response);
      })
    );
  }

  /**
   * Destroys the current user authentication context. 
   * Dispatches a programmatic logout call to invalidate tokens on the Spring backend database, 
   * then purges all client cache remnants regardless of network request success.
   */
  logout(): void {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      this.http.post(`${this.API_URL}/logout`, { refreshToken }).subscribe({
        next: () => this.clearSession(),
        error: () => this.clearSession() // Fallback to immediate client clearance if server is unreachable
      });
    } else {
      this.clearSession();
    }
  }

  // ==========================================
  // 2. GUEST COMPATIBILITY ENGINE
  // ==========================================

  /**
   * Establishes a localized volatile guest identity layer.
   * Purges previous credential contexts to unlock sandbox canvas tools with minimal friction.
   */
  public setGuestMode(): void {
    this.clearSession();
    localStorage.setItem('guestMode', 'true');
  }

  /**
   * Validates if the runtime interface is operating under restricted sandbox access.
   * 
   * @returns boolean flag tracking temporary local preview context status
   */
  public isGuest(): boolean {
    return localStorage.getItem('guestMode') === 'true';
  }

  // ==========================================
  // 3. STORAGE & STATE UTILITIES
  // ==========================================

  /**
   * Reads local storage caches to determine if an access token signature exists.
   */
  private hasToken(): boolean {
    return !!localStorage.getItem('accessToken');
  }
  
  /**
   * Safe access query to read the operational JWT access string record.
   */
  public getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  /**
   * Safe access query to read the persistence validation handshake token.
   */
  public getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  /**
   * Commits refreshed JWT security signatures directly to low-level browser cache blocks.
   * Overrides previous sandbox properties to align active session state profiles.
   */
  private saveTokens(tokens: AuthResponse): void {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.removeItem('guestMode');
  }

  /**
   * Flushes browser token states to clear operational identities.
   * Broadcasts structural logging status parameters down to active structural pipeline receivers.
   */
  private clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('guestMode'); 
    this.loggedInSubject.next(false);
  }
}
// src/app/services/canvas/canvas.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../auth/service/auth-service';
import { environment } from '../../../environments/environment';

/**
 * Data Transfer Object mirroring the Spring Boot Backend Entity.
 * Contains the serialized JSON string of the infinite canvas workspace.
 */
export interface CanvasDTO {
  id?: string; 
  name: string;
  data: string; 
  updatedAt?: number;
}

/**
 * CanvasService acts as the primary CRUD bridge between the Angular frontend 
 * and the Spring Boot REST API for persisting user workspaces.
 */
@Injectable({
  providedIn: 'root'
})
export class canvasService {
  /** Target endpoint mapped to the Spring Boot Canvas Controller */
  private readonly API_URL = `${environment.apiUrl}/canvases`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  /**
   * Helper utility to dynamically construct authorization headers.
   * Ensures secure endpoints are accessed using the active session's JWT.
   */
  private getHeaders(): HttpHeaders {
    const token = this.authService.getAccessToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` 
    });
  }

  /** Retrieves a list of all saved workspaces belonging to the authenticated user. */
  getAllCanvases(): Observable<CanvasDTO[]> {
    return this.http.get<CanvasDTO[]>(this.API_URL, { headers: this.getHeaders() });
  }

  /** Pushes a new board state payload to the database to create a persistent record. */
  createCanvas(canvas: CanvasDTO): Observable<CanvasDTO> {
    return this.http.post<CanvasDTO>(this.API_URL, canvas, { headers: this.getHeaders() });
  }

  /** Overwrites an existing workspace record in the database using its unique identifier. */
  updateCanvas(id: string, canvas: CanvasDTO): Observable<CanvasDTO> {
    return this.http.put<CanvasDTO>(`${this.API_URL}/${id}`, canvas, { headers: this.getHeaders() });
  }

  /** Permanently destroys a workspace record on the remote server. */
  deleteCanvas(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, { headers: this.getHeaders() });
  }
}
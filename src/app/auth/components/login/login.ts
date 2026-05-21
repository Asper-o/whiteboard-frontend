// src/app/auth/login/login.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../service/auth-service';

/**
 * LoginComponent handles user authentication including Login, Registration, 
 * and Guest access. It manages reactive form validation and dynamic UI state switching.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  
  /** The reactive form instance managing user inputs and validation. */
  loginForm: FormGroup;
  
  /** Stores user-facing error messages returned from the API. */
  errorMessage: string = '';
  
  /** Controls the UI loading spinner state during asynchronous requests. */
  isLoading: boolean = false;
  
  /** Determines if the UI is currently in Login mode (true) or Register mode (false). */
  isLoginMode: boolean = true;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    // Initialize the form with required validators for email and password
    this.loginForm = this.fb.group({
      name: [''], // Dynamically required only during registration
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  /**
   * Toggles the form between Login and Registration mode.
   * Dynamically adds or removes the 'required' validator on the name field
   * depending on the active mode.
   */
  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    
    const nameControl = this.loginForm.get('name');
    if (!this.isLoginMode) {
      nameControl?.setValidators([Validators.required]);
    } else {
      nameControl?.clearValidators();
    }
    
    // Re-evaluates the form's validity after adding/removing validators
    nameControl?.updateValueAndValidity();
  }

  /**
   * Handles form submission. Routes the payload to either the Login or Register 
   * endpoint based on the current mode. On successful registration, it automatically 
   * attempts to log the user in using the provided credentials.
   */
  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    if (this.isLoginMode) {
      // ==========================================
      // LOGIN BRANCH
      // ==========================================
      this.authService.login(this.loginForm.value).subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/whiteboard']);
        },
        error: this.handleError.bind(this)
      });
    } else {
      // ==========================================
      // REGISTER BRANCH (Auto-Login Chain)
      // ==========================================
      this.authService.register(this.loginForm.value).subscribe({
        next: (response) => {
          console.log("Registration successful from backend:", response);
          
          const loginCredentials = { 
            email: this.loginForm.value.email, 
            password: this.loginForm.value.password 
          };

          // Seamlessly log the user in so they don't have to type credentials twice
          this.authService.login(loginCredentials).subscribe({
            next: () => {
              this.isLoading = false;
              this.router.navigate(['/whiteboard']); 
            },
            error: (err) => {
              // Failsafe: Registration worked, but auto-login failed
              this.isLoading = false;
              this.isLoginMode = true; 
              this.errorMessage = 'Account created successfully! Please sign in.';
            }
          });
        },
        error: this.handleError.bind(this)
      });
    }
  }

  /**
   * Standardized error handler that translates HTTP status codes into 
   * user-friendly error messages on the UI.
   * 
   * @param err The error response object from the HttpClient
   */
  handleError(err: HttpErrorResponse | any): void {
    this.isLoading = false;
    
    if (err.status === 401) {
      this.errorMessage = 'Invalid email or password';
    } else if (err.status === 409) {
      this.errorMessage = 'Email already exists';
    } else if (err.status === 429) {
      this.errorMessage = 'Too many attempts. Please wait 15 minutes.';
    } else {
      this.errorMessage = 'Server error. Please try again later.';
    }
  }

  /**
   * Bypasses the authentication requirement and sets a temporary session,
   * allowing the user to trial the whiteboard immediately.
   */
  continueAsGuest(): void {
    this.authService.setGuestMode();
    this.router.navigate(['/whiteboard']);
  }
}
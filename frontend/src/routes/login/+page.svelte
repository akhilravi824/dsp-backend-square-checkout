<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { gsap } from 'gsap';
  import { browser } from '$app/environment';
  import { authApi } from '$lib/api';
  import { page } from '$app/stores';
  
  let email: string = '';
  let password: string = '';
  let loading: boolean = false;
  let error: string = '';
  let success: string = '';
  let loginForm: HTMLElement;
  let errorElement: HTMLElement;
  let successElement: HTMLElement;
  let mfaRequired: boolean = false;
  let mfaFactors: any[] = [];
  let mfaUserId: string = '';
  let mfaChallengeId: string = '';
  let mfaFactorId: string = '';
  let mfaCode: string = '';
  let mfaAccessToken: string = '';
  let mfaStep: boolean = false;
  
  // Redirect to profile page if already logged in
  onMount(() => {
    // Check auth status by making a request - cookies will be sent automatically
    const checkAuth = async () => {
      try {
        const response = await authApi.verifyAuth();
        if (response.data.authenticated) {
          goto('/dashboard');
        }
      } catch (error) {
        // Not authenticated, continue with login page
      }
    };
    
    if (browser) {
      checkAuth();
    }
    
    // Check for signup success parameter
    if (browser && $page.url.searchParams.get('signup') === 'success') {
      success = 'Your account has been created! Please check your email to confirm your account before logging in.';
    }
    
    // Animate form appearance
    if (browser && loginForm) {
      gsap.from(loginForm, { 
        opacity: 0, 
        y: 20, 
        duration: 0.5 
      });
      
      // Animate success message if present
      if (success && successElement) {
        gsap.fromTo(successElement, 
          { opacity: 0, y: -10 }, 
          { opacity: 1, y: 0, duration: 0.5 }
        );
      }
    }
  });
  
  const showError = (message: string) => {
    error = message;
    
    if (browser && errorElement) {
      gsap.fromTo(errorElement, 
        { opacity: 0, y: -10 }, 
        { opacity: 1, y: 0, duration: 0.3 }
      );
    }
  };
  
  const handleLogin = async () => {
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      const response = await authApi.login(email, password);
      
      if (response.data.mfaRequired) {
        mfaRequired = true;
        mfaFactors = response.data.factors || [];
        mfaUserId = response.data.userId;
        mfaAccessToken = response.data.accessToken || '';
        // For TOTP, factors[0] is usually the TOTP factor
        if (mfaFactors.length > 0) {
          mfaFactorId = mfaFactors[0].id;
        }
        mfaStep = true;
        // Show MFA input UI
        return;
      }
      
      if (response.data.success) {
        gsap.to(loginForm, { 
          opacity: 0, 
          y: -20, 
          duration: 0.3,
          onComplete: () => {
            goto('/dashboard');
          }
        });
      } else {
        showError('Login failed. Please check your credentials and try again.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.message || 
                          err.message || 
                          'An error occurred during login';
      showError(errorMessage);
    } finally {
      loading = false;
    }
  };
  
  const handleMfa = async () => {
    if (!mfaCode || !mfaFactorId) {
      showError('Please enter your MFA code');
      return;
    }
    loading = true;
    error = '';
    try {
      // 1. Request a challengeId first
      const challengeRes = await authApi.challengeMfa(mfaFactorId, mfaAccessToken);
      const challengeId = challengeRes.data.data.id;
      // 2. Verify the MFA code with the challengeId
      const response = await authApi.loginMfa(mfaFactorId, challengeId, mfaCode, mfaAccessToken);
      if (response.data.success) {
        gsap.to(loginForm, {
          opacity: 0,
          y: -20,
          duration: 0.3,
          onComplete: () => {
            goto('/dashboard');
          }
        });
      } else {
        showError('Invalid MFA code. Please try again.');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message ||
                          err.message ||
                          'MFA verification failed';
      showError(errorMessage);
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>Login - Dawn Sign Press</title>
</svelte:head>

<div class="login-container">
  <div class="login-form" bind:this={loginForm}>
    <h1>Login</h1>
    
    {#if success}
      <div class="success-message" bind:this={successElement}>
        {success}
      </div>
    {/if}
    
    {#if error}
      <div class="error-message" bind:this={errorElement}>
        {error}
      </div>
    {/if}
    
    <form on:submit|preventDefault={mfaStep ? handleMfa : handleLogin}>
      <div class="form-group">
        <div class="input-container">
          <span class="icon">✉️</span>
          <input 
            type="email" 
            id="email" 
            bind:value={email} 
            placeholder="Email"
            autocomplete="email"
            disabled={loading}
            required
          />
        </div>
      </div>
      
      <div class="form-group">
        <div class="input-container">
          <span class="icon">🔒</span>
          <input 
            type="password" 
            id="password" 
            bind:value={password} 
            placeholder="Password"
            autocomplete="current-password"
            disabled={loading}
            required
          />
        </div>
      </div>
      
      {#if mfaStep}
        <div class="form-group">
          <div class="input-container">
            <span class="icon">🔑</span>
            <input
              type="text"
              id="mfaCode"
              bind:value={mfaCode}
              placeholder="MFA Code"
              autocomplete="one-time-code"
              disabled={loading}
              required
            />
          </div>
        </div>
      {/if}
      
      <div class="form-actions">
        <button 
          type="submit" 
          class="login-button" 
          disabled={loading}
        >
          {loading ? (mfaStep ? 'Verifying...' : 'Signing in...') : (mfaStep ? 'Verify MFA →' : 'Sign In →')}
        </button>
      </div>
      
      <div class="form-footer">
        <p>
          Don't have an account? <a href="/signup">Sign up</a>
        </p>
        <p>
          <a href="/reset-password/request">Forgot your password?</a>
        </p>
      </div>
    </form>
  </div>
</div>

<style>
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 80vh;
    padding: 2rem;
  }
  
  .login-form {
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    padding: 2.5rem;
    width: 100%;
    max-width: 420px;
  }
  
  h1 {
    color: #333;
    font-size: 1.8rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  .input-container {
    position: relative;
  }
  
  .icon {
    position: absolute;
    top: 50%;
    left: 1rem;
    transform: translateY(-50%);
    font-size: 1.2rem;
    color: #666;
  }
  
  input {
    width: 100%;
    padding: 0.85rem 0.85rem 0.85rem 2.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }
  
  input:focus {
    outline: none;
    border-color: #4299e1;
    box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.2);
  }
  
  input:disabled {
    background-color: #f7f7f7;
    cursor: not-allowed;
  }
  
  .error-message {
    background-color: #fed7d7;
    color: #c53030;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }
  
  .success-message {
    background-color: #dff0d8;
    color: #3c763d;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }
  
  .form-actions {
    margin-top: 2rem;
  }
  
  .login-button {
    width: 100%;
    padding: 0.85rem;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .login-button:hover {
    background-color: #3182ce;
  }
  
  .login-button:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
  
  .form-footer {
    margin-top: 1.5rem;
    text-align: center;
    font-size: 0.9rem;
    color: #666;
  }
  
  .form-footer a {
    color: #4299e1;
    text-decoration: none;
  }
  
  .form-footer a:hover {
    text-decoration: underline;
  }
  
  .form-footer p {
    margin: 0.5rem 0;
  }
</style>

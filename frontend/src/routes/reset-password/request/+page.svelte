<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authApi } from '$lib/api';
  
  let email = '';
  let isLoading = false;
  let error = '';
  let success = false;
  let _container: HTMLElement;
  
  onMount(() => {
    if (browser && _container) {
      // Animate container in
      gsap.fromTo(_container, 
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 }
      );
    }
  });
  
  const handleSubmit = async () => {
    // Reset error
    error = '';
    
    // Validate email
    if (!email) {
      error = 'Please enter your email address';
      return;
    }
    
    isLoading = true;
    
    try {
      // Use the authApi to request password reset
      const response = await authApi.resetPassword(email);
      
      if (response.data.success) {
        success = true;
      } else {
        error = response.data.message || 'Failed to request password reset';
      }
    } catch (err) {
      console.error('Error requesting password reset:', err);
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      isLoading = false;
    }
  };
</script>

<svelte:head>
  <title>Reset Password - Dawn Sign Press</title>
</svelte:head>

<div class="reset-password-container" bind:this={_container}>
  <div class="reset-password-card">
    <h1>Reset Your Password</h1>
    
    {#if success}
      <div class="success-message">
        <p>If an account with that email exists, a password reset link has been sent.</p>
        <p>Please check your email for instructions to reset your password.</p>
        <button class="button primary" on:click={() => goto('/login')}>
          Return to Login
        </button>
      </div>
    {:else if error}
      <div class="error-message">
        <p>{error}</p>
      </div>
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="email">Email Address</label>
          <input 
            type="email" 
            id="email" 
            bind:value={email} 
            placeholder="Enter your email address"
            autocomplete="email"
            required
          />
        </div>
        
        <button 
          type="submit" 
          class="button primary" 
          disabled={isLoading}
        >
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
    {:else}
      <p class="instruction">Enter your email address below and we'll send you a link to reset your password.</p>
      
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="email">Email Address</label>
          <input 
            type="email" 
            id="email" 
            bind:value={email} 
            placeholder="Enter your email address"
            autocomplete="email"
            required
          />
        </div>
        
        <button 
          type="submit" 
          class="button primary" 
          disabled={isLoading}
        >
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
      
      <div class="form-footer">
        <p>
          Remember your password? <a href="/login">Sign in</a>
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .reset-password-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 2rem;
    background-color: #f7fafc;
  }
  
  .reset-password-card {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 2rem;
    width: 100%;
    max-width: 480px;
  }
  
  h1 {
    color: #2d3748;
    margin-top: 0;
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
    text-align: center;
  }
  
  .instruction {
    color: #4a5568;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  .form-group {
    margin-bottom: 1.25rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    color: #4a5568;
    font-weight: 500;
  }
  
  input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 1rem;
  }
  
  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .button {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 0.875rem;
    width: 100%;
  }
  
  .primary {
    background-color: #3b82f6;
    color: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .primary:hover {
    background-color: #2563eb;
  }
  
  .button[disabled] {
    opacity: 0.7;
    cursor: not-allowed;
    background-color: #e2e8f0;
    color: #a0aec0;
  }
  
  .error-message {
    padding: 1rem;
    background-color: #fed7d7;
    color: #c53030;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  .success-message {
    padding: 1rem;
    background-color: #c6f6d5;
    color: #2f855a;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  .form-footer {
    margin-top: 1.5rem;
    text-align: center;
    font-size: 0.875rem;
    color: #4a5568;
  }
  
  .form-footer a {
    color: #3b82f6;
    text-decoration: none;
  }
  
  .form-footer a:hover {
    text-decoration: underline;
  }
</style>

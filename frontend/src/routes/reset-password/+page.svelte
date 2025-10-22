<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authApi } from '$lib/api';
  
  let password = '';
  let confirmPassword = '';
  let isLoading = false;
  let error = '';
  let success = false;
  let _container: HTMLElement;
  let hashData = '';
  
  onMount(() => {
    if (browser) {
      // Store the hash for later use with the backend
      hashData = window.location.hash;
      
      // Check if we have a hash with recovery token
      if (!hashData || !hashData.includes('access_token') || !hashData.includes('type=recovery')) {
        // If no valid hash, redirect to the request page
        goto('/reset-password/request');
        return;
      }
      
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
    
    // Validate passwords
    if (!password) {
      error = 'Please enter a new password';
      return;
    }
    
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }
    
    if (password.length < 6) {
      error = 'Password must be at least 6 characters long';
      return;
    }
    
    isLoading = true;
    
    try {
      // Use the authApi to update the password
      const response = await authApi.updatePasswordAfterReset(password, hashData);
      
      if (response.data.success) {
        success = true;
        
        // Redirect to login after 3 seconds
        gsap.delayedCall(3, () => {
          goto('/login');
        });
      } else {
        error = response.data.message || 'Failed to update password';
      }
    } catch (err) {
      console.error('Error updating password:', err);
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
        <p>Your password has been updated successfully!</p>
        <p>Redirecting to login page...</p>
      </div>
    {:else if error}
      <div class="error-message">
        <p>{error}</p>
        <button class="button primary" on:click={() => goto('/login')}>
          Return to Login
        </button>
      </div>
    {:else}
      <p class="instruction">Please enter your new password below.</p>
      
      <form on:submit|preventDefault={handleSubmit}>
        <!-- Hidden username field for accessibility -->
        <input 
          type="hidden" 
          id="username" 
          name="username" 
          autocomplete="username" 
        />
        
        <div class="form-group">
          <label for="password">New Password</label>
          <input 
            type="password" 
            id="password" 
            bind:value={password} 
            placeholder="Enter new password"
            autocomplete="new-password"
            required
          />
        </div>
        
        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input 
            type="password" 
            id="confirm-password" 
            bind:value={confirmPassword} 
            placeholder="Confirm new password"
            autocomplete="new-password"
            required
          />
        </div>
        
        <button 
          type="submit" 
          class="button primary" 
          disabled={isLoading}
        >
          {isLoading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
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
</style>

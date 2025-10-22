<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  
  // Form fields
  let name = '';
  let university = '';
  let email = '';
  let password = '';
  let consented = false;
  let allow_video_usage = false;
  
  // UI state
  let loading = false;
  let error = '';
  let formElement: HTMLElement;
  let errorElement: HTMLElement;
  
  onMount(() => {
    if (browser && formElement) {
      gsap.from(formElement, { 
        opacity: 0, 
        y: 20, 
        duration: 0.5 
      });
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
  
  async function handleSignup() {
    // Validate form
    if (!name) {
      showError('Name is required');
      return;
    }
    
    if (!email) {
      showError('Email is required');
      return;
    }
    
    if (!password) {
      showError('Password is required');
      return;
    }
    
    if (!consented) {
      showError('You must consent to continue');
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      // Single request approach - send all data to backend at once
      const signupData = {
        name,
        email,
        password,
        consent: consented,
        allow_video_usage,
        university
      };
      
      console.log('Submitting signup data:', { ...signupData, password: '***' });
      
      // Call a single API endpoint for the entire signup process
      const response = await fetch('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData)
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.message || 'Signup failed');
      }
      
      // Show success message and redirect to login page
      loading = false;
      
      // Animate the form out
      gsap.to(formElement, { 
        opacity: 0, 
        y: -20, 
        duration: 0.3,
        onComplete: () => {
          // Navigate to login page
          goto('/login?signup=success');
        }
      });
      return;
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred during signup';
      showError(errorMessage);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign Up - Dawn Sign Press</title>
</svelte:head>

<div class="signup-container">
  <div class="signup-form" bind:this={formElement}>
    <h1>Create your Sign Check profile to get started</h1>
    <p class="subtitle">with your first lessons</p>
    
    {#if error}
      <div class="error-message" bind:this={errorElement}>
        {error}
      </div>
    {/if}
    
    <form on:submit|preventDefault={handleSignup}>
      <div class="form-group">
        <div class="input-container">
          <span class="icon">👤</span>
          <input 
            type="text" 
            bind:value={name} 
            placeholder="Name"
            required
            autocomplete="name"
          />
        </div>
      </div>
      
      <div class="form-group">
        <div class="input-container">
          <span class="icon">🎓</span>
          <input 
            type="text" 
            bind:value={university} 
            placeholder="University or college"
          />
        </div>
      </div>
      
      <div class="form-group">
        <div class="input-container">
          <span class="icon">✉️</span>
          <input 
            type="email" 
            bind:value={email} 
            placeholder="Email"
            required
            autocomplete="email"
          />
        </div>
      </div>
      
      <div class="form-group">
        <div class="input-container">
          <span class="icon">🔒</span>
          <input 
            type="password" 
            bind:value={password} 
            placeholder="Enter password"
            required
            autocomplete="new-password"
          />
        </div>
      </div>
      
      <div class="consent-group">
        <label class="checkbox-container">
          <input 
            type="checkbox" 
            bind:checked={consented}
          />
          <span class="checkbox-text">
            I consent to letting DSP use my videos to make the platform better
          </span>
        </label>
      </div>
      
      <div class="consent-group">
        <label class="checkbox-container">
          <input 
            type="checkbox" 
            bind:checked={allow_video_usage}
          />
          <span class="checkbox-text">
            I allow Dawn Sign Press to use my videos for promotional purposes
          </span>
        </label>
      </div>
      
      <div class="button-group">
        <button type="submit" class="register-btn" disabled={loading}>
          {loading ? 'Creating Account...' : 'Register →'}
        </button>
      </div>
      
      <div class="terms">
        By creating an account, you agree to our Terms and the Global Privacy Statement.
      </div>
      
      <div class="login-link">
        Already have an account? <a href="/login">Log in</a>
      </div>
    </form>
  </div>
</div>

<style>
  .signup-container {
    width: 100%;
    max-width: 100%;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem;
    background-color: #e0eafc;
  }
  
  .signup-form {
    max-width: 500px;
    width: 100%;
    padding: 2rem;
    background-color: white;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  h1 {
    font-size: 1.6rem;
    text-align: center;
    margin-bottom: 0.5rem;
    color: #333;
  }
  
  .subtitle {
    text-align: center;
    margin-bottom: 2rem;
    color: #555;
  }
  
  .error-message {
    background-color: #fee2e2;
    color: #b91c1c;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    text-align: center;
  }
  
  .input-container {
    display: flex;
    align-items: center;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5rem;
    margin-bottom: 1rem;
    background-color: white;
  }
  
  .input-container .icon {
    margin-right: 10px;
    font-size: 1.2rem;
  }
  
  .input-container input {
    flex: 1;
    border: none;
    padding: 0.5rem;
    font-size: 1rem;
    background: transparent;
  }
  
  .input-container input:focus {
    outline: none;
  }
  
  .checkbox-container {
    display: flex;
    align-items: flex-start;
    margin-bottom: 1.5rem;
    cursor: pointer;
  }
  
  .checkbox-container input[type="checkbox"] {
    margin-right: 10px;
    margin-top: 3px;
  }
  
  .checkbox-text {
    font-size: 0.9rem;
    color: #555;
  }
  
  .register-btn {
    width: 100%;
    padding: 0.8rem;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  .register-btn:hover {
    background-color: #2563eb;
  }
  
  .register-btn:disabled {
    background-color: #93c5fd;
    cursor: not-allowed;
  }
  
  .terms {
    margin-top: 1rem;
    font-size: 0.8rem;
    text-align: center;
    color: #666;
    margin-bottom: 1rem;
  }
  
  .login-link {
    text-align: center;
    font-size: 0.9rem;
  }
  
  .login-link a {
    color: #3b82f6;
    text-decoration: none;
  }
  
  .login-link a:hover {
    text-decoration: underline;
  }
</style>

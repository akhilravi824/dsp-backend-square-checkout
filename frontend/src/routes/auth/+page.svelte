<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { authApi } from '$lib/api';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  
  let email: string = '';
  let password: string = '';
  let action: 'register' | 'login' | 'logout' = 'login';
  let loading: boolean = false;
  let result: { success: boolean; message: string; data?: any } | null = null;
  let resultElement: HTMLElement;
  let formElement: HTMLElement;
  
  onMount(() => {
    if (browser) {
      gsap.from(formElement, { 
        opacity: 0, 
        y: 20, 
        duration: 0.5 
      });
    }
  });
  
  async function handleSubmit() {
    loading = true;
    result = null;
    
    try {
      let response;
      
      if (action === 'register') {
        response = await authApi.register(email, password);
      } else if (action === 'login') {
        response = await authApi.login(email, password);
        
        // Check for token in response and store it
        console.log('Login response:', response?.data);
        console.log('Full response object:', response);
        console.log('Response data keys:', Object.keys(response?.data || {}));
        console.log('Response data.data keys:', Object.keys(response?.data?.data || {}));
        console.log('Safari auth detected:', response?.data?.useSafariAuth);
        console.log('Safari auth object:', response?.data?.safariAuth);
        console.log('Safari auth from data.data:', response?.data?.data?.safariAuth);
        console.log('Fallback auth object:', response?.data?.fallbackAuth);
        console.log('Fallback auth from data.data:', response?.data?.data?.fallbackAuth);
        console.log('Session object:', response?.data?.session);
        
        // Try Safari auth first, then fallback auth, then session structure
        // The response structure is: response.data.data.safariAuth
        let accessToken = response?.data?.data?.safariAuth?.accessToken || 
                         response?.data?.data?.fallbackAuth?.accessToken || 
                         response?.data?.safariAuth?.accessToken || 
                         response?.data?.fallbackAuth?.accessToken || 
                         response?.data?.session?.access_token;
        let refreshToken = response?.data?.data?.safariAuth?.refreshToken || 
                          response?.data?.data?.fallbackAuth?.refreshToken || 
                          response?.data?.safariAuth?.refreshToken || 
                          response?.data?.fallbackAuth?.refreshToken || 
                          response?.data?.session?.refresh_token;
        
        console.log('Extracted tokens - Access:', !!accessToken, 'Refresh:', !!refreshToken);
        
        if (accessToken && browser) {
          localStorage.setItem('token', accessToken);
          console.log('Stored access token:', accessToken.substring(0, 20) + '...');
          
          if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken);
            console.log('Stored refresh token:', refreshToken);
          } else {
            console.log('No refresh token to store');
          }
          
          // Verify what's actually in localStorage
          console.log('localStorage token:', localStorage.getItem('token')?.substring(0, 20) + '...');
          console.log('localStorage refreshToken:', localStorage.getItem('refreshToken'));
          
          // Redirect to dashboard page after successful login
          gsap.to(formElement, { 
            opacity: 0, 
            y: -20, 
            duration: 0.3,
            onComplete: () => {
              goto('/dashboard');
            }
          });
          return;
        }
      } else if (action === 'logout') {
        response = await authApi.logout();
        // Clear tokens on logout
        if (browser) {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        }
      }
      
      result = {
        success: true,
        message: `${action} successful`,
        data: response?.data
      };
    } catch (error: any) {
      result = {
        success: false,
        message: error.response?.data?.message || error.message || 'An error occurred'
      };
    } finally {
      loading = false;
      
      // Animate the result if it exists and we're in the browser
      if (result && browser && resultElement) {
        gsap.fromTo(resultElement, 
          { opacity: 0, y: 10 }, 
          { opacity: 1, y: 0, duration: 0.3 }
        );
      }
    }
  }
</script>

<div class="auth-container">
  <h1>Authentication API Testing</h1>
  
  <div class="auth-form" bind:this={formElement}>
    <div class="form-group">
      <label>
        <input 
          type="radio" 
          name="action" 
          value="register" 
          bind:group={action}
        >
        Register
      </label>
      <label>
        <input 
          type="radio" 
          name="action" 
          value="login" 
          bind:group={action}
        >
        Login
      </label>
      <label>
        <input 
          type="radio" 
          name="action" 
          value="logout" 
          bind:group={action}
        >
        Logout
      </label>
    </div>
    
    {#if action !== 'logout'}
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            bind:value={email} 
            placeholder="Enter your email"
            required
          >
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            bind:value={password} 
            placeholder="Enter your password"
            required
          >
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : action.charAt(0).toUpperCase() + action.slice(1)}
        </button>
      </form>
    {:else}
      <button on:click={handleSubmit} disabled={loading}>
        {loading ? 'Processing...' : action.charAt(0).toUpperCase() + action.slice(1)}
      </button>
    {/if}
  </div>
  
  {#if result}
    <div class="result" class:success={result.success} class:error={!result.success} bind:this={resultElement}>
      <h3>{result.success ? 'Success' : 'Error'}</h3>
      <p>{result.message}</p>
      {#if result.data}
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .auth-container {
    max-width: 600px;
    margin: 0 auto;
  }
  
  h1 {
    margin-bottom: 1.5rem;
    color: #2d3748;
  }
  
  .auth-form {
    background-color: white;
    padding: 2rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #4a5568;
  }
  
  input[type="radio"] {
    margin-right: 0.5rem;
  }
  
  label:has(input[type="radio"]) {
    display: inline-block;
    margin-right: 1.5rem;
  }
  
  input[type="email"],
  input[type="password"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.25rem;
    font-size: 1rem;
  }
  
  button {
    padding: 0.75rem 1.5rem;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 0.25rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  button:hover {
    background-color: #3182ce;
  }
  
  button:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
  
  .result {
    padding: 1.5rem;
    border-radius: 0.5rem;
    margin-top: 1.5rem;
  }
  
  .success {
    background-color: #c6f6d5;
    border: 1px solid #9ae6b4;
  }
  
  .error {
    background-color: #fed7d7;
    border: 1px solid #feb2b2;
  }
  
  h3 {
    margin-top: 0;
    margin-bottom: 0.5rem;
  }
  
  pre {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 1rem;
    border-radius: 0.25rem;
    overflow-x: auto;
    font-size: 0.875rem;
  }
</style>

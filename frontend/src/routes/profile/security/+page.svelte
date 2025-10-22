<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authApi } from '$lib/api';
  
  let loading = false;
  let error = '';
  let success = false;
  let hasMfaEnabled = false;
  let container: HTMLElement;
  let securityCard: HTMLElement;
  
  const fetchMfaStatus = async () => {
    if (!browser) return;
    
    loading = true;
    try {
      const response = await authApi.getUserMfaStatus();
      if (response.data.success) {
        hasMfaEnabled = response.data.data.hasMfaEnabled;
      }
    } catch (err) {
      console.error('Error fetching MFA status:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch MFA status';
      error = errorMessage;
    } finally {
      loading = false;
    }
  };
  
  const enableTwoFactor = async () => {
    loading = true;
    error = '';
    success = false;
    
    try {
      const response = await authApi.enrollMfa();
      if (response.data.success) {
        // Redirect to setup process or show QR code
        goto('/profile/security/enroll-mfa');
      } else {
        error = response.data.message || 'Failed to enable two-factor authentication';
      }
    } catch (err) {
      console.error('Error enabling MFA:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to enable two-factor authentication';
      error = errorMessage;
    } finally {
      loading = false;
    }
  };
  
  onMount(() => {
    if (browser) {
      // Animate container
      gsap.from(container, { 
        opacity: 0, 
        y: 20, 
        duration: 0.5 
      });
      
      // Animate security card
      gsap.delayedCall(0.1, () => {
        if (securityCard) {
          gsap.from(securityCard, { 
            opacity: 0, 
            y: 10, 
            duration: 0.4,
            delay: 0.2
          });
        }
      });
      
      // Fetch MFA status
      fetchMfaStatus();
    }
  });
</script>

<svelte:head>
  <title>Security Settings</title>
</svelte:head>

<div class="container" bind:this={container}>
  <div class="header">
    <h1>Security</h1>
    <button class="back-button" on:click={() => goto('/profile')}>Back to Profile</button>
  </div>
  
  {#if loading}
    <div class="loading">Loading security settings...</div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
      <button class="retry-button" on:click={fetchMfaStatus}>Retry</button>
    </div>
  {:else}
    <div class="security-card" bind:this={securityCard}>
      <h2>Security</h2>
      <p class="security-description">
        Enable two-factor authentication and enhance
        the security of your account.
      </p>
      
      <div class="security-section">
        <h3>Secure your account with 2FA</h3>
        <ul class="benefits-list">
          <li>✓ Extra layer of protection for your account</li>
          <li>✓ No risk of compromised password or learning progress</li>
          <li>✓ Enjoy worry-free learning</li>
        </ul>
        
        {#if hasMfaEnabled}
          <div class="mfa-enabled">
            <span class="status-badge enabled">Enabled</span>
            <p>Two-factor authentication is currently enabled for your account.</p>
            <button class="secondary-button" on:click={() => goto('/profile/security/manage-mfa')}>
              Manage 2FA Settings
            </button>
          </div>
        {:else}
          <button 
            class="enable-button" 
            on:click={enableTwoFactor} 
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Enable Two Factor Authentication'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  
  h1 {
    font-size: 2rem;
    color: #1a202c;
    margin: 0;
  }
  
  .back-button {
    padding: 0.5rem 1rem;
    background-color: #e2e8f0;
    color: #4a5568;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  
  .back-button:hover {
    background-color: #cbd5e0;
  }
  
  .security-card {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 2rem;
  }
  
  .security-description {
    color: #718096;
    margin-bottom: 2rem;
  }
  
  .security-section {
    border-top: 1px solid #e2e8f0;
    padding-top: 1.5rem;
  }
  
  h2 {
    font-size: 1.5rem;
    color: #2d3748;
    margin-top: 0;
    margin-bottom: 0.5rem;
  }
  
  h3 {
    font-size: 1.25rem;
    color: #2d3748;
    margin-bottom: 1rem;
  }
  
  .benefits-list {
    list-style: none;
    padding: 0;
    margin-bottom: 1.5rem;
  }
  
  .benefits-list li {
    margin-bottom: 0.75rem;
    color: #4a5568;
  }
  
  .enable-button {
    display: block;
    width: 100%;
    max-width: 300px;
    padding: 0.8rem 1rem;
    background-color: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .enable-button:hover {
    background-color: #1d4ed8;
  }
  
  .enable-button:disabled {
    background-color: #93c5fd;
    cursor: not-allowed;
  }
  
  .loading {
    text-align: center;
    padding: 2rem;
    color: #718096;
  }
  
  .error-message {
    background-color: #fed7d7;
    color: #c53030;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .retry-button {
    background-color: #e53e3e;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    margin-top: 0.5rem;
    cursor: pointer;
  }
  
  .mfa-enabled {
    background-color: #f0fff4;
    border: 1px solid #c6f6d5;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  
  .status-badge.enabled {
    background-color: #c6f6d5;
    color: #2f855a;
  }
  
  .secondary-button {
    background-color: #e2e8f0;
    color: #4a5568;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    cursor: pointer;
    margin-top: 0.5rem;
  }
  
  .secondary-button:hover {
    background-color: #cbd5e0;
  }
</style>

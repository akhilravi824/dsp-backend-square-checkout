<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authApi } from '$lib/api';
  
  let loading = false;
  let error = '';
  let success = false;
  let qrCode = '';
  let secret = '';
  let factorId = '';
  let verificationCode = '';
  let container: HTMLElement;
  let enrollCard: HTMLElement;
  
  const startEnrollment = async () => {
    if (!browser) return;
    
    loading = true;
    try {
      const response = await authApi.enrollMfa();
      if (response.data.success) {
        const { factorId: id, qrCode: qr, secret: secretKey } = response.data.data;
        factorId = id;
        qrCode = qr;
        secret = secretKey;
      } else {
        error = response.data.message || 'Failed to start enrollment process';
      }
    } catch (err) {
      console.error('Error starting MFA enrollment:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start enrollment process';
      error = errorMessage;
    } finally {
      loading = false;
    }
  };
  
  const verifyAndComplete = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      error = 'Please enter a valid 6-digit verification code';
      return;
    }
    
    loading = true;
    try {
      const response = await authApi.verifyMfa(factorId, verificationCode);
      if (response.data.success) {
        success = true;
        // Animate success message
        gsap.delayedCall(0.1, () => {
          if (enrollCard) {
            gsap.to(enrollCard, { 
              scale: 1.03, 
              duration: 0.2,
              ease: 'power1.out',
              onComplete: () => {
                gsap.to(enrollCard, { 
                  scale: 1, 
                  duration: 0.3,
                  ease: 'elastic.out(1, 0.3)'
                });
              }
            });
          }
        });
        
        // Redirect after short delay
        gsap.delayedCall(3, () => {
          goto('/profile/security');
        });
      } else {
        error = response.data.message || 'Verification failed. Please check your code and try again.';
      }
    } catch (err) {
      console.error('Error verifying MFA code:', err);
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
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
      
      // Animate enrollment card
      gsap.delayedCall(0.1, () => {
        if (enrollCard) {
          gsap.from(enrollCard, { 
            opacity: 0, 
            y: 10, 
            duration: 0.4,
            delay: 0.2
          });
        }
      });
      
      // Start the enrollment process
      startEnrollment();
    }
  });
</script>

<svelte:head>
  <title>Enable Two-Factor Authentication</title>
</svelte:head>

<div class="container" bind:this={container}>
  <div class="header">
    <h1>Two-Factor Authentication Setup</h1>
    <button class="back-button" on:click={() => goto('/profile/security')}>Cancel</button>
  </div>
  
  {#if loading && !qrCode}
    <div class="loading">
      <p>Setting up two-factor authentication...</p>
    </div>
  {:else if error && !success}
    <div class="error-message">
      <p>{error}</p>
      <button class="retry-button" on:click={startEnrollment}>Try Again</button>
    </div>
  {:else if success}
    <div class="success-card" bind:this={enrollCard}>
      <div class="success-icon">✓</div>
      <h2>Two-Factor Authentication Enabled</h2>
      <p>Your account is now protected with an additional layer of security.</p>
      <button class="primary-button" on:click={() => goto('/profile/security')}>
        Return to Security Settings
      </button>
    </div>
  {:else}
    <div class="enroll-card" bind:this={enrollCard}>
      <h2>Setup Two-Factor Authentication</h2>
      
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>Download an authenticator app</h3>
            <p>If you don't have one already, download an authenticator app like Google Authenticator, Authy, or Microsoft Authenticator.</p>
          </div>
        </div>
        
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>Scan the QR code</h3>
            <p>Open your authenticator app and scan this QR code:</p>
            
            <div class="qr-container">
              {#if qrCode}
                <img src={qrCode} alt="QR Code for Two-Factor Authentication" />
              {:else}
                <div class="qr-placeholder">Loading QR code...</div>
              {/if}
            </div>
            
            <div class="manual-entry">
              <p>If you can't scan the QR code, enter this code manually:</p>
              <div class="secret-key">{secret}</div>
            </div>
          </div>
        </div>
        
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>Enter verification code</h3>
            <p>Enter the 6-digit code shown in your authenticator app:</p>
            
            <div class="code-input">
              <input 
                type="text" 
                bind:value={verificationCode} 
                placeholder="000000" 
                maxlength="6"
                pattern="[0-9]*"
                inputmode="numeric"
              />
            </div>
            
            <button 
              class="verify-button" 
              on:click={verifyAndComplete}
              disabled={loading || !verificationCode || verificationCode.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
            </button>
          </div>
        </div>
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
  
  .enroll-card, .success-card {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 2rem;
  }
  
  h2 {
    font-size: 1.5rem;
    color: #2d3748;
    margin-top: 0;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  .steps {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  
  .step {
    display: flex;
    gap: 1rem;
  }
  
  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background-color: #4299e1;
    color: white;
    border-radius: 50%;
    font-weight: bold;
    flex-shrink: 0;
  }
  
  .step-content {
    flex: 1;
  }
  
  h3 {
    font-size: 1.25rem;
    color: #2d3748;
    margin-top: 0;
    margin-bottom: 0.5rem;
  }
  
  .qr-container {
    display: flex;
    justify-content: center;
    margin: 1.5rem 0;
  }
  
  .qr-container img {
    max-width: 200px;
    height: auto;
    border: 1px solid #e2e8f0;
    padding: 0.5rem;
    background-color: white;
  }
  
  .qr-placeholder {
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f7fafc;
    border: 1px solid #e2e8f0;
    color: #718096;
  }
  
  .manual-entry {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f7fafc;
    border-radius: 4px;
  }
  
  .secret-key {
    font-family: monospace;
    font-size: 1.2rem;
    background-color: white;
    padding: 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    text-align: center;
    margin-top: 0.5rem;
    user-select: all;
  }
  
  .code-input {
    margin: 1rem 0;
  }
  
  .code-input input {
    width: 100%;
    max-width: 200px;
    font-size: 1.5rem;
    letter-spacing: 0.5rem;
    padding: 0.5rem;
    border: 2px solid #e2e8f0;
    border-radius: 4px;
    text-align: center;
    font-family: monospace;
  }
  
  .verify-button {
    display: block;
    width: 100%;
    max-width: 250px;
    padding: 0.8rem 1rem;
    background-color: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-top: 1.5rem;
  }
  
  .verify-button:hover {
    background-color: #1d4ed8;
  }
  
  .verify-button:disabled {
    background-color: #93c5fd;
    cursor: not-allowed;
  }
  
  .loading {
    text-align: center;
    padding: 3rem 1rem;
    color: #718096;
  }
  
  .error-message {
    background-color: #fed7d7;
    color: #c53030;
    padding: 1.5rem;
    border-radius: 4px;
    text-align: center;
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
  
  .success-card {
    padding: 3rem 2rem;
    text-align: center;
  }
  
  .success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    background-color: #48bb78;
    color: white;
    border-radius: 50%;
    font-size: 2rem;
    font-weight: bold;
    margin: 0 auto 1.5rem;
  }
  
  .primary-button {
    display: inline-block;
    padding: 0.8rem 1.5rem;
    background-color: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-top: 1.5rem;
  }
  
  .primary-button:hover {
    background-color: #1d4ed8;
  }
</style>

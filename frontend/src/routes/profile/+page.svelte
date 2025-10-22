<script lang="ts">
  import { onMount } from 'svelte';
  import { profileApi, authApi } from '$lib/api';
  import { goto } from '$app/navigation';
  import { gsap } from 'gsap';
  import { browser } from '$app/environment';
  
  let name = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let consent = false;
  let loading = false;
  let success = false;
  let error = '';
  let profileData: any = null;
  let isLoggedIn = false;
  let isLoading = true;
  let container: HTMLElement;
  let profileInfo: HTMLDivElement;
  let errorMessage: HTMLDivElement;
  let completeProfileSection: HTMLDivElement;
  let profileForm: HTMLFormElement;
  
  // Profile completion
  let profileFormVisible = false;
  let university = '';
  let consented = false;
  
  // Security section
  let hasMfaEnabled = false;
  let mfaLoading = false;
  let mfaError = '';
  let securitySection: HTMLDivElement;
  
  const validateForm = () => {
    if (!name || !email || !password) {
      error = 'All fields are required';
      return false;
    }
    
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return false;
    }
    
    if (!consent) {
      error = 'You must consent to the terms and conditions';
      return false;
    }
    
    error = '';
    return true;
  };
  
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    loading = true;
    error = '';
    
    try {
      const response = await authApi.signup({
        name,
        email,
        password,
        consent
      });
      
      success = true;
      profileData = response.data.data;
      console.log('Profile created:', profileData);
    } catch (err: any) {
      // Enhanced error handling for different error types
      if (err.response?.data?.message) {
        error = err.response.data.message;
        
        // Special handling for duplicate email error
        if (error.includes('already exists')) {
          error = `A user with email ${email} already exists. Please use a different email or try logging in.`;
        }
      } else {
        error = 'Failed to create profile. Please try again.';
      }
      console.error('Error creating profile:', err);
    } finally {
      loading = false;
    }
  };
  
  const fetchProfileData = async () => {
    if (!browser) {
      isLoading = false;
      return;
    }
    
    isLoading = true;
    try {
      // Cookies are automatically sent with the request
      try {
        const response = await profileApi.getProfile();
        if (response.data.success) {
          profileData = response.data.data;
          console.log('Profile data received:', profileData);
          console.log('Has profile:', profileData.hasProfile);
          
          // Set logged in state
          isLoggedIn = true;
          
          // Populate form fields with existing data
          name = profileData.name || profileData.user_metadata?.name || '';
          email = profileData.email || '';
          
          // Additional fallback check - if we have a name, consider the profile created
          // regardless of the hasProfile flag from the backend
          const actuallyHasProfile = profileData.hasProfile || Boolean(profileData.name);
          profileData.hasProfile = actuallyHasProfile;
          
          if (!actuallyHasProfile) {
            console.log('User needs to complete profile, showing form');
            showCompleteProfileForm();
          } else {
            console.log('User has a profile, showing profile info');
            // Use GSAP for animation of profile info
            gsap.delayedCall(0, () => {
              if (profileInfo) {
                gsap.fromTo(profileInfo, 
                  { opacity: 0, y: 20 }, 
                  { opacity: 1, y: 0, duration: 0.5, delay: 0.2 }
                );
              }
            });
          }
        }
      } catch (err: unknown) {
        console.error('Error fetching profile:', err);
        if (err instanceof Error) {
          // If we get an authorization error, redirect to login
          if (err.message.includes('401') || err.message.includes('403')) {
            console.log('Auth token invalid or expired, redirecting to login');
            isLoggedIn = false;
            goto('/login');
          }
        }
      }
    } catch (err: unknown) {
      console.error('Fetch profile error:', err);
    } finally {
      isLoading = false;
    }
  };
  
  const redirectToLogin = () => {
    if (container) {
      gsap.to(container, { 
        opacity: 0, 
        y: -20, 
        duration: 0.3,
        onComplete: () => {
          goto('/login');
        }
      });
    } else {
      goto('/login');
    }
  };
  
  const handleLogout = async () => {
    if (browser) {
      try {
        loading = true;
        
        // Attempt server-side logout which will clear the cookie
        try {
          await authApi.logout();
        } catch (serverErr: unknown) {
          console.warn('Server logout failed:', serverErr);
        }
        
        // Always redirect to login page
        goto('/login');
      } catch (err: unknown) {
        console.error('Logout error:', err);
        // Redirect anyway
        goto('/login');
      } finally {
        loading = false;
      }
    }
  };
  
  // Function to show complete profile form
  const showCompleteProfileForm = () => {
    profileFormVisible = true;
    
    // Animate the form entrance
    gsap.delayedCall(0, () => {
      if (completeProfileSection) {
        gsap.fromTo(completeProfileSection,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5 }
        );
      }
    });
  };
  
  // Function to show error message
  const showError = (message: string) => {
    error = message;
    
    // Use GSAP for error message animation
    gsap.delayedCall(0, () => {
      if (errorMessage) {
        gsap.fromTo(errorMessage, 
          { opacity: 0, y: -10 }, 
          { opacity: 1, y: 0, duration: 0.3 }
        );
      }
    });
  };
  
  // Function to submit complete profile
  const handleCompleteProfile = async () => {
    if (!name) {
      showError('Name is required to complete your profile');
      return;
    }
    
    if (!consented) {
      showError('You must consent to continue');
      return;
    }
    
    loading = true;
    try {
      // Map the form data to match the expected API structure
      const formData = {
        name,
        university,
        email: profileData?.email || '',  // Use existing email
        password: '',  // Not changing password
        consent: consented // Required field
      };
      
      const response = await authApi.signup(formData);
      
      if (response.data.success) {
        // Hide the form and refresh the profile data
        profileFormVisible = false;
        fetchProfileData();
        
        // Show success animation
        gsap.to(completeProfileSection, {
          opacity: 0,
          y: -20,
          duration: 0.3,
          onComplete: () => {
            gsap.to(profileInfo, {
              scale: 1.03,
              duration: 0.2,
              yoyo: true,
              repeat: 1
            });
          }
        });
      }
    } catch (err: unknown) {
      console.error('Error completing profile:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while saving your profile';
      showError(errorMessage);
    } finally {
      loading = false;
    }
  };
  
  // Function to fetch MFA status
  const fetchMfaStatus = async () => {
    if (!browser || !isLoggedIn) return;
    
    mfaLoading = true;
    try {
      const response = await authApi.getUserMfaStatus();
      if (response.data.success) {
        hasMfaEnabled = response.data.data.hasMfaEnabled;
        
        // Animate the security section when data is loaded
        gsap.delayedCall(0, () => {
          if (securitySection) {
            gsap.fromTo(securitySection,
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: 0.4 }
            );
          }
        });
      } else {
        mfaError = response.data.message || 'Unable to fetch MFA status';
      }
    } catch (err) {
      console.error('Error fetching MFA status:', err);
      mfaError = err instanceof Error ? err.message : 'Failed to get MFA status';
    } finally {
      mfaLoading = false;
    }
  };
  
  // Function to toggle MFA
  const toggleMfa = () => {
    if (hasMfaEnabled) {
      // Confirm before disabling
      if (confirm('Are you sure you want to disable two-factor authentication? This will reduce your account security.')) {
        goto('/profile/security/disable-mfa');
      }
    } else {
      // Navigate to MFA setup page
      goto('/profile/security/enroll-mfa');
    }
  };
  
  onMount(() => {
    // Reset form state when component mounts
    success = false;
    error = '';
    
    // Animate container in if we're in the browser
    if (browser && container) {
      gsap.from(container, { opacity: 0, y: 20, duration: 0.5 });
    }
    
    // Try to fetch profile data if user is logged in
    fetchProfileData();
    fetchMfaStatus();
  });
</script>

<svelte:head>
  <title>{isLoggedIn ? 'Your Profile' : 'Create Profile'}</title>
</svelte:head>

<div class="container" bind:this={container}>
  <h1>{isLoggedIn ? 'Your Profile' : 'Create Profile'}</h1>
  
  {#if isLoading}
    <div class="loading">Loading profile data...</div>
  {:else if success}
    <div class="success-message">
      <h2>Profile Created Successfully!</h2>
      <p>Your profile has been created. You can now add payment methods.</p>
      
      <div class="profile-data">
        <h3>Profile Data:</h3>
        <pre>{JSON.stringify(profileData, null, 2)}</pre>
      </div>
      
      <a href="/profile/payment" class="button">Add Payment Method</a>
    </div>
  {:else if error}
    <div class="error-message" bind:this={errorMessage}>
      <h2>Error</h2>
      <p>{error}</p>
      <button class="button" on:click={redirectToLogin}>Log In Again</button>
    </div>
  {:else if isLoggedIn && profileData && !profileData.hasProfile}
    <div class="profile-completion" bind:this={completeProfileSection}>
      <div class="sign-check-form">
        <h1>Create your Sign Check profile to get started</h1>
        <p class="subtitle">with your first lessons</p>
        
        <form on:submit|preventDefault={handleCompleteProfile}>
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
                value={profileData.email || ''} 
                placeholder="Email"
                disabled
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
          
          <div class="button-group">
            <button type="submit" class="register-btn" disabled={loading}>
              {loading ? 'Creating Profile...' : 'Register →'}
            </button>
          </div>
          
          <div class="terms">
            By creating an account, you agree to our Terms and the Global Privacy Statement.
          </div>
        </form>
      </div>
    </div>
  {:else if isLoggedIn && profileData}
    <div class="profile-info" bind:this={profileInfo}>
      <div class="profile-header">
        <h2>Welcome, {profileData.name || profileData.user_metadata?.name || profileData.email?.split('@')[0] || 'User'}</h2>
        <button class="logout-button" on:click={handleLogout}>Logout</button>
      </div>
      
      <div class="profile-card">
        <div class="profile-details">
          <div class="detail-item">
            <span class="label">Email:</span>
            <span class="value">{profileData.email}</span>
          </div>
          
          {#if profileData.metadata?.name}
            <div class="detail-item">
              <span class="label">Name:</span>
              <span class="value">{profileData.metadata.name}</span>
            </div>
          {/if}
          
          {#if profileData.created_at}
            <div class="detail-item">
              <span class="label">Member Since:</span>
              <span class="value">{new Date(profileData.created_at).toLocaleDateString()}</span>
            </div>
          {/if}
          
          {#if profileData.last_sign_in_at}
            <div class="detail-item">
              <span class="label">Last Login:</span>
              <span class="value">{new Date(profileData.last_sign_in_at).toLocaleString()}</span>
            </div>
          {/if}
          
          {#if profileData.app_metadata?.provider}
            <div class="detail-item">
              <span class="label">Login Method:</span>
              <span class="value">{profileData.app_metadata.provider}</span>
            </div>
          {/if}
          
          {#if profileData.email_confirmed_at}
            <div class="detail-item">
              <span class="label">Email Verified:</span>
              <span class="value verified">✓ Verified on {new Date(profileData.email_confirmed_at).toLocaleDateString()}</span>
            </div>
          {:else}
            <div class="detail-item">
              <span class="label">Email Verified:</span>
              <span class="value not-verified">✗ Not verified</span>
            </div>
          {/if}
        </div>
      </div>
      
      <div class="profile-actions">
        <a href="/profile/payment" class="button">Manage Payment Methods</a>
        <a href="/profile/subscription" class="button">Subscription Settings</a>
      </div>
      
      <div class="security-section" bind:this={securitySection}>
        <h2>Security</h2>
        {#if mfaLoading}
          <div class="loading-indicator">Loading security settings...</div>
        {:else if mfaError}
          <div class="error-text">{mfaError}</div>
          <button class="retry-button" on:click={fetchMfaStatus}>Retry</button>
        {:else}
          <div class="security-card">
            <h3>Two-Factor Authentication</h3>
            <p class="security-description">
              Enable two-factor authentication and enhance the security of your account.
            </p>
            
            <div class="security-detail">
              <div class="status-info">
                <span class="label">Status:</span>
                <span class="value {hasMfaEnabled ? 'status-enabled' : 'status-disabled'}">
                  {hasMfaEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              
              {#if hasMfaEnabled}
                <div class="benefits-list">
                  <div class="benefit-item">✓ Extra layer of protection for your account</div>
                  <div class="benefit-item">✓ No risk of compromised password</div>
                  <div class="benefit-item">✓ Enjoy worry-free learning</div>
                </div>
              {/if}
              
              <button 
                class="toggle-mfa-button {hasMfaEnabled ? 'disable-button' : 'enable-button'}" 
                on:click={toggleMfa}
              >
                {hasMfaEnabled ? 'Disable 2FA' : 'Enable Two Factor Authentication'}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <form on:submit|preventDefault={handleSubmit}>
      {#if error}
        <div class="error-message">{error}</div>
      {/if}
      
      <div class="form-group">
        <label for="name">Full Name</label>
        <input 
          type="text" 
          id="name" 
          bind:value={name} 
          placeholder="Enter your full name"
          disabled={loading}
        />
      </div>
      
      <div class="form-group">
        <label for="email">Email Address</label>
        <input 
          type="email" 
          id="email" 
          bind:value={email} 
          placeholder="Enter your email"
          autocomplete="username"
          disabled={loading}
        />
      </div>
      
      <div class="form-group">
        <label for="password">Password</label>
        <input 
          type="password" 
          id="password" 
          bind:value={password} 
          placeholder="Enter your password"
          autocomplete="new-password"
          disabled={loading}
        />
      </div>
      
      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input 
          type="password" 
          id="confirmPassword" 
          bind:value={confirmPassword} 
          placeholder="Confirm your password"
          autocomplete="new-password"
          disabled={loading}
        />
      </div>
      
      <div class="form-group checkbox">
        <input 
          type="checkbox" 
          id="consent" 
          bind:checked={consent} 
          disabled={loading}
        />
        <label for="consent">I agree to the terms and conditions</label>
      </div>
      
      <button 
        type="submit" 
        class="submit-button" 
        disabled={loading}
      >
        {loading ? 'Creating Profile...' : 'Create Profile'}
      </button>
    </form>
  {/if}
</div>

<style>
  .container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
    background-color: #f9f9f9;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  h1 {
    margin-bottom: 1.5rem;
    color: #333;
    text-align: center;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  
  input[type="text"],
  input[type="email"],
  input[type="password"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .checkbox {
    display: flex;
    align-items: center;
  }
  
  .checkbox input {
    margin-right: 0.75rem;
  }
  
  .checkbox label {
    margin-bottom: 0;
  }
  
  .error-message {
    padding: 0.75rem;
    margin-bottom: 1.5rem;
    background-color: #fff5f5;
    color: #e53e3e;
    border-radius: 4px;
    border-left: 4px solid #e53e3e;
  }
  
  .success-message {
    padding: 1.5rem;
    background-color: #f0fff4;
    color: #38a169;
    border-radius: 4px;
    border-left: 4px solid #38a169;
    margin-bottom: 1.5rem;
  }
  
  .submit-button {
    width: 100%;
    padding: 0.75rem;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .submit-button:hover {
    background-color: #3182ce;
  }
  
  .submit-button:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
  
  .profile-data {
    margin-top: 1.5rem;
    padding: 1rem;
    background-color: #edf2f7;
    border-radius: 4px;
    overflow-x: auto;
  }
  
  .profile-data pre {
    margin: 0;
    white-space: pre-wrap;
  }
  
  .button {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background-color: #4299e1;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: 500;
    text-align: center;
  }
  
  .button:hover {
    background-color: #3182ce;
  }
  
  .profile-info {
    background-color: #f5f7fa;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  }
  
  .profile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .profile-header h2 {
    margin: 0;
    color: #2d3748;
  }
  
  .logout-button {
    background-color: #f56565;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .logout-button:hover {
    background-color: #e53e3e;
  }
  
  .profile-card {
    background-color: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .profile-details {
    margin: 0;
  }
  
  .detail-item {
    display: flex;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .detail-item:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  
  .label {
    font-weight: 600;
    width: 150px;
    color: #555;
  }
  
  .value {
    flex: 1;
  }
  
  .verified {
    color: #38a169;
  }
  
  .not-verified {
    color: #e53e3e;
  }
  
  .profile-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }
  
  .loading {
    text-align: center;
    padding: 2rem;
    color: #666;
  }
  
  .profile-completion {
    margin-top: 2rem;
    width: 100%;
    max-width: 800px;
  }
  
  .sign-check-form {
    max-width: 500px;
    margin: 0 auto;
    padding: 2rem;
    border-radius: 10px;
    background-color: white;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .sign-check-form h1 {
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
  }
  
  .security-section {
    margin-top: 2rem;
  }
  
  .security-card {
    background-color: white;
    padding: 1.5rem;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .security-description {
    margin-bottom: 1rem;
    color: #555;
  }
  
  .security-detail {
    margin-bottom: 1rem;
  }
  
  .status-info {
    display: flex;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .status-info .label {
    font-weight: 600;
    width: 150px;
    color: #555;
  }
  
  .status-enabled {
    color: #38a169;
  }
  
  .status-disabled {
    color: #e53e3e;
  }
  
  .benefits-list {
    margin-bottom: 1rem;
  }
  
  .benefit-item {
    margin-bottom: 0.5rem;
    color: #555;
  }
  
  .toggle-mfa-button {
    margin-left: 1rem;
    padding: 0.5rem 1rem;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .toggle-mfa-button:hover {
    background-color: #3182ce;
  }
  
  .disable-button {
    background-color: #f56565;
  }
  
  .disable-button:hover {
    background-color: #e53e3e;
  }
  
  .enable-button {
    background-color: #3b82f6;
  }
  
  .enable-button:hover {
    background-color: #2563eb;
  }
  
  .loading-indicator {
    text-align: center;
    padding: 1rem;
    color: #666;
  }
  
  .error-text {
    color: #e53e3e;
    margin-bottom: 1rem;
  }
  
  .retry-button {
    padding: 0.5rem 1rem;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .retry-button:hover {
    background-color: #3182ce;
  }
</style>

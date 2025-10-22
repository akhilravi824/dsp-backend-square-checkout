<script lang="ts">
  import { onMount } from 'svelte';
  import { paymentMethodApi, squarePaymentApi } from '$lib/api';
  
  // Form state
  let userId = '';
  let cardElement: any = null;
  let paymentsInstance: any = null;
  let loading = false;
  let error = '';
  let success = false;
  let savedMethods: any[] = [];
  let showSavedMethods = false;
  
  // Square configuration
  const squareApplicationId = 'sandbox-sq0idb-EXAMPLE_APP_ID'; // Replace with your Square app ID
  const squareLocationId = 'EXAMPLE_LOCATION_ID'; // Replace with your location ID
  
  onMount(async () => {
    try {
      // Initialize Square Web Payments SDK
      paymentsInstance = await squarePaymentApi.initializePayments(
        squareApplicationId,
        squareLocationId
      );
      
      // Create card input
      cardElement = await squarePaymentApi.createCardPaymentMethod(paymentsInstance, {
        // Optional card input styles
        style: {
          input: {
            color: '#333',
            fontSize: '16px'
          },
          'input::placeholder': {
            color: '#aaa'
          },
          '.input-container': {
            borderColor: '#ddd',
            borderRadius: '4px'
          }
        }
      });
      
      console.log('Square payment form initialized');
    } catch (err: any) {
      error = 'Failed to initialize payment form';
      console.error('Error initializing Square payment form:', err);
    }
  });
  
  const handleSubmit = async () => {
    if (!userId) {
      error = 'User ID is required';
      return;
    }
    
    if (!cardElement) {
      error = 'Payment form not initialized';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      // Tokenize the card
      const tokenResult = await cardElement.tokenize();
      
      if (tokenResult.status === 'OK') {
        // Get card info for display (last 4 digits, expiry)
        const cardInfo = {
          paymentMethodId: tokenResult.token,
          type: 'card',
          lastFour: tokenResult.details?.card?.last4 || undefined,
          expiryMonth: tokenResult.details?.card?.expMonth || undefined,
          expiryYear: tokenResult.details?.card?.expYear || undefined
        };
        
        // Save card reference to user profile
        const response = await paymentMethodApi.addPaymentMethod(userId, cardInfo);
        
        success = true;
        console.log('Payment method added:', response.data);
      } else {
        error = tokenResult.errors[0]?.message || 'Card tokenization failed';
      }
    } catch (err: any) {
      error = err.response?.data?.message || 'Failed to add payment method';
      console.error('Error adding payment method:', err);
    } finally {
      loading = false;
    }
  };
  
  const loadPaymentMethods = async () => {
    if (!userId) {
      error = 'User ID is required';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      const response = await paymentMethodApi.getUserPaymentMethods(userId);
      savedMethods = response.data.data || [];
      showSavedMethods = true;
    } catch (err: any) {
      error = err.response?.data?.message || 'Failed to load payment methods';
      console.error('Error loading payment methods:', err);
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>Manage Payment Methods</title>
  <script type="text/javascript" src="https://sandbox.web.squarecdn.com/v1/square.js"></script>
</svelte:head>

<div class="container">
  <h1>Manage Payment Methods</h1>
  
  {#if error}
    <div class="error-message">{error}</div>
  {/if}
  
  {#if success}
    <div class="success-message">
      <h2>Payment Method Added!</h2>
      <p>Your payment method has been successfully stored.</p>
      <button class="button secondary" on:click={() => success = false}>Add Another</button>
    </div>
  {/if}
  
  <div class="form-section">
    <h2>Enter User ID</h2>
    <p class="help-text">Enter the user ID from your profile creation step to add a payment method.</p>
    
    <div class="form-group">
      <label for="userId">User ID</label>
      <input 
        type="text" 
        id="userId" 
        bind:value={userId} 
        placeholder="Enter user ID"
        disabled={loading}
      />
    </div>
    
    <div class="button-group">
      <button 
        class="button secondary" 
        on:click={loadPaymentMethods} 
        disabled={loading || !userId}
      >
        View Saved Methods
      </button>
    </div>
  </div>
  
  {#if showSavedMethods}
    <div class="saved-methods">
      <h2>Saved Payment Methods</h2>
      
      {#if savedMethods.length === 0}
        <p>No payment methods found for this user.</p>
      {:else}
        <ul class="method-list">
          {#each savedMethods as method, i}
            <li class="method-item">
              <div class="method-type">{method.type}</div>
              {#if method.type === 'card' && method.lastFour}
                <div class="method-details">
                  <span class="card-last4">•••• {method.lastFour}</span>
                  {#if method.expiryMonth && method.expiryYear}
                    <span class="card-expiry">Expires: {method.expiryMonth}/{method.expiryYear}</span>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  
  <div class="payment-form">
    <h2>Add Payment Method</h2>
    
    <div class="form-group">
      <label for="card-input">Card Details</label>
      <div id="card-container" aria-labelledby="card-input"></div>
      <input type="hidden" id="card-input" />
    </div>
    
    <button 
      class="button primary" 
      on:click={handleSubmit} 
      disabled={loading || !userId}
    >
      {loading ? 'Adding Payment Method...' : 'Save Payment Method'}
    </button>
  </div>
  
  <div class="navigation">
    <a href="/profile" class="back-link">← Back to Profile</a>
  </div>
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
  
  h1, h2 {
    color: #333;
  }
  
  h1 {
    margin-bottom: 1.5rem;
    text-align: center;
  }
  
  h2 {
    margin-bottom: 1rem;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  
  input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  #card-container {
    min-height: 100px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.75rem;
    background-color: white;
  }
  
  .button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .button.primary {
    width: 100%;
    background-color: #4299e1;
    color: white;
  }
  
  .button.primary:hover {
    background-color: #3182ce;
  }
  
  .button.secondary {
    background-color: #e2e8f0;
    color: #4a5568;
  }
  
  .button.secondary:hover {
    background-color: #cbd5e0;
  }
  
  .button:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
  
  .button-group {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1.5rem;
  }
  
  .form-section {
    padding-bottom: 1.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .help-text {
    color: #718096;
    margin-bottom: 1rem;
    font-size: 0.875rem;
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
    margin-bottom: 1.5rem;
    background-color: #f0fff4;
    color: #38a169;
    border-radius: 4px;
    border-left: 4px solid #38a169;
  }
  
  .saved-methods {
    margin-bottom: 2rem;
    padding: 1rem;
    background-color: white;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }
  
  .method-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .method-item {
    padding: 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .method-type {
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .method-details {
    color: #4a5568;
  }
  
  .card-last4 {
    margin-right: 1rem;
    font-family: monospace;
  }
  
  .navigation {
    margin-top: 2rem;
    text-align: center;
  }
  
  .back-link {
    color: #4299e1;
    text-decoration: none;
  }
  
  .back-link:hover {
    text-decoration: underline;
  }
  
  .payment-form {
    margin-bottom: 1.5rem;
  }
</style>

<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount, onDestroy } from 'svelte';
  import { subscriptionApi } from '$lib/api';
  
  export let isOpen = false;
  export let onClose: () => void;
  export let isLoading = false;
  export let errorMessage = '';
  export let subscriptionId = '';
  export let squareCustomerId = '';
  
  let _popup: HTMLElement;
  let _overlay: HTMLElement;
  let _content: HTMLElement;
  let card: any = null;
  let cardLoading = false;
  let updateLoading = false;
  let updateSuccess = false;
  let updateMessage = '';
  let cardElement: any = null;
  let payments: any = null;
  
  // Square payment form state
  let showPaymentForm = false;
  let squareApplicationId = '';
  let squareLocationId = '';
  let squareError = '';
  
  // Animation timeline
  let tl: gsap.core.Timeline;
  
  onMount(async () => {
    if (isOpen) {
      animateIn();
      await loadCardDetails();
    }
    
    // Set up key listener for escape key
    document.addEventListener('keydown', handleKeyDown);
  });
  
  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown);
    
    // Clean up Square card element if it exists
    if (cardElement) {
      try {
        cardElement.destroy();
      } catch (error) {
        console.error('Error destroying card element:', error);
      }
    }
  });
  
  // Handle escape key press
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      handleClose();
    }
  }
  
  // Watch for changes to isOpen
  $: if (isOpen) {
    animateIn();
    loadCardDetails();
  } else {
    animateOut();
  }
  
  // Load the customer's current payment method
  async function loadCardDetails() {
    if (!squareCustomerId) return;
    
    cardLoading = true;
    try {
      const response = await subscriptionApi.getPaymentMethod(squareCustomerId);
      if (response.data.success) {
        card = response.data.card;
      } else {
        errorMessage = response.data.message || 'Failed to load payment method';
      }
    } catch (err) {
      console.error('Error loading payment method:', err);
      errorMessage = 'Failed to load payment method. Please try again later.';
    } finally {
      cardLoading = false;
    }
  }
  
  // Initialize Square Web Payments SDK
  async function initializeSquarePayments() {
    showPaymentForm = true;
    updateLoading = true;
    squareError = '';
    
    try {
      // Get Square location ID from backend
      const locationResponse = await subscriptionApi.getSquareLocationId();
      if (!locationResponse.data.success) {
        throw new Error(locationResponse.data.message || 'Failed to get Square location ID');
      }
      
      squareLocationId = locationResponse.data.locationId;
      squareApplicationId = locationResponse.data.applicationId;
      
      // Load Square Web Payments SDK if not already loaded
      if (!window.Square) {
        await loadSquareScript();
      }
      
      if (!window.Square) {
        throw new Error('Failed to load Square Web Payments SDK');
      }
      
      // Initialize Square Payments
      payments = window.Square.payments(squareApplicationId, squareLocationId);
      
      // Create and mount the card element
      cardElement = await payments.card();
      await cardElement.attach('#card-container');
    } catch (error) {
      console.error('Error initializing Square payments:', error);
      squareError = error instanceof Error ? error.message : 'Failed to initialize payment form';
    } finally {
      updateLoading = false;
    }
  }
  
  // Load Square Web Payments SDK script
  function loadSquareScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://sandbox.web.squarecdn.com/v1/square.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Square script'));
      document.body.appendChild(script);
    });
  }
  
  // Handle payment form submission
  async function handlePaymentFormSubmit() {
    if (!cardElement || !subscriptionId) return;
    
    updateLoading = true;
    updateMessage = '';
    squareError = '';
    errorMessage = ''; // Clear any existing error messages
    
    try {
      // Get a payment token from Square
      const result = await cardElement.tokenize();
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Failed to process card');
      }
      
      // Send the source ID to the backend to update the payment method
      const response = await subscriptionApi.updatePaymentMethod(subscriptionId, result.token);
      
      if (response.data.success) {
        updateSuccess = true;
        updateMessage = response.data.message || 'Payment method updated successfully';
        card = response.data.card;
        showPaymentForm = false;
        
        // Destroy the card element
        if (cardElement) {
          cardElement.destroy();
          cardElement = null;
        }
      } else {
        throw new Error(response.data.message || 'Failed to update payment method');
      }
    } catch (error) {
      console.error('Error updating payment method:', error);
      squareError = error instanceof Error ? error.message : 'Failed to update payment method';
      updateSuccess = false;
    } finally {
      updateLoading = false;
    }
  }
  
  // Cancel payment form
  function cancelPaymentForm() {
    showPaymentForm = false;
    
    // Destroy the card element
    if (cardElement) {
      cardElement.destroy();
      cardElement = null;
    }
  }
  
  // Animation functions
  function animateIn() {
    if (!_popup || !_overlay || !_content) return;
    
    if (tl) tl.kill();
    
    tl = gsap.timeline();
    tl.set(_popup, { display: 'flex' });
    tl.set(_content, { y: 20, opacity: 0 });
    tl.to(_overlay, { opacity: 1, duration: 0.2 });
    tl.to(_content, { y: 0, opacity: 1, duration: 0.3 });
  }
  
  function animateOut() {
    if (!_popup || !_overlay || !_content) return;
    
    if (tl) tl.kill();
    
    tl = gsap.timeline({
      onComplete: () => {
        gsap.set(_popup, { display: 'none' });
      }
    });
    
    tl.to(_content, { y: 20, opacity: 0, duration: 0.2 });
    tl.to(_overlay, { opacity: 0, duration: 0.2 });
  }
  
  // Handle close button click
  function handleClose() {
    if (updateLoading) return; // Prevent closing during update
    onClose();
  }
</script>

<div 
  class="popup-container" 
  class:open={isOpen} 
  bind:this={_popup} 
  style="display: none;"
>
  <div 
    class="popup-overlay" 
    bind:this={_overlay} 
    on:click={handleClose} 
    on:keydown={event => event.key === 'Enter' && handleClose()}
    role="button"
    tabindex="0"
    aria-label="Close popup"
  ></div>
  <div class="popup-content" bind:this={_content}>
    <button class="close-button" on:click={handleClose} aria-label="Close">
      &times;
    </button>
    
    <h2>Billing Information</h2>
    
    {#if errorMessage}
      <div class="error-message">
        {errorMessage}
      </div>
    {/if}
    
    {#if updateMessage && updateSuccess}
      <div class="success-message">
        {updateMessage}
      </div>
    {/if}
    
    {#if cardLoading || isLoading}
      <div class="loading">
        Loading payment information...
      </div>
    {:else if showPaymentForm}
      <div class="payment-form">
        <h3>Update Payment Method</h3>
        
        {#if squareError}
          <div class="error-message">
            {squareError}
          </div>
        {/if}
        
        <div id="card-container"></div>
        
        <div class="form-actions">
          <button 
            class="button secondary" 
            on:click={cancelPaymentForm}
            disabled={updateLoading}
          >
            Cancel
          </button>
          <button 
            class="button primary" 
            on:click={handlePaymentFormSubmit}
            disabled={updateLoading}
          >
            {updateLoading ? 'Processing...' : 'Update Payment Method'}
          </button>
        </div>
      </div>
    {:else}
      <div class="payment-details">
        <h3>Current Payment Method</h3>
        
        {#if card}
          <div class="card-details">
            <div class="card-info">
              <div class="card-type">{card.brand}</div>
              <div class="card-number">•••• {card.last4}</div>
              <div class="card-expiry">Expires {card.expMonth}/{card.expYear}</div>
            </div>
          </div>
        {:else}
          <p>No payment method on file.</p>
        {/if}
        
        <button 
          class="button primary" 
          on:click={initializeSquarePayments}
          disabled={updateLoading}
        >
          {updateLoading ? 'Loading...' : 'Update Payment Method'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .popup-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .popup-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    opacity: 0;
    cursor: pointer;
  }
  
  .popup-content {
    position: relative;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    background-color: white;
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 1001;
  }
  
  .close-button {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #64748b;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }
  
  .close-button:hover {
    color: #1e293b;
  }
  
  h2 {
    font-size: 1.5rem;
    margin-top: 0;
    margin-bottom: 1.5rem;
    color: #1e293b;
  }
  
  h3 {
    font-size: 1.25rem;
    margin-top: 0;
    margin-bottom: 1rem;
    color: #334155;
  }
  
  .loading {
    text-align: center;
    padding: 2rem 0;
    color: #64748b;
  }
  
  .error-message {
    background-color: #fee2e2;
    color: #b91c1c;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  
  .success-message {
    background-color: #dcfce7;
    color: #166534;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  
  .payment-details {
    margin-bottom: 1.5rem;
  }
  
  .card-details {
    background-color: #f8fafc;
    border-radius: 6px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }
  
  .card-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .card-type {
    font-weight: 600;
    color: #334155;
  }
  
  .card-number {
    font-family: monospace;
    letter-spacing: 0.1em;
    color: #475569;
  }
  
  .card-expiry {
    color: #64748b;
    font-size: 0.875rem;
  }
  
  .payment-form {
    margin-bottom: 1.5rem;
  }
  
  #card-container {
    min-height: 100px;
    margin-bottom: 1.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 1rem;
  }
  
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .primary {
    background-color: #3b82f6;
    color: white;
  }
  
  .primary:hover:not(:disabled) {
    background-color: #2563eb;
  }
  
  .secondary {
    background-color: #e2e8f0;
    color: #475569;
  }
  
  .secondary:hover:not(:disabled) {
    background-color: #cbd5e0;
  }
</style>

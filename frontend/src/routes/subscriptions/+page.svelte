<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { gsap } from 'gsap';
  import { profileApi, subscriptionApi, paymentApi, squarePaymentApi } from '$lib/api';

  // Define more detailed types to fix TypeScript errors
  type SubscriptionVariation = {
    variationId: string;
    name?: string;
    price: number;
    formattedPrice: string;
    formattedMonthlyPrice: string;
    formattedTotalPrice: string;
    interval: string;
    formattedInterval: string;
    basePrice?: number;
    monthlyPrice?: number;
    totalPrice?: number;
    discountPercent?: number;
    hasDiscount?: boolean;
    currency?: string;
    formattedBasePrice?: string;
    phases?: any[];
  };
  
  type SubscriptionPlan = {
    id: string;
    name: string;
    description: string;
    active?: boolean;
    variations?: SubscriptionVariation[];
    price?: number;
    formattedPrice?: string;
    formattedMonthlyPrice?: string;
    formattedTotalPrice?: string;
    interval?: string;
    formattedInterval?: string;
    trial?: boolean;
    originalPlanId?: string;
    variation?: SubscriptionVariation;
  };
  
  // Reactive state variables
  let plans: SubscriptionPlan[] = [];
  let loading = true;
  let error: string | null = null;
  let selectedPlanId: string | null = null;
  let showCardForm = false;
  let cardFormMounted = false;
  let paymentInProgress = false;
  let paymentError: string | null = null;
  let userProfile: any = null;
  
  // Square payment variables
  let squareAppId: string = '';
  let squareLocationId: string = '';
  let paymentsInstance: any = null;
  let card: any = null;
  let applePay: any = null;
  let isApplePaySupported = false;
  
  // Helper functions
  function isAnnualPlan(planName: string): boolean {
    if (!planName) return false;
    const lowerName = planName.toLowerCase();
    return lowerName.includes('annual') || lowerName.includes('yearly');
  }
  
  function getPlanDescription(plan: SubscriptionPlan): string {
    if (plan.description) return plan.description;
    
    if (plan.trial) {
      return 'Start with a free trial to explore all features';
    }
    
    const planType = plan.name.toLowerCase();
    if (planType.includes('monthly')) {
      return 'A monthly plan for those who prefer flexibility';
    } else if (planType.includes('annual') || planType.includes('yearly')) {
      return 'Our best value! Annual plan with significant savings';
    } else if (planType.includes('semester')) {
      return 'Semester plan for students or seasonal learners';
    }
    
    return 'Access to premium content and features';
  }
  
  function selectPlan(planId: string): void {
    selectedPlanId = planId;
    
    // Animate the selected card
    const selectedCard = document.querySelector(`.plan-${planId}`);
    if (selectedCard) {
      gsap.from(selectedCard, {
        scale: 1.05,
        duration: 0.3,
        ease: "power2.out"
      });
    }
  }
  
  function handleKeyDown(event: KeyboardEvent, planId: string): void {
    // Select plan on Enter or Space key
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectPlan(planId);
    }
  }

  async function initializeSquarePayments() {
    try {
      // Reset any previous errors
      paymentError = null;
      paymentInProgress = true;

      // First get Square configuration
      try {
        const locationResponse = await paymentApi.getLocations();
        if (!locationResponse.data || !locationResponse.data.applicationId || !locationResponse.data.locationId) {
          throw new Error('Unable to get Square configuration from backend');
        }
        
        squareAppId = locationResponse.data.applicationId;
        squareLocationId = locationResponse.data.locationId;
        
        console.log(`Using Square config - AppID: ${squareAppId}, LocationID: ${squareLocationId}`);
      } catch (configErr) {
        console.error('Failed to load Square configuration:', configErr);
        throw new Error('Unable to load payment configuration');
      }
      
      // Get user profile if needed
      if (!userProfile) {
        try {
          const profileResponse = await profileApi.getProfile();
          userProfile = profileResponse.data;
        } catch (profileErr) {
          console.error('Failed to load user profile:', profileErr);
          throw new Error('Unable to load your profile. Please try again.');
        }
      }

      // Show card form UI first (this makes the container available in DOM)
      showCardForm = true;
      
      // Wait for DOM to update with GSAP
      await new Promise<void>(resolve => {
        gsap.delayedCall(0.3, resolve);
      });
      
      // Initialize Square Web Payments SDK
      paymentsInstance = await squarePaymentApi.initializePayments(squareAppId, squareLocationId);
      
      // Make sure card container is ready
      const cardContainer = document.getElementById('card-container');
      if (!cardContainer) {
        console.error('Card container not found in DOM after showCardForm=true');
        throw new Error('Card container element not available');
      }
      
      // Create and attach the card payment method
      card = await squarePaymentApi.createCardPaymentMethod(paymentsInstance);
      cardFormMounted = true;
      
      // Check if Apple Pay is supported
      isApplePaySupported = await squarePaymentApi.isApplePaySupported(paymentsInstance);
      
      // Animate the card form appearing
      const cardFormElement = document.querySelector('.card-container');
      if (cardFormElement) {
        gsap.from(cardFormElement, {
          opacity: 0,
          y: 10,
          duration: 0.4,
          ease: "power2.out"
        });
      }
      
      paymentInProgress = false;
      return true;
    } catch (err: any) {
      console.error('Error initializing Square payments:', err);
      paymentError = err.message || 'Unable to initialize payment form. Please try again.';
      paymentInProgress = false;
      return false;
    }
  }
  
  async function processSubscription() {
    if (!selectedPlanId || !plans.length) return;
    
    // Handle free trial selection - just redirect to dashboard
    if (selectedPlanId === 'trial') {
      goto('/dashboard');
      return;
    }
    
    // For paid plans, we need to process payment
    paymentInProgress = true;
    
    try {
      // Create a loading animation with GSAP
      const paymentContainer = document.querySelector('.payment-container');
      if (paymentContainer) {
        gsap.to(paymentContainer, {
          opacity: 0.7,
          duration: 0.3
        });
      }
      
      // Initialize payments if not already done
      if (!card || !cardFormMounted) {
        const initialized = await initializeSquarePayments();
        if (!initialized) {
          paymentInProgress = false;
          return;
        }
      }
      
      // Get the selected plan
      const selectedPlanObj = plans.find(p => p.id === selectedPlanId);
      if (!selectedPlanObj || !selectedPlanObj.variation) {
        throw new Error('Invalid plan selected');
      }
      
      // Process payment to get payment source token
      try {
        const tokenResult = await card.tokenize();
        if (tokenResult.status !== 'OK') {
          throw new Error(tokenResult.errors || 'Card tokenization failed');
        }
        
        // Create subscription with the backend handling all Square operations
        const subscriptionResponse = await subscriptionApi.createSubscription(
          selectedPlanObj.originalPlanId || '',
          tokenResult.token,
          userProfile.data.id,
          selectedPlanObj.id // Pass the variation ID
        );
        
        if (!subscriptionResponse.data?.success) {
          throw new Error(subscriptionResponse.data?.message || 'Failed to create subscription');
        }
        
        // Show success message and redirect
        goto('/dashboard');
      } catch (paymentErr: any) {
        console.error('Payment processing error:', paymentErr);
        throw new Error(paymentErr.message || 'Payment processing failed');
      }
    } catch (err: any) {
      console.error('Subscription payment failed:', err);
      paymentError = err.message || 'Payment failed. Please try again.';
      
      // Restore opacity if there was an error
      const paymentContainer = document.querySelector('.payment-container');
      if (paymentContainer) {
        gsap.to(paymentContainer, {
          opacity: 1,
          duration: 0.3
        });
      }
    } finally {
      paymentInProgress = false;
    }
  }

  async function processApplePayment() {
    if (!selectedPlanId || !plans.length) return;
    
    // For paid plans, we need to process payment
    paymentInProgress = true;
    
    try {
      // Create a loading animation with GSAP
      const paymentContainer = document.querySelector('.payment-container');
      if (paymentContainer) {
        gsap.to(paymentContainer, {
          opacity: 0.7,
          duration: 0.3
        });
      }
      
      // Get the selected plan
      const selectedPlanObj = plans.find(p => p.id === selectedPlanId);
      if (!selectedPlanObj || !selectedPlanObj.variation) {
        throw new Error('Invalid plan selected');
      }
      
      // Format the amount for display
      const amount = selectedPlanObj.variation.price.toString();
      const formattedAmount = selectedPlanObj.variation.formattedPrice;
      
      // Initialize Apple Pay if not already done
      if (!applePay) {
        applePay = await squarePaymentApi.createApplePayMethod(paymentsInstance, {
          total: {
            amount: amount,
            label: `Dawn Sign Press - ${selectedPlanObj.name}`
          },
          currencyCode: 'USD'
        });
      }
      
      // Process the Apple Pay payment
      const applePayResult = await squarePaymentApi.processApplePayment(applePay);
      
      if (applePayResult.status === 'OK') {
        // Create subscription with the backend handling all Square operations
        const subscriptionResponse = await subscriptionApi.createSubscription(
          selectedPlanObj.originalPlanId || '',
          applePayResult.token,
          userProfile.data.id,
          selectedPlanObj.id // Pass the variation ID
        );
        
        if (!subscriptionResponse.data?.success) {
          throw new Error(subscriptionResponse.data?.message || 'Failed to create subscription');
        }
        
        // Show success message and redirect
        goto('/dashboard');
      } else {
        throw new Error('Apple Pay payment failed');
      }
    } catch (err: any) {
      console.error('Apple Pay payment failed:', err);
      paymentError = err.message || 'Payment failed. Please try again.';
      
      // Restore opacity if there was an error
      const paymentContainer = document.querySelector('.payment-container');
      if (paymentContainer) {
        gsap.to(paymentContainer, {
          opacity: 1,
          duration: 0.3
        });
      }
    } finally {
      paymentInProgress = false;
    }
  }

  onMount(async () => {
    try {
      loading = true;
      error = null;
      
      // Fetch subscription plans from the API
      const response = await subscriptionApi.getSubscriptionPlans();
      
      if (response && response.data && response.data.objects) {
        console.log('API response:', response);
        
        // Process subscription plans from API
        const plansFromApi = response.data.objects;
        
        if (plansFromApi && plansFromApi.length > 0) {
          // Transform the plan variations into separate plans for display
          const transformedPlans: SubscriptionPlan[] = [];
          
          plansFromApi.forEach((plan: any) => {
            if (plan.variations && plan.variations.length > 0) {
              // Create a separate plan for each variation
              plan.variations.forEach((variation: any) => {
                const variationPlan: SubscriptionPlan = {
                  id: variation.variationId, // Use variation ID as the plan ID
                  name: variation.formattedInterval, // Use interval as the plan name
                  description: plan.description || '',
                  active: plan.active !== false,
                  price: variation.price,
                  formattedPrice: variation.formattedPrice,
                  formattedMonthlyPrice: variation.formattedMonthlyPrice,
                  formattedTotalPrice: variation.formattedTotalPrice,
                  interval: variation.interval,
                  formattedInterval: variation.formattedInterval,
                  originalPlanId: plan.id, // Keep reference to original plan
                  variation: variation // Store the full variation data
                };
                transformedPlans.push(variationPlan);
              });
            } else {
              // If no variations, add the plan as is
              transformedPlans.push({
                id: plan.id,
                name: plan.name || 'Subscription Plan',
                description: plan.description || '',
                active: plan.active !== false,
                price: plan.price,
                formattedPrice: plan.formattedPrice
              });
            }
          });
          
          plans = transformedPlans;
          console.log('Transformed plans data:', plans);
        }
        
        console.log('Loaded plans from Square:', plans);
        
        // Add trial plan as the first option if not already present
        if (!plans.some(p => p.id === 'trial')) {
          plans.unshift({
            id: 'trial',
            name: 'Trial',
            description: 'Get started with 3 free lessons on the platform',
            trial: true,
            active: true,
            variations: []
          });
        }
        
        // Set default selected variations
        plans.forEach(plan => {
          if (plan.variations && plan.variations.length > 0) {
            // Default to the first variation
          }
        });
        
        // Auto-select trial plan by default
        if (plans.length > 0) {
          selectPlan('trial');
        }
      } else {
        console.error('No plans found in response:', response);
        // If no plans received, use default trial plan
        plans = [{
          id: 'trial',
          name: 'Trial',
          description: 'Get started with 3 free lessons on the platform',
          trial: true,
          active: true,
          variations: []
        }];
      }
    } catch (error) {
      console.error('Error loading subscription plans:', error);
      plans = [{
        id: 'trial',
        name: 'Trial',
        description: 'Get started with 3 free lessons on the platform',
        trial: true,
        active: true,
        variations: []
      }];
    } finally {
      loading = false;
    }
  });

  onMount(() => {
    // Ensure we have DOM references for the containers
    const paymentContainer = document.querySelector('.payment-container');
  });

  onDestroy(() => {
    // Clean up any resources, like card instance
    if (card) {
      try {
        card.destroy();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  });
</script>

<style>
  .subscription-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: #e8f0ff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .title {
    font-size: 2rem;
    font-weight: 600;
    color: #333;
  }
  
  .subtitle {
    font-size: 1rem;
    color: #718096;
    margin-bottom: 2rem;
  }
  
  .loading-container, .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin: 2rem auto;
    max-width: 500px;
  }
  
  .loading-spinner {
    margin: 1rem auto;
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top-color: #3182ce;
    animation: spin 1s ease-in-out infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .plans-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 3rem;
    width: 100%;
  }
  
  .plan-card {
    background-color: white;
    border-radius: 15px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    position: relative;
    cursor: pointer;
    transition: all 0.2s ease;
    height: 100%;
    border: 2px solid transparent;
  }
  
  .plan-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
  }
  
  .plan-card.selected {
    border-color: #3182ce;
    box-shadow: 0 0 0 2px rgba(49, 130, 206, 0.3);
  }
  
  .most-value-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: #3182ce;
    color: white;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 20px;
  }
  
  .plan-name {
    font-size: 1.3rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #2d3748;
  }
  
  .plan-subtitle {
    font-size: 0.9rem;
    color: #718096;
    margin-bottom: 1.5rem;
  }
  
  .price, .price-free {
    font-size: 1.8rem;
    font-weight: 700;
    color: #2d3748;
    margin-bottom: 0.5rem;
  }
  
  .month-equiv {
    font-size: 0.8rem;
    color: #718096;
    font-weight: normal;
  }
  
  .save-banner {
    font-size: 0.8rem;
    color: #4299e1;
    margin-bottom: 1rem;
  }
  
  .price-details {
    font-size: 0.8rem;
    color: #718096;
    margin-bottom: 1rem;
  }
  
  .features-list {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0 0 0;
  }
  
  .features-list li {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }
  
  .check-icon {
    color: #38b2ac;
    margin-right: 0.5rem;
    font-weight: bold;
  }
  
  .action-container {
    margin-top: 2rem;
    text-align: center;
  }

  .pay-button {
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 30px;
    padding: 0.75rem 2rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s, transform 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 48px;
    margin: 1rem 0;
  }
  
  .arrow-only-button {
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 50%;
  }
  
  .arrow-icon {
    font-size: 1.5rem;
    margin-left: 1rem;
  }
  
  .arrow-only-button .arrow-icon {
    margin-left: 0;
  }
  
  .pay-button:hover {
    background-color: #2c5282;
    transform: translateY(-2px);
  }
  
  .change-info {
    text-align: center;
    font-size: 0.9rem;
    color: #718096;
  }
  
  .payment-container {
    width: 100%;
    max-width: 500px;
    margin: 2rem auto 0;
    clear: both;
  }
  
  .card-container {
    padding: 1.5rem;
    background-color: white;
    border-radius: 15px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-bottom: 1rem;
  }
  
  .card-info {
    font-size: 0.8rem;
    color: #718096;
    text-align: center;
    margin-top: 0.5rem;
  }
  
  .subscribe-button {
    background-color: #3182ce;
    color: white;
    border: none;
    border-radius: 30px;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    width: 100%;
    margin-top: 1rem;
    transition: all 0.2s ease;
  }
  
  .subscribe-button:hover {
    background-color: #2c5282;
    transform: translateY(-2px);
  }
  
  .try-again-button, .retry-button {
    background-color: #3182ce;
    color: white;
    border: none;
    border-radius: 30px;
    padding: 0.5rem 1.5rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 1rem;
  }
  
  .try-again-button:hover, .retry-button:hover {
    background-color: #2c5282;
  }
  
  .apple-pay-button {
    background-color: #000;
    color: white;
    border: none;
    border-radius: 30px;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    width: 100%;
    margin-top: 1rem;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .apple-pay-button:hover {
    background-color: #333;
    transform: translateY(-2px);
  }
  
  .apple-pay-icon {
    margin-right: 0.5rem;
  }
  
  .payment-divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 1rem 0;
    color: #718096;
  }
  
  .payment-divider::before,
  .payment-divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid #E2E8F0;
  }
  
  .payment-divider span {
    padding: 0 0.5rem;
    font-size: 0.8rem;
  }
  
  @media (max-width: 1024px) {
    .plans-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  
  @media (max-width: 600px) {
    .plans-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="subscription-container">
  <h1 class="title">Choose Your Subscription Plan</h1>
  <p class="subtitle">Select the plan that works best for you</p>
  
  {#if loading}
    <div class="loading-container">
      <p>Loading subscription plans...</p>
      <div class="loading-spinner"></div>
    </div>
  {:else if error}
    <div class="error-container">
      <p>Sorry, we couldn't load the subscription plans. Please try again later.</p>
      <button class="retry-button" on:click={() => window.location.reload()}>Try Again</button>
    </div>
  {:else}
    <div class="plans-grid">
      {#each plans as plan, planIndex}
        <div 
          class="plan-card plan-{plan.id} {selectedPlanId === plan.id ? 'selected' : ''} {plan.interval === 'yearly' ? 'most-value' : ''}" 
          on:click={() => selectPlan(plan.id)} 
          on:keydown={(event) => handleKeyDown(event, plan.id)}
          tabindex="0"
          role="button"
          aria-pressed={selectedPlanId === plan.id}
        >
          {#if plan.interval === 'yearly'}
            <div class="most-value-badge">Best Value</div>
          {/if}
          
          <h3 class="plan-name">{plan.name}</h3>
          <p class="plan-subtitle">{plan.description || getPlanDescription(plan)}</p>
          
          {#if plan.trial}
            <div class="price-free">
              Free <span class="month-equiv">/month equiv.</span>
            </div>
            <p>Get started with 3 free lessons on the platform.</p>
          {:else if plan.variation}
            <div class="price">
              {plan.variation.formattedMonthlyPrice} <span class="month-equiv">/month equiv.</span>
            </div>
            
            {#if plan.interval === 'monthly'}
              <div class="price-details">
                Billed monthly at {plan.variation.formattedPrice}
              </div>
            {:else if plan.interval === 'semester'}
              <div class="save-banner">
                Save 16% compared to monthly
              </div>
              <div class="price-details">
                Billed every 6 months at {plan.variation.formattedTotalPrice}
              </div>
            {:else if plan.interval === 'yearly'}
              <div class="save-banner">
                Save 25% compared to monthly
              </div>
              <div class="price-details">
                Billed annually at {plan.variation.formattedTotalPrice}
              </div>
            {/if}
          {:else}
            <div class="price">
              {plan.formattedPrice || '$0.00'} <span class="month-equiv">/month equiv.</span>
            </div>
          {/if}
          
          <ul class="features-list">
            <li>
              <span class="check-icon">✓</span>
              Access to all 500 signs
            </li>
            <li>
              <span class="check-icon">✓</span>
              Interactive quizzes
            </li>
            <li>
              <span class="check-icon">✓</span>
              Advanced sign recognition
            </li>
          </ul>
        </div>
      {/each}
    </div>
    
    {#if paymentError}
      <div class="error-container">
        <p>{paymentError}</p>
        <button class="try-again-button" on:click={() => { paymentError = null; }}>Try Again</button>
      </div>
    {:else if !showCardForm}
      <div class="action-container">
        {#if selectedPlanId === 'trial'}
          <button class="pay-button arrow-only-button" on:click={() => goto('/dashboard')}>
            <span class="arrow-icon">→</span>
          </button>
          <p class="change-info">You can upgrade to a paid plan anytime from your dashboard.</p>
        {:else}
          <button class="pay-button" on:click={initializeSquarePayments}>
            Pay with Square <span class="arrow-icon">→</span>
          </button>
          <p class="change-info">You can always change your plan at a later point.</p>
        {/if}
      </div>
    {:else}
      <div class="payment-container">
        <div class="card-container">
          <!-- Card container is always present but only shown when needed -->
          <div id="card-container" style="min-height: 100px; width: 100%; border: 1px solid #E2E8F0; border-radius: 4px; padding: 12px; background: white;"></div>
          
          {#if cardFormMounted}
            <button class="subscribe-button" on:click={processSubscription}>
              Subscribe Now
            </button>
            
            {#if isApplePaySupported}
              <div class="payment-divider">
                <span>or</span>
              </div>
              <button class="apple-pay-button" on:click={processApplePayment}>
                <span class="apple-pay-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 7c-3 0-4 3-4 5.5 0 3 2 7.5 4 7.5 1.088-.046 1.679-.5 3-.5 1.312 0 1.5.5 3 .5s4-3 4-5c-.028-.01-2.472-.403-2.5-3 0-2.355 2.064-3.36 2.5-3.5-1.023-1.492-2.951-1.963-3.5-2-1.196-.113-2.892.614-3.5 1.5-1.056-.863-2.363-1.5-3.5-1.5z"></path>
                  </svg>
                </span>
                Pay with Apple Pay
              </button>
            {/if}
          {:else}
            <div class="loading-container">
              <p>Initializing payment form...</p>
              <div class="loading-spinner"></div>
            </div>
          {/if}
          <p class="card-info">Your payment information is processed securely by Square.</p>
        </div>
      </div>
    {/if}
  {/if}
</div>

<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { profileApi, subscriptionApi } from '$lib/api';
  import { browser } from '$app/environment';
  
  // Private variables with underscore prefix as per rules
  let _container: HTMLElement;
  let _sections: HTMLElement[] = [];
  let isLoading = true;
  let error = '';
  let profileData: any = null;
  let selectedPlan: 'monthly' | 'semester' | 'annual' = 'monthly';
  
  // Fetch user subscription data
  const fetchSubscriptionData = async () => {
    if (!browser) {
      isLoading = false;
      return;
    }
    
    isLoading = true;
    
    try {
      const response = await profileApi.getProfile();
      if (response.data.success) {
        profileData = response.data.data;
        // Set selected plan based on current subscription
        if (profileData?.subscription?.plan) {
          selectedPlan = profileData.subscription.plan;
        }
      }
    } catch (err) {
      console.error('Error fetching subscription data:', err);
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
        console.log('Auth token invalid or expired, redirecting to login');
        goto('/login');
      }
      error = 'Failed to load subscription data';
    } finally {
      isLoading = false;
    }
  };
  
  // Handle plan selection
  const selectPlan = (plan: 'monthly' | 'semester' | 'annual') => {
    selectedPlan = plan;
    
    // Animate the selection with GSAP
    const plans = document.querySelectorAll('.plan-option');
    plans.forEach(plan => {
      gsap.to(plan, {
        scale: 1,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
        duration: 0.3
      });
    });
    
    const selectedElement = document.querySelector(`.plan-option[data-plan="${plan}"]`);
    if (selectedElement) {
      gsap.to(selectedElement, {
        scale: 1.02,
        boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)',
        duration: 0.3
      });
    }
  };
  
  // Helper function to get the correct plan variation id for the selected plan
  function getVariationIdForSelectedPlan(plan: string): string {
    // Implement logic to map selectedPlan to the correct variation id from current plans list
    // Example (replace with your actual mapping logic):
    const variation = profileData?.subscription?.availablePlans?.find((p: any) => p.name === plan)?.variationId;
    return variation || '';
  }
  
  // Handle updating subscription
  const updateSubscription = async () => {
    isLoading = true;
    error = '';
    try {
      // Fetch current user profile to get squareCustomerId
      const profileResp = await profileApi.getProfile();
      const squareCustomerId = profileResp?.data?.subscription?.customer_id;
      if (!squareCustomerId) throw new Error('Missing Square customer ID');
      // Call backend API to swap plan (ensure newPlanVariationId is set correctly)
      await subscriptionApi.swapPlan(
        profileResp.data.subscription.subscription_id,
        getVariationIdForSelectedPlan(selectedPlan),
        squareCustomerId
      );
      gsap.to(_container, { opacity: 0, y: -20, duration: 0.3, onComplete: () => goto('/dashboard') });
    } catch (err) {
      console.error('Error updating subscription:', err);
      error = 'Failed to update subscription. Please try again.';
      gsap.to(_container, { opacity: 1, duration: 0.3 });
    } finally {
      if (error) {
        isLoading = false;
      }
    }
  };
  
  // Animation for sections
  const animateSections = () => {
    gsap.fromTo(_sections, 
      { opacity: 0, y: 20 },
      { 
        opacity: 1, 
        y: 0, 
        stagger: 0.1, 
        duration: 0.5,
        ease: "power2.out"
      }
    );
  };
  
  onMount(() => {
    fetchSubscriptionData();
    
    // Animate container in
    if (browser && _container) {
      gsap.fromTo(_container, 
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, onComplete: animateSections }
      );
    }
  });
</script>

<svelte:head>
  <title>Manage Subscription - Dawn Sign Press</title>
</svelte:head>

<div class="payment-container" bind:this={_container}>
  <div class="navigation-header">
    <button class="back-button" on:click={() => goto('/dashboard')}>
      ← Back to Dashboard
    </button>
  </div>
  
  <h1>Subscription Plan</h1>
  <p class="section-description">
    View and manage your current subscription plan, billing information, and payment.
  </p>
  
  {#if isLoading}
    <div class="loading">Loading your subscription details...</div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
      <button class="button secondary" on:click={fetchSubscriptionData}>Try Again</button>
    </div>
  {:else}
    <div class="payment-section" bind:this={_sections[0]}>
      <div class="plan-selection">
        <div 
          class="plan-option {selectedPlan === 'monthly' ? 'selected' : ''}" 
          data-plan="monthly"
          on:click={() => selectPlan('monthly')}
        >
          <div class="plan-header">
            {#if selectedPlan === 'monthly'}
              <span class="plan-tag">Current plan</span>
            {/if}
            <h3>Monthly</h3>
            <p class="plan-description">A monthly plan for those who prefer maximum flexibility.</p>
          </div>
          
          <div class="plan-price">
            <span class="price">$19.99</span>
            <span class="price-period">/month</span>
          </div>
          
          <ul class="plan-features">
            <li>✓ Access to all 500 signs</li>
            <li>✓ Interactive quizzes</li>
            <li>✓ Advanced sign recognition</li>
          </ul>
          
          {#if selectedPlan === 'monthly'}
            <div class="selected-indicator">
              <span class="checkmark">✓</span> Selected
            </div>
          {:else}
            <button class="button select-plan-btn">Select Plan</button>
          {/if}
        </div>
        
        <div 
          class="plan-option {selectedPlan === 'semester' ? 'selected' : ''}" 
          data-plan="semester"
          on:click={() => selectPlan('semester')}
        >
          <div class="plan-header">
            {#if selectedPlan === 'semester'}
              <span class="plan-tag">Current plan</span>
            {/if}
            <h3>Semester</h3>
            <p class="plan-description">Suitable for students completing a semester in ASL or Signing Naturally.</p>
          </div>
          
          <div class="plan-price">
            <span class="price">$16.67</span>
            <span class="price-period">/month equiv.</span>
          </div>
          
          <div class="plan-savings">Save $20 semi-annually compared to the Monthly Plan</div>
          
          <ul class="plan-features">
            <li>✓ Access to all 500 signs</li>
            <li>✓ Interactive quizzes</li>
            <li>✓ Advanced sign recognition</li>
          </ul>
          
          {#if selectedPlan === 'semester'}
            <div class="selected-indicator">
              <span class="checkmark">✓</span> Selected
            </div>
          {:else}
            <button class="button select-plan-btn">Select Plan</button>
          {/if}
        </div>
        
        <div 
          class="plan-option {selectedPlan === 'annual' ? 'selected' : ''}" 
          data-plan="annual"
          on:click={() => selectPlan('annual')}
        >
          <div class="plan-header">
            <span class="plan-tag highlight">Most value</span>
            {#if selectedPlan === 'annual'}
              <span class="plan-tag current">Current plan</span>
            {/if}
            <h3>Annual</h3>
            <p class="plan-description">Get significant savings for the committed learners.</p>
          </div>
          
          <div class="plan-price">
            <span class="price">$14.99</span>
            <span class="price-period">/month equiv.</span>
          </div>
          
          <div class="plan-savings">Save $40 annually compared to the Monthly Plan</div>
          
          <ul class="plan-features">
            <li>✓ Access to all 500 signs</li>
            <li>✓ Interactive quizzes</li>
            <li>✓ Advanced sign recognition</li>
          </ul>
          
          {#if selectedPlan === 'annual'}
            <div class="selected-indicator">
              <span class="checkmark">✓</span> Selected
            </div>
          {:else}
            <button class="button select-plan-btn">Select Plan</button>
          {/if}
        </div>
      </div>
      
      <div class="payment-actions">
        <button 
          class="button primary update-btn" 
          on:click={updateSubscription}
          disabled={isLoading}
        >
          {isLoading ? 'Updating...' : 'Update subscription'}
        </button>
        
        <div class="additional-actions">
          <a href="/dashboard/payment/billing-details">Update billing details</a>
          <a href="/dashboard/payment/view-invoices">View invoices</a>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .payment-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem 0;
  }
  
  .navigation-header {
    margin-bottom: 1.5rem;
  }
  
  .back-button {
    background: none;
    border: none;
    color: #4a5568;
    font-size: 0.875rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0;
  }
  
  .back-button:hover {
    color: #3b82f6;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: #2d3748;
  }
  
  .section-description {
    color: #718096;
    margin-bottom: 2rem;
  }
  
  .payment-section {
    width: 100%;
  }
  
  .plan-selection {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  
  .plan-option {
    background-color: #ffffff;
    border-radius: 10px;
    padding: 1.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    cursor: pointer;
    transition: transform 0.3s, box-shadow 0.3s;
  }
  
  .plan-option:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.08);
  }
  
  .plan-option.selected {
    border: 2px solid #3b82f6;
    transform: scale(1.02);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
  }
  
  .plan-header {
    margin-bottom: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .plan-tag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background-color: #3b82f6;
    color: white;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-right: 0.5rem;
  }
  
  .plan-tag.highlight {
    background-color: #2c5282;
  }
  
  .plan-tag.current {
    background-color: #48bb78;
  }
  
  .plan-header h3 {
    width: 100%;
    margin: 0.5rem 0;
    color: #2d3748;
  }
  
  .plan-description {
    color: #718096;
    font-size: 0.875rem;
    margin: 0;
  }
  
  .plan-price {
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }
  
  .price {
    font-size: 1.75rem;
    font-weight: 700;
    color: #2d3748;
  }
  
  .price-period {
    color: #718096;
    font-size: 0.875rem;
  }
  
  .plan-savings {
    font-size: 0.8125rem;
    color: #48bb78;
    margin-bottom: 1rem;
  }
  
  .plan-features {
    list-style-type: none;
    padding-left: 0;
    margin-top: 1rem;
    margin-bottom: 1rem;
    flex-grow: 1;
  }
  
  .plan-features li {
    margin-bottom: 0.75rem;
    color: #4a5568;
    font-size: 0.875rem;
  }
  
  .selected-indicator {
    color: #3b82f6;
    font-weight: 500;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  
  .checkmark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background-color: #3b82f6;
    color: white;
    border-radius: 50%;
    font-size: 0.75rem;
  }
  
  .select-plan-btn {
    width: 100%;
    margin-top: 1rem;
  }
  
  .payment-actions {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    align-items: flex-start;
    margin-top: 1rem;
  }
  
  .update-btn {
    padding: 0.75rem 2rem;
    font-size: 1rem;
  }
  
  .additional-actions {
    display: flex;
    gap: 2rem;
  }
  
  .additional-actions a {
    color: #4a5568;
    text-decoration: none;
    font-size: 0.875rem;
  }
  
  .additional-actions a:hover {
    color: #3b82f6;
    text-decoration: underline;
  }
  
  .button {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 0.875rem;
  }
  
  .primary {
    background-color: #3b82f6;
    color: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .primary:hover {
    background-color: #2563eb;
  }
  
  .secondary {
    background-color: #e2e8f0;
    color: #4a5568;
  }
  
  .secondary:hover {
    background-color: #cbd5e0;
  }
  
  .button[disabled] {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .loading {
    text-align: center;
    padding: 2rem;
    color: #718096;
  }
  
  .error-message {
    padding: 1.5rem;
    background-color: #fed7d7;
    color: #c53030;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .error-message p {
    margin: 0;
  }
</style>

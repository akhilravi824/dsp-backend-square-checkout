<script lang="ts">
  import { onMount } from 'svelte';
  import api from '$lib/api';
  import { gsap } from 'gsap';
  import { browser } from '$app/environment';
  
  let subscriptions: any[] = [];
  let isLoading = true;
  let error = '';
  let subscriptionList: HTMLElement;
  let environment = '';
  let itemCount = 0;
  
  const fetchSubscriptions = async () => {
    if (!browser) {
      isLoading = false;
      return;
    }
    
    isLoading = true;
    error = '';
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      if (!token) {
        error = 'Authentication required. Please log in.';
        isLoading = false;
        return;
      }
      
      // Use direct API call with proper authentication
      const response = await api.get('/api/subscriptions/catalog', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (response.data.success) {
        subscriptions = response.data.data || [];
        
        // Store environment information
        environment = response.data.environment || 'sandbox';
        itemCount = response.data.count || 0;
        
        // Animate subscriptions in with GSAP
        gsap.delayedCall(0, () => {
          if (subscriptionList) {
            gsap.from('.subscription-card', { 
              opacity: 0, 
              y: 20, 
              stagger: 0.2,
              duration: 0.8
            });
          }
        });
      }
    } catch (err: any) {
      console.error('Error fetching subscriptions:', err);
      
      if (err.response?.status === 401) {
        error = 'Your session has expired. Please log in again.';
      } else if (err.response?.data?.message) {
        error = err.response.data.message;
      } else if (err.message) {
        error = err.message;
      } else {
        error = 'Failed to load subscription data. Please try again.';
      }
      
      // Animate error message in
      gsap.delayedCall(0, () => {
        gsap.fromTo('.error-message', 
          { opacity: 0, y: -10 }, 
          { opacity: 1, y: 0, duration: 0.3 }
        );
      });
    } finally {
      isLoading = false;
    }
  };
  
  const formatPrice = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount / 100); // Square amounts are in cents
  };
  
  // Handle subscription selection
  const selectSubscription = (subscriptionId: string) => {
    console.log('Selected subscription:', subscriptionId);
    // Add subscription selection logic here
    // This would typically redirect to a checkout page or add to cart
  };
  
  onMount(() => {
    fetchSubscriptions();
  });
</script>

<svelte:head>
  <title>Available Subscriptions</title>
</svelte:head>

<div class="container">
  <h1>Available Subscriptions</h1>
  
  {#if isLoading}
    <div class="loading">Loading subscription data...</div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {:else if subscriptions.length === 0}
    <div class="no-subscriptions">
      <p>No subscription plans are currently available.</p>
    </div>
  {:else}
    <div class="subscription-list" bind:this={subscriptionList}>
      <div class="debug-info">
        <p>Found {subscriptions.length} subscription plan variations in {environment} environment</p>
        <details>
          <summary>Debug Info (Click to expand)</summary>
          <pre>{JSON.stringify(subscriptions, null, 2)}</pre>
        </details>
      </div>
      
      {#each subscriptions as subscription}
        <div class="subscription-card">
          <div class="subscription-info">
            <h2>{subscription.planName}</h2>
            <p class="description">{subscription.description || 'No description available'}</p>
            
            <!-- Variation information -->
            <div class="price-info">
              <div class="variation-info">
                <span class="cadence">{subscription.variationName}</span>
                
                <!-- If discount information is available -->
                {#if subscription.phases && subscription.phases[0] && subscription.phases[0].pricing && subscription.phases[0].pricing.discountIds}
                  <span class="discount">
                    With discount
                  </span>
                {/if}
              </div>
            </div>
          </div>
          
          <button 
            class="select-button" 
            on:click={() => selectSubscription(subscription.id)}
          >
            Select {subscription.variationName} Plan
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
  }
  
  h1 {
    margin-bottom: 1.5rem;
    color: #2d3748;
  }
  
  .loading {
    text-align: center;
    padding: 2rem;
    color: #4a5568;
  }
  
  .error-message {
    background-color: #fff5f5;
    border-left: 4px solid #f56565;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border-radius: 0.25rem;
  }
  
  .error-message p {
    color: #c53030;
    margin: 0;
  }
  
  .no-subscriptions {
    background-color: #f7fafc;
    padding: 2rem;
    text-align: center;
    border-radius: 0.375rem;
    margin-bottom: 1.5rem;
  }
  
  .subscription-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }
  
  .subscription-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background-color: white;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    height: 100%;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .subscription-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
  }
  
  .subscription-info {
    margin-bottom: 1.5rem;
  }
  
  .subscription-card h2 {
    margin: 0 0 0.75rem 0;
    color: #3182ce;
    font-size: 1.25rem;
  }
  
  .description {
    color: #4a5568;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  
  .price-info {
    margin-top: 1rem;
  }
  
  .variation-info {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }
  
  .cadence {
    font-weight: 500;
    color: #4a5568;
  }
  
  .discount {
    color: #718096;
    font-size: 0.9rem;
  }
  
  .select-button {
    background-color: #3182ce;
    color: white;
    border: none;
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    width: 100%;
    margin-top: auto;
  }
  
  .select-button:hover {
    background-color: #2c5282;
  }
  
  .debug-info {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: #f8f9fa;
    border-radius: 0.375rem;
    border: 1px solid #e2e8f0;
  }
  
  .debug-info p {
    margin: 0 0 0.5rem 0;
    font-weight: 500;
  }
  
  .debug-info details {
    margin-top: 0.5rem;
  }
  
  .debug-info summary {
    cursor: pointer;
    color: #4a5568;
    font-weight: 500;
  }
  
  .debug-info pre {
    margin-top: 0.5rem;
    background-color: #edf2f7;
    padding: 0.75rem;
    border-radius: 0.25rem;
    overflow-x: auto;
    font-size: 0.8rem;
    max-height: 300px;
    overflow-y: auto;
  }
  
  @media (max-width: 768px) {
    .subscription-list {
      grid-template-columns: 1fr;
    }
  }
</style>

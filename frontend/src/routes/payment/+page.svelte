<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { paymentApi } from '$lib/api';
  
  type PaymentAction = 'createPayment' | 'testPayment' | 'getLocations' | 'listPayments';
  
  let sourceId: string = '';
  let amount: number = 0;
  let currency: string = 'USD';
  let action: PaymentAction = 'testPayment';
  let loading: boolean = false;
  let result: { success: boolean; message: string; data?: any } | null = null;
  
  onMount(() => {
    gsap.from('.payment-form', { 
      opacity: 0, 
      y: 20, 
      duration: 0.5 
    });
  });
  
  async function handleSubmit() {
    loading = true;
    result = null;
    
    try {
      let response;
      
      switch (action) {
        case 'createPayment':
          response = await paymentApi.createPayment(sourceId, amount, currency);
          break;
        case 'testPayment':
          response = await paymentApi.testPayment();
          break;
        case 'getLocations':
          response = await paymentApi.getLocations();
          break;
        case 'listPayments':
          response = await paymentApi.listPayments();
          break;
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
      
      // Animate the result
      if (result) {
        gsap.fromTo('.result', 
          { opacity: 0, y: 10 }, 
          { opacity: 1, y: 0, duration: 0.3 }
        );
      }
    }
  }
</script>

<div class="payment-container">
  <h1>Payment API Testing</h1>
  
  <div class="payment-form">
    <div class="form-group">
      <label>Select Action:</label>
      <div class="radio-group">
        <label>
          <input type="radio" name="action" value="createPayment" bind:group={action}>
          Create Payment
        </label>
        <label>
          <input type="radio" name="action" value="testPayment" bind:group={action}>
          Test Payment
        </label>
        <label>
          <input type="radio" name="action" value="getLocations" bind:group={action}>
          Get Locations
        </label>
        <label>
          <input type="radio" name="action" value="listPayments" bind:group={action}>
          List Payments
        </label>
      </div>
    </div>
    
    {#if action === 'createPayment'}
      <div class="form-group">
        <label for="sourceId">Source ID</label>
        <input 
          type="text" 
          id="sourceId" 
          bind:value={sourceId} 
          placeholder="Enter payment source ID"
          required
        >
      </div>
      
      <div class="form-group">
        <label for="amount">Amount</label>
        <input 
          type="number" 
          id="amount" 
          bind:value={amount} 
          placeholder="Enter amount"
          min="0"
          required
        >
      </div>
      
      <div class="form-group">
        <label for="currency">Currency</label>
        <select id="currency" bind:value={currency}>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CAD">CAD</option>
        </select>
      </div>
    {/if}
    
    <button on:click={handleSubmit} disabled={loading}>
      {loading ? 'Processing...' : 'Submit'}
    </button>
  </div>
  
  {#if result}
    <div class="result" class:success={result.success} class:error={!result.success}>
      <h3>{result.success ? 'Success' : 'Error'}</h3>
      <p>{result.message}</p>
      {#if result.data}
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .payment-container {
    max-width: 600px;
    margin: 0 auto;
  }
  
  h1 {
    margin-bottom: 1.5rem;
    color: #2d3748;
  }
  
  .payment-form {
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
  
  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  input[type="radio"] {
    margin-right: 0.5rem;
  }
  
  label:has(input[type="radio"]) {
    display: inline-flex;
    align-items: center;
  }
  
  input[type="text"],
  input[type="number"],
  select {
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

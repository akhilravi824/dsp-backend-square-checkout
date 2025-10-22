<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount, onDestroy } from 'svelte';
  
  export let invoices: any[] = [];
  export let isOpen: boolean = false;
  export let onClose: () => void;
  export let isLoading: boolean = false;
  export let errorMessage: string = '';
  
  let _popup: HTMLElement;
  let _backdrop: HTMLElement;
  let _content: HTMLElement;
  
  // Animation timeline
  let tl: gsap.core.Timeline;
  
  onMount(() => {
    // Initialize the timeline
    tl = gsap.timeline({ paused: true });
    
    // Setup animations
    tl.fromTo(_backdrop, 
      { opacity: 0 }, 
      { opacity: 1, duration: 0.3 }
    );
    
    tl.fromTo(_content, 
      { opacity: 0, y: 20 }, 
      { opacity: 1, y: 0, duration: 0.3 }, 
      "-=0.1"
    );
    
    // Play if initially open
    if (isOpen) {
      tl.play();
    }
  });
  
  onDestroy(() => {
    if (tl) {
      tl.kill();
    }
  });
  
  // Watch for changes to isOpen
  $: if (tl && isOpen !== undefined) {
    if (isOpen) {
      tl.play();
    } else {
      tl.reverse();
    }
  }
  
  // Handle close
  function handleClose() {
    tl.reverse().then(() => {
      onClose();
    });
  }
  
  // Format date for display
  function formatDate(dateString: string) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  
  // Get status class
  function getStatusClass(status: string) {
    switch (status) {
      case 'PAID':
        return 'status-paid';
      case 'UNPAID':
        return 'status-unpaid';
      case 'CANCELED':
        return 'status-canceled';
      case 'DRAFT':
        return 'status-draft';
      default:
        return 'status-other';
    }
  }
  
  // Handle click outside to close
  function handleClickOutside(event: MouseEvent) {
    if (_popup && !_content.contains(event.target as Node)) {
      handleClose();
    }
  }
  
  // Handle keyboard events
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <div 
    class="popup-container" 
    bind:this={_popup} 
    on:click={handleClickOutside}
    on:keydown={handleKeydown}
    role="dialog" 
    aria-modal="true"
    aria-labelledby="invoice-popup-title"
    tabindex="-1"
  >
    <div class="backdrop" bind:this={_backdrop}></div>
    <div class="popup-content" bind:this={_content}>
      <div class="popup-header">
        <h2 id="invoice-popup-title">Your Invoices</h2>
        <button class="close-button" on:click={handleClose} aria-label="Close">×</button>
      </div>
      
      <div class="popup-body">
        {#if isLoading}
          <div class="loading-state">
            <p>Loading your invoices...</p>
          </div>
        {:else if invoices.length === 0}
          <div class="no-invoices">
            <p>You don't have any invoices yet.</p>
          </div>
        {:else if errorMessage}
          <div class="error-message">
            <p>{errorMessage}</p>
          </div>
        {:else}
          <div class="invoices-list">
            <div class="invoice-header">
              <div class="invoice-number">Invoice #</div>
              <div class="invoice-date">Date</div>
              <div class="invoice-amount">Amount</div>
              <div class="invoice-status">Status</div>
              <div class="invoice-actions">Actions</div>
            </div>
            
            {#each invoices as invoice}
              <div class="invoice-item">
                <div class="invoice-number">{invoice.invoiceNumber || 'N/A'}</div>
                <div class="invoice-date">{formatDate(invoice.createdAt)}</div>
                <div class="invoice-amount">{invoice.formattedAmount}</div>
                <div class="invoice-status">
                  <span class={getStatusClass(invoice.status)}>{invoice.status}</span>
                </div>
                <div class="invoice-actions">
                  {#if invoice.url}
                    <a href={invoice.url} target="_blank" rel="noopener noreferrer" class="button small">View</a>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      
      <div class="popup-footer">
        <button class="button secondary" on:click={handleClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

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
  
  .backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: -1;
  }
  
  .popup-content {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .popup-header {
    padding: 1.25rem;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .popup-header h2 {
    margin: 0;
    color: #2d3748;
    font-size: 1.25rem;
  }
  
  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #718096;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  
  .close-button:hover {
    background-color: #f7fafc;
    color: #4a5568;
  }
  
  .popup-body {
    padding: 1.25rem;
    overflow-y: auto;
    flex: 1;
  }
  
  .popup-footer {
    padding: 1.25rem;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: flex-end;
  }
  
  .no-invoices {
    text-align: center;
    padding: 2rem;
    color: #718096;
  }
  
  .invoices-list {
    width: 100%;
  }
  
  .invoice-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 0.8fr;
    gap: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
    font-weight: 600;
    color: #4a5568;
  }
  
  .invoice-item {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 0.8fr;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid #e2e8f0;
    align-items: center;
  }
  
  .invoice-status span {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .status-paid {
    background-color: #c6f6d5;
    color: #2f855a;
  }
  
  .status-unpaid {
    background-color: #fed7d7;
    color: #c53030;
  }
  
  .status-canceled {
    background-color: #e2e8f0;
    color: #4a5568;
  }
  
  .status-draft {
    background-color: #bee3f8;
    color: #2b6cb0;
  }
  
  .status-other {
    background-color: #edf2f7;
    color: #4a5568;
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
    transition: background-color 0.2s, transform 0.2s;
    border: none;
  }
  
  .button.small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }
  
  .button.primary {
    background-color: #3b82f6;
    color: white;
  }
  
  .button.secondary {
    background-color: #e2e8f0;
    color: #4a5568;
  }
  
  .button:hover {
    transform: translateY(-1px);
  }
  
  .loading-state {
    text-align: center;
    padding: 2rem;
    color: #718096;
  }
  
  .error-message {
    text-align: center;
    padding: 2rem;
    color: #c53030;
  }
  
  @media (max-width: 640px) {
    .invoice-header {
      display: none;
    }
    
    .invoice-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      background-color: #f7fafc;
      border-radius: 6px;
      margin-bottom: 0.75rem;
    }
    
    .invoice-item > div {
      display: flex;
      justify-content: space-between;
    }
    
    .invoice-item > div::before {
      content: attr(class);
      text-transform: capitalize;
      font-weight: 600;
      color: #4a5568;
    }
  }
</style>

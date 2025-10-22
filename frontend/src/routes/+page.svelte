<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  
  onMount(() => {
    // gsap.from('.card', { 
    //   opacity: 0, 
    //   y: 20, 
    //   stagger: 0.2,
    //   duration: 0.8
    // });
  });
</script>

<div class="container">
  <!-- <h1>Dawn Sign Press API Testing Tool</h1>
  <p>Select an API category to test from the navigation above or use the card below.</p> -->
  
  <div class="cards">
    <!-- <a href="/profile" class="card">
      <h2>Profile Creation</h2>
      <p>Manage profile and update payment options</p>
    </a> -->
  </div>
</div>

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
  }
  
  h1 {
    margin-bottom: 1rem;
    color: #2d3748;
  }
  
  p {
    color: #4a5568;
    margin-bottom: 2rem;
  }
  
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }
  
  .card {
    padding: 1.5rem;
    background-color: white;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
  }
  
  .card h2 {
    margin: 0 0 0.5rem 0;
    color: #3182ce;
  }
  
  .card p {
    margin: 0;
    font-size: 0.9rem;
  }
</style>

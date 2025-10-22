<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import api from '$lib/api';
  
  let isLoggedIn = false;
  let navElement: HTMLElement;
  let isCheckingAuth = true;
  
  const checkAuthStatus = async () => {
    if (browser) {
      const wasLoggedIn = isLoggedIn;
      isCheckingAuth = true;
      
      // Debug: Check what tokens we have in localStorage
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');
      console.log('------> checkAuthStatus - localStorage token:', !!token);
      console.log('------> checkAuthStatus - localStorage refreshToken:', !!refreshToken);
      if (token) {
        console.log('------> checkAuthStatus - token preview:', token.substring(0, 20) + '...');
      }
      
      try {
        // Make a request to verify if the user is authenticated
        // The cookie will be sent automatically
        const response = await api.get('/auth/verify');
        console.log('------> checkAuthStatus - verify response:', response.data);
        isLoggedIn = response.data.authenticated;
      } catch (error) {
        console.log('------> checkAuthStatus - verify error:', error);
        isLoggedIn = false;
      } finally {
        isCheckingAuth = false;
      }
      
      console.log('------> checkAuthStatus - isLoggedIn:', isLoggedIn);
      console.log('------> checkAuthStatus - wasLoggedIn:', wasLoggedIn);

      // Only animate if login status changed
      if (!wasLoggedIn && isLoggedIn && navElement) {
        // Only animate the auth-specific links (Profile and Subscriptions)
        gsap.fromTo('nav .auth-only', 
          { opacity: 0, y: -10 },
          { opacity: 1, y: 0, stagger: 0.1, duration: 0.3 }
        );
      }
    }
  };
  
  const handleLogout = async () => {
    if (browser) {
      try {
        // Call the logout endpoint to clear the cookie
        await api.post('/auth/logout');
      } catch (error) {
        console.error('Logout error:', error);
      }
      
      isLoggedIn = false;
      
      // Redirect to login if user is on a protected page
      const currentPath = $page.url.pathname;
      if (currentPath === '/profile' || currentPath.startsWith('/profile/')) {
        window.location.href = '/login';
      }
    }
  };
  
  onMount(() => {
    checkAuthStatus();
    
    // Animate nav items in
    if (navElement) {
      gsap.from('nav a', {
        opacity: 0,
        y: -10,
        stagger: 0.1,
        duration: 0.5
      });
    }
    
    // Check auth status on route navigation
    page.subscribe(() => {
      checkAuthStatus();
    });
  });
</script>

<div class="app">
  <header>
    <div class="logo">
      <a href="/">Dawn Sign Press</a>
    </div>
    <nav bind:this={navElement}>
      <a href="/" class:active={$page.url.pathname === '/'}>Home</a>
      <a href="/subscriptions" class:active={$page.url.pathname === '/subscriptions'}>Subscriptions</a>
      {#if isLoggedIn}
        <a href="/dashboard" class="auth-only" class:active={$page.url.pathname === '/dashboard'}>Dashboard</a>
        <a href="/profile" class="auth-only" class:active={$page.url.pathname === '/profile'}>Profile</a>
        <button on:click={handleLogout} class="nav-button auth-only">Logout</button>
      {:else}
        <a href="/login" class:active={$page.url.pathname === '/login'}>Login</a>
        <a href="/signup" class:active={$page.url.pathname === '/signup'}>Sign Up</a>
      {/if}
    </nav>
  </header>
  
  <main>
    <slot />
  </main>
  
  <footer>
    <p> {new Date().getFullYear()} Dawn Sign Press</p>
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  }
  
  header {
    background-color: #2b6cb0;
    color: white;
    padding: 1rem 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo a {
    color: white;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.5rem;
    letter-spacing: 0.5px;
  }
  
  nav {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }
  
  nav a {
    color: white;
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 0;
    position: relative;
  }
  
  nav a::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: white;
    transform: scaleX(0);
    transition: transform 0.3s ease;
  }
  
  nav a:hover::after {
    transform: scaleX(1);
  }
  
  nav a.active::after {
    transform: scaleX(1);
  }
  
  .nav-button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: white;
    padding: 0.5rem 0;
  }
  
  main {
    flex: 1;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }
  
  footer {
    padding: 1rem 2rem;
    background-color: #f7fafc;
    text-align: center;
    font-size: 0.875rem;
    color: #4a5568;
  }
</style>

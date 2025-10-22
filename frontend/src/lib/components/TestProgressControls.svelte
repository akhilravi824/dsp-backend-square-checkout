<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import api from '$lib/api';
  import { progressStore } from '$lib/stores/progressStore';

  let isVisible = false;
  let isLoading = false;
  let message = '';
  let messageType = 'info';
  
  // Progress data
  let progressData: any = null;
  
  // Form data
  let levelId = '1';
  let unitId = '1';
  let lessonId = '';
  let attempts = 1;
  let complete = false;
  
  // Level lock/unlock
  let levelToToggle = '1';
  
  // Available levels and units for selection
  const levels = ['1', '2', '3', '4', '5'];
  const unitsByLevel: Record<string, string[]> = {
    '1': ['1', '2', '3', '4'],
    '2': ['5', '6', '7', '8'],
    '3': ['9', '10', '11', '12'],
    '4': ['13', '14', '15', '16'],
    '5': ['17', '18', '19', '20']
  };
  
  let availableUnits = unitsByLevel['1'];
  
  // Update available units when level changes
  const handleLevelChange = () => {
    availableUnits = unitsByLevel[levelId] || [];
    unitId = availableUnits[0] || '1';
  };
  
  // Toggle visibility of the test panel
  const togglePanel = () => {
    isVisible = !isVisible;
    
    if (isVisible) {
      gsap.fromTo('.test-panel', 
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    } else {
      gsap.to('.test-panel', 
        { height: 0, opacity: 0, duration: 0.3, ease: 'power2.in' }
      );
    }
  };
  
  // Show a message with auto-dismiss
  const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    message = text;
    messageType = type;
    
    // Auto-dismiss after 3 seconds
    gsap.to('.message', {
      opacity: 0,
      y: -10,
      duration: 0.3,
      delay: 3,
      onComplete: () => {
        message = '';
        gsap.set('.message', { opacity: 1, y: 0 });
      }
    });
  };
  
  onMount(() => {
    // Check if we're in development mode
    if (window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')) {
      // Hide the test panel in production
      isVisible = false;
      return;
    }
    
    // Fetch initial progress data
    fetchProgressData();
  });
  
  // Fetch progress data
  const fetchProgressData = async () => {
    try {
      const response = await api.get('/progress');
      
      if (response.data.success) {
        progressData = response.data.data;
        // Update the store with the new progress data
        progressStore.set(progressData);
        console.log('Progress data loaded:', progressData);
      } else {
        console.error('Failed to load progress data');
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };
  
  // Add test data
  const addTestData = async () => {
    if (!lessonId || !progressData) {
      showMessage('Please enter a lesson ID and ensure progress data is loaded', 'error');
      return;
    }
    
    isLoading = true;
    
    try {
      // Make a copy of the current progress data
      const updatedProgress = JSON.parse(JSON.stringify(progressData));
      
      // Initialize level if it doesn't exist
      if (!updatedProgress.levels[levelId]) {
        updatedProgress.levels[levelId] = { units: {} };
      }
      
      // Initialize unit if it doesn't exist
      if (!updatedProgress.levels[levelId].units[unitId]) {
        updatedProgress.levels[levelId].units[unitId] = { lessons: {} };
      }
      
      // Initialize or update lesson
      if (!updatedProgress.levels[levelId].units[unitId].lessons[lessonId]) {
        updatedProgress.levels[levelId].units[unitId].lessons[lessonId] = {
          id: lessonId,
          attempts: 0,
          complete: false
        };
      }
      
      const lesson = updatedProgress.levels[levelId].units[unitId].lessons[lessonId];
      
      // Update lesson data
      if (attempts > 0) {
        lesson.attempts += attempts;
        updatedProgress.totalAttempts = (updatedProgress.totalAttempts || 0) + attempts;
      }
      
      if (complete) {
        lesson.complete = true;
      }
      
      // Update active days (only add today if not already present)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const activeDays = updatedProgress.activeDays || [];
      const todayExists = activeDays.some((day: string) => day.startsWith(today));
      
      if (!todayExists) {
        activeDays.push(new Date().toISOString());
        updatedProgress.activeDays = activeDays;
      }
      
      // Save the updated progress
      const saveResponse = await api.post('/progress/update', {
        progress: updatedProgress
      });
      
      if (saveResponse.data.success) {
        showMessage('Test data added successfully!', 'success');
        progressData = updatedProgress;
      } else {
        showMessage(`Error: ${saveResponse.data.message}`, 'error');
      }
    } catch (error) {
      console.error('Error adding test data:', error);
      showMessage('Failed to add test data', 'error');
    } finally {
      isLoading = false;
    }
  };
  
  // Toggle level lock status
  const toggleLevelLock = async () => {
    if (!progressData) {
      showMessage('Progress data not loaded', 'error');
      return;
    }
    
    isLoading = true;
    
    try {
      // Make a copy of the current progress data
      const updatedProgress = JSON.parse(JSON.stringify(progressData));
      
      // Initialize level if it doesn't exist
      if (!updatedProgress.levels[levelToToggle]) {
        updatedProgress.levels[levelToToggle] = { units: {}, locked: true };
      }
      
      // Toggle the locked status
      const currentLocked = updatedProgress.levels[levelToToggle].locked !== false;
      updatedProgress.levels[levelToToggle].locked = !currentLocked;
      
      // Save the updated progress
      const saveResponse = await api.post('/progress/update', {
        progress: updatedProgress
      });
      
      if (saveResponse.data.success) {
        const status = !currentLocked ? 'locked' : 'unlocked';
        showMessage(`Level ${levelToToggle} ${status} successfully!`, 'success');
        progressData = updatedProgress;
        // Update the store with the new progress data
        progressStore.set(updatedProgress);
      } else {
        showMessage(`Error: ${saveResponse.data.message}`, 'error');
      }
    } catch (error) {
      console.error('Error toggling level lock:', error);
      showMessage('Failed to toggle level lock', 'error');
    } finally {
      isLoading = false;
    }
  };
  
  // Reset progress
  const resetProgress = async () => {
    if (!confirm('Are you sure you want to reset all progress data? This cannot be undone.')) {
      return;
    }
    
    isLoading = true;
    
    try {
      // Import the default progress structure
      const { defaultProgress } = await import('$lib/utils/defaultProgress');
      
      // Save the default progress
      const response = await api.post('/progress/update', {
        progress: defaultProgress
      });
      
      if (response.data.success) {
        showMessage('Progress reset successfully!', 'success');
        progressData = defaultProgress;
      } else {
        showMessage(`Error: ${response.data.message}`, 'error');
      }
    } catch (error) {
      console.error('Error resetting progress:', error);
      showMessage('Failed to reset progress', 'error');
    } finally {
      isLoading = false;
    }
  };
</script>

<div class="test-controls">
  <button class="toggle-button" on:click={togglePanel}>
    {isVisible ? 'Hide Test Controls' : 'Show Test Controls'}
  </button>
  
  <div class="test-panel" style="height: 0; opacity: 0;">
    <h3>Test Progress Controls</h3>
    <p class="warning">⚠️ For development and testing only. Not for production use.</p>
    
    {#if message}
      <div class="message {messageType}">
        {message}
      </div>
    {/if}
    
    <div class="form-section">
      <h4>Add Test Lesson Data</h4>
      
      <div class="form-group">
        <label for="levelId">Level:</label>
        <select id="levelId" bind:value={levelId} on:change={handleLevelChange}>
          {#each levels as level}
            <option value={level}>Level {level}</option>
          {/each}
        </select>
      </div>
      
      <div class="form-group">
        <label for="unitId">Unit:</label>
        <select id="unitId" bind:value={unitId}>
          {#each availableUnits as unit}
            <option value={unit}>Unit {unit}</option>
          {/each}
        </select>
      </div>
      
      <div class="form-group">
        <label for="lessonId">Lesson ID:</label>
        <input type="text" id="lessonId" bind:value={lessonId} placeholder="e.g., lesson1" />
      </div>
      
      <div class="form-group">
        <label for="attempts">Attempts:</label>
        <input type="number" id="attempts" bind:value={attempts} min="0" max="100" />
      </div>
      
      <div class="form-group checkbox">
        <input type="checkbox" id="complete" bind:checked={complete} />
        <label for="complete">Mark as Complete</label>
      </div>
      
      <button class="add-button" on:click={addTestData} disabled={isLoading}>
        {isLoading ? 'Adding...' : 'Add Test Data'}
      </button>
    </div>
    
    <div class="form-section">
      <h4>Lock/Unlock Levels</h4>
      <p>Toggle the lock status of a level to control user access.</p>
      
      <div class="form-group">
        <label for="levelToToggle">Level:</label>
        <select id="levelToToggle" bind:value={levelToToggle}>
          {#each levels as level}
            <option value={level}>Level {level}</option>
          {/each}
        </select>
      </div>
      
      <div class="level-status">
        {#if progressData && progressData.levels && progressData.levels[levelToToggle]}
          <span class={progressData.levels[levelToToggle].locked !== false ? 'locked' : 'unlocked'}>
            Status: {progressData.levels[levelToToggle].locked !== false ? 'Locked 🔒' : 'Unlocked 🔓'}
          </span>
        {:else}
          <span>Status: Unknown</span>
        {/if}
      </div>
      
      <button class="toggle-lock-button" on:click={toggleLevelLock} disabled={isLoading}>
        {isLoading ? 'Updating...' : 'Toggle Lock Status'}
      </button>
    </div>
    
    <div class="form-section">
      <h4>Reset Progress</h4>
      <p>This will reset all progress data to default values.</p>
      <button class="reset-button" on:click={resetProgress} disabled={isLoading}>
        {isLoading ? 'Resetting...' : 'Reset All Progress'}
      </button>
    </div>
  </div>
</div>

<style>
  .test-controls {
    margin-top: 2rem;
    border-top: 1px dashed #ccc;
    padding-top: 1rem;
  }
  
  .toggle-button {
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .toggle-button:hover {
    background-color: #e0e0e0;
  }
  
  .test-panel {
    background-color: #f8f9fa;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 0 1rem;
    margin-top: 1rem;
    overflow: hidden;
  }
  
  h3 {
    font-size: 1.25rem;
    margin: 1rem 0;
    color: #2d3748;
  }
  
  h4 {
    font-size: 1rem;
    margin: 1rem 0;
    color: #4a5568;
  }
  
  .warning {
    color: #e53e3e;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  
  .form-section {
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .form-section:last-child {
    border-bottom: none;
  }
  
  .form-group {
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
  }
  
  .form-group label {
    width: 100px;
    font-size: 0.875rem;
    color: #4a5568;
  }
  
  .form-group input,
  .form-group select {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #cbd5e0;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .form-group.checkbox {
    display: flex;
    align-items: center;
  }
  
  .form-group.checkbox input {
    width: auto;
    margin-right: 0.5rem;
  }
  
  .form-group.checkbox label {
    width: auto;
  }
  
  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    border: none;
  }
  
  .add-button {
    background-color: #3b82f6;
    color: white;
  }
  
  .add-button:hover {
    background-color: #2563eb;
  }
  
  .reset-button {
    background-color: #e53e3e;
    color: white;
  }
  
  .reset-button:hover {
    background-color: #c53030;
  }
  
  .message {
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  
  .message.success {
    background-color: #C6F6D5;
    color: #22543D;
  }
  
  .message.error {
    background-color: #FED7D7;
    color: #822727;
  }
  
  .message.info {
    background-color: #BEE3F8;
    color: #2A4365;
  }
  
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .level-status {
    margin: 0.5rem 0;
    font-size: 0.875rem;
    padding: 0.5rem;
    border-radius: 4px;
    background-color: #f0f0f0;
  }
  
  .level-status .locked {
    color: #e53e3e;
    font-weight: 500;
  }
  
  .level-status .unlocked {
    color: #38a169;
    font-weight: 500;
  }
  
  .toggle-lock-button {
    background-color: #805ad5;
    color: white;
  }
  
  .toggle-lock-button:hover {
    background-color: #6b46c1;
  }
</style>

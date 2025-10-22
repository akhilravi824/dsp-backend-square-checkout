<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import api from '$lib/api';
  import TestProgressControls from './TestProgressControls.svelte';
  import { progressStore } from '$lib/stores/progressStore';

  export let profileData: any;
  
  let isLoading = true;
  let progressData: any = null;
  let error = '';
  let _container: HTMLElement;
  let _levelContainers: HTMLElement[] = [];
  let showAddTimeForm = false;
  let timeToAdd = 5; // Default 5 minutes
  
  // Format time in seconds to a readable format (e.g., "2h 15m")
  const formatTime = (seconds: number): string => {
    if (!seconds) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Format date to a readable format
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Calculate completion percentage for a level
  const calculateLevelCompletion = (level: any): number => {
    if (!level || !level.units) return 0;

    let totalLessons = 0;
    let completedLessons = 0;

    Object.values(level.units).forEach((unit: any) => {
      if (unit.lessons) {
        Object.values(unit.lessons).forEach((lesson: any) => {
          totalLessons++;
          if (lesson.complete) {
            completedLessons++;
          }
        });
      }
    });

    return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  };

  // Calculate completion percentage for a unit
  const calculateUnitCompletion = (unit: any): number => {
    if (!unit || !unit.lessons) return 0;

    const lessons = Object.values(unit.lessons);
    const totalLessons = lessons.length;
    const completedLessons = lessons.filter((lesson: any) => lesson.complete).length;

    return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  };

  // Get total active days count
  const getTotalActiveDays = (activeDays: string[]): number => {
    if (!activeDays || !activeDays.length) return 0;
    return activeDays.length;
  };

  // Add time to totalTimeSpent and save
  const addTimeAndSave = async (secondsToAdd: number) => {
    if (!progressData) return;
    
    try {
      const updatedProgress = JSON.parse(JSON.stringify(progressData));
      
      // Add time to totalTimeSpent
      updatedProgress.totalTimeSpent = (updatedProgress.totalTimeSpent || 0) + secondsToAdd;
      
      // Update active days (only add today if not already present)
      const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
      const activeDays = updatedProgress.activeDays || [];
      const todayExists = activeDays.includes(today);
      
      if (!todayExists) {
        activeDays.push(today); // ✅ push clean today string
        updatedProgress.activeDays = activeDays;
      }
      
      const response = await api.post('/progress/update', {
        progress: updatedProgress
      });
      
      if (response.data.success) {
        console.log(`Added ${secondsToAdd} seconds to totalTimeSpent`);
        progressData = updatedProgress;
        
        const timeElement = document.querySelector('.time-value');
        if (timeElement) {
          const oldValue = updatedProgress.totalTimeSpent - secondsToAdd;
          const newValue = updatedProgress.totalTimeSpent;
          
          const element = timeElement as HTMLElement;
          element.textContent = formatTime(oldValue);
          
          gsap.to(element, {
            duration: 1,
            ease: "power2.out",
            onUpdate: function() {
              const progress = this.progress();
              const currentValue = Math.round(oldValue + (newValue - oldValue) * progress);
              element.textContent = formatTime(currentValue);
            }
          });
        }
      } else {
        console.error('Failed to save updated time:', response.data.message);
      }
    } catch (error) {
      console.error('Error adding time:', error);
    }
  };

  // Update active days when user visits the dashboard
  const updateActiveDays = async () => {
    if (!progressData) return;

    try {
      const updatedProgress = JSON.parse(JSON.stringify(progressData));
      const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
      const activeDays = updatedProgress.activeDays || [];

      // Check if today already exists
      if (activeDays.includes(today)) {
        console.log('Today already tracked in activeDays, no update needed.');
        return; // ✅ Do nothing if already present
      }

      // Otherwise, add today and save
      activeDays.push(today);
      updatedProgress.activeDays = activeDays;

      console.log(updatedProgress);
      

      const response = await api.post('/progress/update', {
        progress: updatedProgress
      });

      if (response.data.success) {
        console.log('Added today to activeDays.');
        progressData = updatedProgress; // update locally
      } else {
        console.error('Failed to update active days:', response.data.message);
      }
    } catch (error) {
      console.error('Error updating active days:', error);
    }
  };

  // Fetch user progress data
  const fetchProgressData = async () => {
    isLoading = true;
    error = '';

    try {
      const response = await api.get('/progress');
      
      if (response.data.success) {
        progressData = response.data.data;
        // Update the store with the new progress data
        progressStore.set(progressData);
        console.log('Progress data received:', progressData);

        if (profileData) {
          console.log('User profile:', profileData.name);
        }

        // Animate progress bars after data is loaded (use GSAP)
        gsap.delayedCall(0.1, animateProgressBars);
      } else {
        error = 'Failed to load progress data';
      }
    } catch (err) {
      console.error('Error fetching progress:', err);
      error = 'Failed to load progress data';
    } finally {
      isLoading = false;
    }
  };

  // Animate progress bars using GSAP
  const animateProgressBars = () => {
    if (!_levelContainers.length) return;

    gsap.fromTo(_levelContainers, 
      { opacity: 0, y: 20 },
      { 
        opacity: 1, 
        y: 0, 
        stagger: 0.1, 
        duration: 0.5,
        ease: "power2.out"
      }
    );

    // Animate progress bars
    document.querySelectorAll('.progress-bar-fill').forEach((bar: Element) => {
      const percentage = parseInt(bar.getAttribute('data-percentage') || '0');

      gsap.to(bar, {
        width: `${percentage}%`,
        duration: 1,
        ease: "power2.out"
      });
    });
  };

  onMount(() => {
    const initialize = async () => {
      await fetchProgressData();
      await updateActiveDays();
    };
    
    initialize();

    // Subscribe to the progress store to update the UI when it changes
    const unsubscribe = progressStore.subscribe(newProgressData => {
      if (newProgressData) {
        progressData = newProgressData;
        // Re-animate progress bars when data changes
        gsap.delayedCall(0.1, animateProgressBars);
      }
    });

    // Clean up subscription on component destroy
    return () => {
      unsubscribe();
    };
  });
</script>

<div class="progress-tab" bind:this={_container}>
  <h2 class="section-title">My Progress</h2>

  {#if isLoading}
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading your progress data...</p>
    </div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
      <button class="button" on:click={fetchProgressData}>Try Again</button>
    </div>
  {:else if progressData}
    <div class="progress-overview">
      <div class="stat-card">
        <div class="stat-value">{progressData.totalAttempts || 0}</div>
        <div class="stat-label">Total Attempts</div>
      </div>

      <div class="stat-card">
        <div class="stat-value time-value">{formatTime(progressData.totalTimeSpent || 0)}</div>
        <div class="stat-label">Time Spent</div>
        <button class="add-time-button" on:click={() => showAddTimeForm = true}>
          Add Time
        </button>
      </div>

      <div class="stat-card">
        <div class="stat-value">{getTotalActiveDays(progressData.activeDays || [])}</div>
        <div class="stat-label">Active Days</div>
      </div>
    </div>

    <h3 class="subsection-title">Level Progress</h3>

    {#if progressData.levels && Object.keys(progressData.levels).length > 0}
      <div class="levels-container">
        {#each Object.entries(progressData.levels) as [levelId, levelData], index}
          {@const level = levelData as any}
          <div class="level-card" bind:this={_levelContainers[index]}>
            <div class="level-header">
              <h4 class="level-title">Level {levelId}</h4>
              {#if level.locked}
                <div class="level-locked">
                  <span class="lock-icon">🔒</span>
                  <span>Locked</span>
                </div>
              {:else}
                <div class="level-completion">
                  {calculateLevelCompletion(level)}% Complete
                </div>
              {/if}
            </div>

            <div class="progress-bar">
              <div 
                class="progress-bar-fill" 
                data-percentage={calculateLevelCompletion(level)}
                style="width: 0%"
              ></div>
            </div>

            <div class="units-container" class:locked={level.locked}>
              {#if level.units && Object.keys(level.units).length > 0}
                {#each Object.entries(level.units) as [unitId, unitData]}
                  {@const unit = unitData as any}
                  <div class="unit-item">
                    <div class="unit-header">
                      <span class="unit-title">Unit {unitId}</span>
                      <span class="unit-completion">{calculateUnitCompletion(unit)}%</span>
                    </div>
                    <div class="unit-progress-bar">
                      <div 
                        class="unit-progress-bar-fill" 
                        style={`width: ${calculateUnitCompletion(unit)}%`}
                      ></div>
                    </div>
                  </div>
                {/each}
              {:else}
                <p class="no-data-message">No units available for this level</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="no-data-message">No level progress data available</p>
    {/if}

    {#if progressData.activeDays && progressData.activeDays.length > 0}
      <h3 class="subsection-title">Recent Activity</h3>
      <div class="activity-timeline">
        {#each progressData.activeDays.slice().reverse().slice(0, 10) as day}
          <div class="activity-day">
            <div class="activity-dot"></div>
            <div class="activity-date">{formatDate(day)}</div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="no-data-message">No progress data available. Start learning to track your progress!</p>
  {/if}
  
  <!-- Test Controls - Only visible in development -->
  <TestProgressControls />
  
  <!-- Add Time Modal -->
  {#if showAddTimeForm}
    <div class="modal-overlay">
      <div class="modal-content">
        <h3>Add Time</h3>
        <p>Add practice time to your total time spent</p>
        
        <div class="form-group">
          <label for="timeToAdd">Minutes to add:</label>
          <input 
            type="number" 
            id="timeToAdd" 
            bind:value={timeToAdd} 
            min="1" 
            max="120"
          />
        </div>
        
        <div class="button-group">
          <button class="cancel-button" on:click={() => showAddTimeForm = false}>
            Cancel
          </button>
          <button 
            class="submit-button" 
            on:click={() => {
              addTimeAndSave(timeToAdd * 60); // Convert minutes to seconds
              showAddTimeForm = false;
            }}
          >
            Add Time
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Styles remain unchanged */
  .progress-tab {
    padding: 1rem;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
    color: #2d3748;
  }

  .subsection-title {
    font-size: 1.25rem;
    font-weight: 500;
    margin: 2rem 0 1rem;
    color: #2d3748;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .loading-spinner {
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top: 4px solid #3b82f6;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error-message {
    background-color: #FEE2E2;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
    color: #B91C1C;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .error-message button {
    margin-top: 0.5rem;
  }

  .progress-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background-color: #f7fafc;
    border-radius: 8px;
    padding: 1.25rem;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.08);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: #3b82f6;
    margin-bottom: 0.5rem;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #4a5568;
  }

  .levels-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .level-card {
    background-color: white;
    border-radius: 8px;
    padding: 1.25rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    border: 1px solid #e2e8f0;
  }

  .level-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .level-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #2d3748;
    margin: 0;
  }

  .level-completion {
    font-size: 0.875rem;
    color: #4a5568;
  }

  .level-locked {
    font-size: 0.875rem;
    color: #4a5568;
    display: flex;
    align-items: center;
  }

  .lock-icon {
    margin-right: 0.25rem;
  }

  .progress-bar {
    height: 8px;
    background-color: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .progress-bar-fill {
    height: 100%;
    background-color: #3b82f6;
    border-radius: 4px;
    width: 0%;
  }

  .units-container {
    margin-top: 1rem;
  }

  .units-container.locked {
    opacity: 0.5;
  }

  .unit-item {
    margin-bottom: 0.75rem;
  }

  .unit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .unit-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #4a5568;
  }

  .unit-completion {
    font-size: 0.75rem;
    color: #718096;
  }

  .unit-progress-bar {
    height: 4px;
    background-color: #e2e8f0;
    border-radius: 2px;
    overflow: hidden;
  }

  .unit-progress-bar-fill {
    height: 100%;
    background-color: #4299e1;
    border-radius: 2px;
  }

  .no-data-message {
    color: #718096;
    text-align: center;
    padding: 2rem;
    background-color: #f7fafc;
    border-radius: 6px;
    font-style: italic;
  }

  .activity-timeline {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f7fafc;
    border-radius: 8px;
  }

  .activity-day {
    display: flex;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .activity-dot {
    width: 12px;
    height: 12px;
    background-color: #3b82f6;
    border-radius: 50%;
    margin-right: 0.75rem;
  }

  .activity-date {
    font-size: 0.875rem;
    color: #4a5568;
  }

  .button {
    background-color: #3b82f6;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .button:hover {
    background-color: #2563eb;
  }
  
  .add-time-button {
    background-color: #3b82f6;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-top: 0.5rem;
  }
  
  .add-time-button:hover {
    background-color: #2563eb;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .modal-content {
    background-color: white;
    border-radius: 8px;
    padding: 1.5rem;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .modal-content h3 {
    margin-top: 0;
    font-size: 1.25rem;
    color: #2d3748;
  }
  
  .modal-content p {
    color: #4a5568;
    margin-bottom: 1rem;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: #4a5568;
  }
  
  .form-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .button-group {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  
  .cancel-button {
    background-color: #e2e8f0;
    color: #4a5568;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .cancel-button:hover {
    background-color: #cbd5e0;
  }
  
  .submit-button {
    background-color: #3b82f6;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .submit-button:hover {
    background-color: #2563eb;
  }
</style>

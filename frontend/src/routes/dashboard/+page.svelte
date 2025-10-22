<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { goto } from '$app/navigation';
  import { profileApi, authApi, subscriptionApi } from '$lib/api';
  import { browser } from '$app/environment';
  import InvoicePopup from '$lib/InvoicePopup.svelte';
  import BillingPopup from '$lib/BillingPopup.svelte';
  import ProgressTab from '$lib/components/ProgressTab.svelte';
  
  let isLoading = true;
  let profileData: any = null;
  let error = '';
  let _container: HTMLElement;
  let _sections: HTMLElement[] = [];
  let mfaEnabled = false;
  let mfaLoading = false;
  let subscriptionPlans: any[] = [];
  let subscriptionPlansLoading = false;
  let selectedPlanVariationId: string | null = null;
  let isResettingPassword = false;
  let resetPasswordMessage = '';
  let resetPasswordSuccess = false;
  
  // Email update state
  let isUpdatingEmail = false;
  let updateEmailMessage = '';
  let updateEmailSuccess = false;
  let newEmail = '';
  let showEmailUpdateForm = false;
  
  // Name update state
  let isUpdatingName = false;
  let nameUpdateMessage = '';
  let nameUpdateSuccess = false;
  let newName = '';
  let showNameUpdateForm = false;
  
  // University update state
  let isUpdatingUniversity = false;
  let universityUpdateMessage = '';
  let universityUpdateSuccess = false;
  let newUniversity = '';
  let showUniversityUpdateForm = false;
  
  // Subscription update state
  let isUpdatingSubscription = false;
  let subscriptionUpdateMessage = '';
  let subscriptionUpdateSuccess = false;
  
  // Invoice popup state
  let showInvoicePopup = false;
  let invoices: any[] = [];
  let invoicesLoading = false;
  let invoiceErrorMessage = '';
  
  // Billing popup state
  let showBillingPopup = false;
  let billingErrorMessage = '';
  
  // MFA State
  let qrCode: string | null = null;
  let factorId: string | null = null;
  let totpCode: string = '';
  let mfaFeedback: string = '';
  let disablingMfa: boolean = false;
  
  // Accordion state
  let expandedSections = [true, true, true, true]; // Initially all sections are expanded
  let _sectionContents: HTMLElement[] = [];
  
  // Dashboard view state
  let activeView = 'lessons'; // 'lessons', 'progress', or 'settings'
  let _menuContainer: HTMLElement;
  
  // Notification preferences
  let notificationPreferences = {
    tipsAndGuidance: false,
    productUpdates: false
  };
  let isUpdatingNotifications = false;
  let notificationUpdateMessage = '';
  let notificationUpdateSuccess = false;
  
  // Debug state for Mailchimp
  let isAddingToMailchimp = false;
  let mailchimpMessage = '';
  let mailchimpSuccess = false;
  
  // Fetch user profile data
  const fetchProfileData = async () => {
    if (!browser) {
      isLoading = false;
      return;
    }
    
    isLoading = true;
    
    try {
      const response = await profileApi.getProfile();
      if (response.data.success) {
        profileData = response.data.data;
        console.log('Profile data received:', profileData);
        
        // Set notification preferences from profile data
        notificationPreferences = {
          tipsAndGuidance: profileData.tips_and_guidance || false,
          productUpdates: profileData.product_updates || false
        };
        
        // Set the current subscription as initially selected
        if (profileData?.square_subscription_variation_id) {
          selectedPlanVariationId = profileData.square_subscription_variation_id;
        }
        
        // Also fetch subscription details to get pending plan changes
        await fetchUserSubscriptionDetails();
      } else {
        console.error('Error fetching profile:', response.data.message);
        error = 'Failed to load profile data';
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
        console.log('Auth token invalid or expired, redirecting to login');
        goto('/login');
      }
      error = 'Failed to load profile data';
    } finally {
      isLoading = false;
    }
  };
  
  // Fetch user subscription details including pending plan changes
  let pendingPlanChange: { effective_date: string; new_plan_variation_id: string } | null = null;
  let isCanceled = false;
  let subscriptionEndDate: string | null = null;
  
  const fetchUserSubscriptionDetails = async () => {
    if (!browser) return;
    
    try {
      console.log('Fetching user subscription details...');
      const response = await subscriptionApi.getUserSubscriptions();
      console.log('Subscription details response:', response.data);
      
      if (response.data.success && response.data.data) {
        // Store pending plan change information if available
        pendingPlanChange = response.data.data.pending_plan_change;
        isCanceled = response.data.data.is_canceled || false;
        subscriptionEndDate = response.data.data.subscription_end_date || null;
        console.log('Pending plan change set to:', pendingPlanChange);
        console.log('Subscription canceled:', isCanceled);
        console.log('Subscription end date:', subscriptionEndDate);
        
        if (pendingPlanChange) {
          console.log('Found pending plan change with new variation ID:', pendingPlanChange.new_plan_variation_id);
        } else {
          console.log('No pending plan change found in response');
        }
      }
    } catch (err) {
      console.error('Error fetching subscription details:', err);
    }
  };
  
  // Fetch MFA status
  const fetchMfaStatus = async () => {
    try {
      const response = await authApi.getUserMfaStatus();
      console.log('Raw MFA status response:', response.data);
      
      mfaEnabled = response.data.data.mfaEnabled;
      
      // Get factorId from the first verified factor
      const factors = response.data.data.factors || [];
      factorId = factors.length > 0 ? factors[0].id : null;
      
      qrCode = null;
      console.log('Processed MFA status:', { mfaEnabled, factorId, factors });
    } catch (err) {
      console.error('Error fetching MFA status:', err);
    }
  };
  
  // Fetch subscription plans
  const fetchSubscriptionPlans = async () => {
    if (!browser) return;
    
    subscriptionPlansLoading = true;
    try {
      const response = await subscriptionApi.getSubscriptionPlans();
      if (response.data.success) {
        // Transform the plan variations into separate plans for display
        const plansFromApi = response.data.objects || [];
        const transformedPlans: any[] = [];
        
        plansFromApi.forEach((plan: any) => {
          if (plan.variations && plan.variations.length > 0) {
            // Create a separate plan for each variation
            plan.variations.forEach((variation: any) => {
              const variationPlan = {
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
        
        subscriptionPlans = transformedPlans;
        console.log('Transformed subscription plans:', subscriptionPlans);
      }
    } catch (err) {
      console.error('Error fetching subscription plans:', err);
    } finally {
      subscriptionPlansLoading = false;
    }
  };
  
  // Handle canceling subscription
  const cancelSubscription = async () => {
    if (!profileData?.square_subscription_id) {
      return;
    }
    
    try {
      const response = await subscriptionApi.cancelSubscription(profileData.square_subscription_id);
      if (response.data.success) {
        // Update profile data to reflect cancellation
        profileData = {
          ...profileData,
          square_subscription_status: 'CANCELED',
          square_subscription_canceled_date: response.data.cancelDate || new Date().toISOString()
        };
        
        // Show success message
        if (response.data.alreadyCanceled) {
          alert('Your subscription is already scheduled for cancellation. You will have access until the end of your current billing period.');
        } else {
          alert('Your subscription has been canceled successfully. You will have access until the end of your current billing period.');
        }
      } else {
        alert('Failed to cancel subscription: ' + response.data.message);
      }
    } catch (err) {
      console.error('Error canceling subscription:', err);
      alert('An error occurred while canceling your subscription. Please try again later.');
    }
  };
  
  // Handle navigation to different sections
  const navigateTo = (path: string) => {
    gsap.to(_container, { 
      opacity: 0, 
      y: -20, 
      duration: 0.3,
      onComplete: () => {
        goto(path);
      }
    });
  };
  
  // Toggle section visibility
  const toggleSection = (index: number) => {
    expandedSections[index] = !expandedSections[index];
    
    if (expandedSections[index]) {
      // Expand the section
      gsap.to(_sectionContents[index], {
        height: 'auto',
        opacity: 1,
        paddingTop: '1.5rem',
        paddingBottom: '1.5rem',
        duration: 0.3,
        ease: "power2.out"
      });
    } else {
      // Collapse the section
      gsap.to(_sectionContents[index], {
        height: 0,
        opacity: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 0.3,
        ease: "power2.in"
      });
    }
  };
  
  // Switch dashboard view
  const switchView = (view: string) => {
    if (view === activeView) return;
    
    // Animate current view out
    gsap.to(_container, {
      opacity: 0,
      x: 20,
      duration: 0.3,
      onComplete: () => {
        activeView = view;
        
        // Animate new view in
        gsap.to(_container, {
          opacity: 1,
          x: 0,
          duration: 0.3
        });
      }
    });
  };
  
  // Handle enabling 2FA (enroll)
  const enableTwoFactor = async () => {
    if (!profileData) return;
    mfaLoading = true;
    try {
      const response = await authApi.enrollMfa();
      if (response.data.success) {
        qrCode = response.data.data.qrCode;
        factorId = response.data.data.factorId;
        mfaFeedback = '';
      } else {
        mfaFeedback = response.data.message || 'Failed to enable 2FA.';
        console.error('Failed to enable 2FA:', response.data.message);
      }
    } catch (err) {
      mfaFeedback = 'Error enabling 2FA.';
      console.error('Error enabling 2FA:', err);
    } finally {
      mfaLoading = false;
    }
  };
  
  // Handle disabling MFA
  const disableTwoFactor = async () => {
    console.log('Disable 2FA button clicked, factorId:', factorId);
    
    if (!factorId) {
      mfaFeedback = 'Error: Factor ID not found';
      console.error('Cannot disable MFA: No factor ID available');
      return;
    }
    
    disablingMfa = true;
    mfaFeedback = '';
    
    try {
      console.log('Calling disableMfa API with factorId:', factorId);
      const response = await authApi.disableMfa(factorId);
      console.log('Disable MFA response:', response.data);
      
      if (response.data.success) {
        mfaFeedback = 'Two-factor authentication disabled successfully';
        await fetchMfaStatus(); // Refresh MFA status
      } else {
        mfaFeedback = response.data.message || 'Failed to disable 2FA';
        console.error('Failed to disable 2FA:', response.data);
      }
    } catch (err) {
      mfaFeedback = 'Error disabling 2FA. Please try again.';
      console.error('Error disabling 2FA:', err);
    } finally {
      disablingMfa = false;
    }
  };
  
  // Handle TOTP code submission (challenge + verify)
  const submitTotpCode = async () => {
    if (!factorId || !totpCode) return;
    mfaFeedback = '';
    try {
      // 1. Challenge
      if (!factorId) return;
      const challengeResp = await authApi.challengeMfa(factorId as string, '');
      
      if (challengeResp.data.success) {
        const challengeId = challengeResp.data.data.id;
        
        // 2. Verify
        const verifyResp = await authApi.verifyMfaChallenge(factorId as string, challengeId, totpCode);
        
        if (verifyResp.data.success) {
          mfaFeedback = 'Two-factor authentication enabled successfully!';
          await fetchMfaStatus();
        } else {
          mfaFeedback = verifyResp.data.message || 'Verification failed. Please try again.';
        }
      } else {
        mfaFeedback = challengeResp.data.message || 'Challenge failed. Please try again.';
      }
    } catch (err) {
      mfaFeedback = 'Error verifying code. Please try again.';
      console.error('Error verifying TOTP code:', err);
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
  
  // Handle subscription plan selection
  const selectPlan = (variationId: string) => {
    if (variationId === selectedPlanVariationId) return;
    selectedPlanVariationId = variationId;
  };
  
  // Check if update subscription button should be disabled
  const isUpdateButtonDisabled = () => {
    // Disable the button if the subscription is canceled
    if (isCanceled) {
      return true;
    }
    
    return isUpdatingSubscription || 
           !selectedPlanVariationId || 
           selectedPlanVariationId === profileData?.square_subscription_variation_id ||
           !!pendingPlanChange;
  };
  
  // Handle password reset
  const resetPassword = async () => {
    if (!profileData?.email) {
      resetPasswordMessage = 'Unable to reset password: email not found';
      resetPasswordSuccess = false;
      return;
    }
    
    isResettingPassword = true;
    resetPasswordMessage = '';
    
    try {
      const response = await authApi.resetPassword(profileData.email);
      if (response.data.success) {
        resetPasswordMessage = 'Password reset email sent. Please check your inbox.';
        resetPasswordSuccess = true;
      } else {
        resetPasswordMessage = response.data.message || 'Failed to send password reset email';
        resetPasswordSuccess = false;
      }
    } catch (err) {
      console.error('Error resetting password:', err);
      resetPasswordMessage = 'An error occurred while sending the password reset email';
      resetPasswordSuccess = false;
    } finally {
      isResettingPassword = false;
    }
  };
  
  // Handle email update
  const updateEmail = async () => {
    if (!profileData?.email || !newEmail) {
      updateEmailMessage = 'Please enter a new email address';
      updateEmailSuccess = false;
      return;
    }
    
    isUpdatingEmail = true;
    updateEmailMessage = '';
    
    try {
      const response = await authApi.updateEmail(newEmail);
      if (response.data.success) {
        updateEmailMessage = 'Confirmation email sent! Please check your new email address to complete the change.';
        updateEmailSuccess = true;
        newEmail = ''; // Clear the input field after successful request
      } else {
        updateEmailMessage = response.data.message || 'Failed to request email change';
        updateEmailSuccess = false;
      }
    } catch (err) {
      console.error('Error requesting email change:', err);
      updateEmailMessage = 'An error occurred while requesting the email change';
      updateEmailSuccess = false;
    } finally {
      isUpdatingEmail = false;
    }
  };
  
  // Fetch user invoices
  const fetchUserInvoices = async () => {
    if (!browser) return;
    
    // Show popup immediately with loading state
    showInvoicePopup = true;
    invoicesLoading = true;
    invoices = [];
    invoiceErrorMessage = ''; // Reset error message
    
    try {
      const response = await subscriptionApi.getUserInvoices();
      if (response.data.success) {
        invoices = response.data.invoices || [];
        
        // If there's a message but no invoices, show it as information
        if (response.data.message && (!invoices.length || invoices.length === 0)) {
          invoiceErrorMessage = response.data.message;
        }
        
        console.log('Invoices received:', invoices);
      } else {
        console.error('Error fetching invoices:', response.data.message);
        invoiceErrorMessage = response.data.message || 'Failed to fetch invoices';
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      invoiceErrorMessage = 'An error occurred while fetching invoices';
    } finally {
      invoicesLoading = false;
    }
  };
  
  // Close invoice popup
  const closeInvoicePopup = () => {
    showInvoicePopup = false;
  };
  
  // Handle view billing info
  const handleViewBilling = () => {
    if (!profileData?.squareCustomerId) {
      billingErrorMessage = 'Unable to manage payment method: Missing customer information.';
      console.error('Missing Square customer ID in profile data', profileData);
      return;
    }
    
    if (!profileData?.square_subscription_id) {
      billingErrorMessage = 'Unable to manage payment method: Missing subscription information.';
      console.error('Missing Square subscription ID in profile data', profileData);
      return;
    }
    
    showBillingPopup = true;
    billingErrorMessage = '';
  };
  
  // Handle close billing popup
  const handleCloseBillingPopup = () => {
    showBillingPopup = false;
  };
  
  // Handle updating subscription plan
  const updateSubscriptionPlan = async () => {
    if (!profileData?.square_subscription_id || !selectedPlanVariationId) {
      return;
    }

    // Reset message state
    subscriptionUpdateMessage = '';
    subscriptionUpdateSuccess = false;
    isUpdatingSubscription = true;

    try {
      // Find the selected plan to show in the message
      const selectedPlan = subscriptionPlans.find(plan => plan.id === selectedPlanVariationId);
      const planName = selectedPlan ? selectedPlan.name : 'new plan';

      subscriptionUpdateMessage = `Updating your subscription to ${planName}...`;

      // Always fetch the latest profile to get squareCustomerId
      const profileResp = await profileApi.getProfile();
      const squareCustomerId = profileResp?.data?.data?.squareCustomerId || profileResp?.data?.squareCustomerId;
      if (!squareCustomerId) throw new Error('Missing Square customer ID');

      const response = await subscriptionApi.swapPlan(
        profileData.square_subscription_id,
        selectedPlanVariationId,
        squareCustomerId
      );

      if (response.data.success) {
        // Update the local profile data
        profileData.square_subscription_variation_id = selectedPlanVariationId;
        // Update the UI with the new plan details
        if (selectedPlan) {
          profileData.subscription_plan_name = selectedPlan.name;
          profileData.subscription_plan_interval = selectedPlan.interval;
        }
        subscriptionUpdateSuccess = true;
        subscriptionUpdateMessage = `Your subscription has been successfully updated to ${planName}.`;
        
        // Refresh subscription details to get pending plan change info
        await fetchUserSubscriptionDetails();
      } else {
        subscriptionUpdateSuccess = false;
        let errorMessage = 'An error occurred while updating your subscription.';
        if (response.data && response.data.message) {
          errorMessage = response.data.message;
        }
        subscriptionUpdateMessage = `Error: ${errorMessage}`;
      }
    } catch (err) {
      subscriptionUpdateSuccess = false;
      let errorMessage = 'An error occurred while updating your subscription.';
      if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
        errorMessage = (err as any).message;
      }
      subscriptionUpdateMessage = `Error: ${errorMessage}`;
    } finally {
      isUpdatingSubscription = false;
    }
  };
  
  // Check for email changes and sync if needed
  const checkAndSyncEmailChange = async () => {
    try {
      // First check if email needs to be synced
      const checkResponse = await authApi.checkEmailChange();
      if (checkResponse.data.success && checkResponse.data.data.needsSync) {
        console.log('Email needs to be synced:', checkResponse.data.data);
        
        // Sync email in database
        const syncResponse = await authApi.syncEmailChange();
        if (syncResponse.data.success && syncResponse.data.data.synced) {
          console.log('Email synced successfully:', syncResponse.data.data);
          
          // Update profile data with new email
          if (profileData && syncResponse.data.data.newEmail) {
            profileData.email = syncResponse.data.data.newEmail;
          }
        }
      }
    } catch (err) {
      console.error('Error checking/syncing email:', err);
    }
  };

  // Handle saving notification preferences
  const saveNotificationPreferences = async () => {
    isUpdatingNotifications = true;
    notificationUpdateMessage = '';
    
    try {
      const response = await profileApi.updateNotificationPreferences(notificationPreferences);
      
      if (response.data.success) {
        notificationUpdateMessage = 'Notification preferences saved successfully!';
        notificationUpdateSuccess = true;
        
        // Update the profile data with new preferences
        if (profileData) {
          profileData.tips_and_guidance = notificationPreferences.tipsAndGuidance;
          profileData.product_updates = notificationPreferences.productUpdates;
        }
      } else {
        notificationUpdateMessage = response.data.message || 'Failed to save notification preferences';
        notificationUpdateSuccess = false;
      }
    } catch (err) {
      console.error('Error saving notification preferences:', err);
      notificationUpdateMessage = 'An error occurred while saving notification preferences. Please try again.';
      notificationUpdateSuccess = false;
    } finally {
      isUpdatingNotifications = false;
      
      // Auto-hide the message after 5 seconds using GSAP instead of setTimeout
      gsap.delayedCall(5, () => {
        notificationUpdateMessage = '';
      });
    }
  };

  // Handle updating the user's name
  const updateUserName = async () => {
    if (!newName.trim()) {
      nameUpdateMessage = 'Please enter a valid name';
      nameUpdateSuccess = false;
      return;
    }
    
    isUpdatingName = true;
    nameUpdateMessage = '';
    
    try {
      const response = await profileApi.updateName(newName.trim());
      
      if (response.data.success) {
        nameUpdateSuccess = true;
        nameUpdateMessage = 'Name updated successfully!';
        
        // Update the profile data with the new name
        if (profileData) {
          profileData.name = newName.trim();
        }
        
        // Hide the form after successful update
        showNameUpdateForm = false;
      } else {
        nameUpdateSuccess = false;
        nameUpdateMessage = response.data.message || 'Failed to update name';
      }
    } catch (error) {
      console.error('Error updating name:', error);
      nameUpdateSuccess = false;
      nameUpdateMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    } finally {
      isUpdatingName = false;
    }
  };
  
  // Update user's university
  const updateUserUniversity = async () => {
    if (!newUniversity.trim()) {
      universityUpdateMessage = 'Please enter a valid university name';
      universityUpdateSuccess = false;
      return;
    }
    
    isUpdatingUniversity = true;
    universityUpdateMessage = '';
    
    try {
      const response = await profileApi.updateUniversity(newUniversity.trim());
      
      if (response.data.success) {
        universityUpdateSuccess = true;
        universityUpdateMessage = 'University updated successfully!';
        
        // Update the profile data with the new university
        if (profileData) {
          profileData.university = newUniversity.trim();
        }
        
        // Hide the form after successful update
        showUniversityUpdateForm = false;
      } else {
        universityUpdateSuccess = false;
        universityUpdateMessage = response.data.message || 'Failed to update university';
      }
    } catch (error) {
      console.error('Error updating university:', error);
      universityUpdateSuccess = false;
      universityUpdateMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    } finally {
      isUpdatingUniversity = false;
    }
  };

  // Handle adding current user to Mailchimp
  const addCurrentUserToMailchimp = async () => {
    if (!profileData) return;
    isAddingToMailchimp = true;
    mailchimpMessage = '';
    
    try {
      const response = await profileApi.addCurrentUserToMailchimp();
      
      if (response.data.success) {
        mailchimpMessage = 'User added to Mailchimp successfully!';
        mailchimpSuccess = true;
      } else {
        mailchimpMessage = response.data.message || 'Failed to add user to Mailchimp';
        mailchimpSuccess = false;
      }
    } catch (err) {
      console.error('Error adding user to Mailchimp:', err);
      mailchimpMessage = 'An error occurred while adding user to Mailchimp';
      mailchimpSuccess = false;
    } finally {
      isAddingToMailchimp = false;
      
      // Auto-hide the message after 5 seconds using GSAP
      gsap.delayedCall(5, () => {
        mailchimpMessage = '';
      });
    }
  };

  onMount(async () => {
    await fetchProfileData();
    await fetchSubscriptionPlans();
    await checkAndSyncEmailChange();
    
    // Fetch MFA status directly
    await fetchMfaStatus();
    
    // Animate container in
    if (browser && _container) {
      gsap.fromTo(_container, 
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, onComplete: animateSections }
      );
    }
    
    // Initialize section heights
    setTimeout(() => {
      _sectionContents.forEach((section, index) => {
        if (!expandedSections[index]) {
          gsap.set(section, { 
            height: 0, 
            opacity: 0,
            paddingTop: 0,
            paddingBottom: 0
          });
        }
      });
    }, 0);
    
    // Animate menu in
    if (browser && _menuContainer) {
      gsap.fromTo(_menuContainer,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.5, delay: 0.2 }
      );
    }
  });

  // Still keep the reactive fetch for when profile data changes
  $: if (profileData) {
    fetchMfaStatus();
  }
</script>

<svelte:head>
  <title>Dashboard - Dawn Sign Press</title>
</svelte:head>

<div class="dashboard-layout">
  <!-- Left side menu -->
  <div class="dashboard-menu" bind:this={_menuContainer}>
    <div class="menu-items">
      <button 
        class="menu-item {activeView === 'lessons' ? 'active' : ''}" 
        on:click={() => switchView('lessons')}
        aria-label="Lessons"
      >
        <div class="menu-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none">
            <rect x="4" y="4" width="6" height="6" rx="1" />
            <rect x="14" y="4" width="6" height="6" rx="1" />
            <rect x="4" y="14" width="6" height="6" rx="1" />
            <rect x="14" y="14" width="6" height="6" rx="1" />
          </svg>
        </div>
      </button>
      
      <button 
        class="menu-item {activeView === 'progress' ? 'active' : ''}" 
        on:click={() => switchView('progress')}
        aria-label="My Progress"
      >
        <div class="menu-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none">
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6" y1="20" x2="6" y2="16" />
          </svg>
        </div>
      </button>
      
      <button 
        class="menu-item {activeView === 'settings' ? 'active' : ''}" 
        on:click={() => switchView('settings')}
        aria-label="Settings"
      >
        <div class="menu-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>
      </button>
    </div>
  </div>

  <!-- Dashboard content -->
  <div class="dashboard-container" bind:this={_container}>
    {#if activeView === 'lessons'}
      {#if isLoading}
        <div class="loading">Loading your dashboard...</div>
      {:else if error}
        <div class="error-message">
          <p>{error}</p>
          <button class="button" on:click={() => goto('/login')}>Return to Login</button>
        </div>
      {:else}
        <h1 class="welcome-message">Hi {profileData?.name || 'there'}!</h1>
        <p>Explore our ASL lessons and learning materials.</p>
        <!-- Lessons content will go here -->
        <div class="placeholder-content">
          <p>Lesson content coming soon!</p>
        </div>
      {/if}
    {:else if activeView === 'progress'}
      <h1>My Progress</h1>
      <p>Track your learning journey and achievements.</p>
      <!-- Progress content will go here -->
      <div class="progress-view">
        <svelte:component this={ProgressTab} {profileData} />
      </div>
    {:else}
      <h1>Dashboard Settings</h1>
      {#if isLoading}
        <div class="loading">Loading your dashboard...</div>
      {:else if error}
        <div class="error-message">
          <p>{error}</p>
          <button class="button" on:click={() => goto('/login')}>Return to Login</button>
        </div>
      {:else}
        <!-- Account Section -->
        <div class="dashboard-section" bind:this={_sections[0]}>
          <div class="section-header" on:click={() => toggleSection(0)} on:keydown={(e) => e.key === 'Enter' && toggleSection(0)} tabindex="0" role="button">
            <h2>Account</h2>
            <button class="toggle-button" aria-label={expandedSections[0] ? 'Collapse section' : 'Expand section'}>
              {expandedSections[0] ? '−' : '+'}
            </button>
          </div>
          <div class="section-content" bind:this={_sectionContents[0]}>
            <p class="section-description">
              Manage your login and profile credentials or change your password.
            </p>
            
            <div class="profile-items">
              <div class="profile-item">
                <div class="profile-icon">👤</div>
                <div class="profile-value">
                  {profileData?.name || 'Not set'}
                  <button 
                    class="button small" 
                    on:click={() => {
                      newName = profileData?.name || '';
                      isUpdatingName = !isUpdatingName;
                    }} 
                    disabled={isUpdatingName}
                  >
                    {isUpdatingName ? 'Cancel' : 'Change'}
                  </button>
                  {#if isUpdatingName}
                    <div class="email-update-container">
                      <p class="email-update-info">Enter your new name. This will update your name across all systems.</p>
                      <input 
                        type="text" 
                        placeholder="Enter new name" 
                        bind:value={newName}
                        class="email-input"
                      />
                      <button 
                        class="email-update-button" 
                        on:click={updateUserName} 
                        disabled={!newName}
                      >
                        {isUpdatingName && newName ? 'Update' : 'Update'}
                      </button>
                      {#if nameUpdateMessage}
                        <div class="feedback-message {nameUpdateSuccess ? 'success-message' : 'error-message'}">
                          {nameUpdateMessage}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              
              <div class="profile-item">
                <div class="profile-icon">🎓</div>
                <div class="profile-value">
                  {profileData?.university || 'Not set'}
                  <button 
                    class="button small" 
                    on:click={() => {
                      newUniversity = profileData?.university || '';
                      isUpdatingUniversity = !isUpdatingUniversity;
                    }} 
                    disabled={isUpdatingUniversity}
                  >
                    {isUpdatingUniversity ? 'Cancel' : 'Change'}
                  </button>
                  {#if isUpdatingUniversity}
                    <div class="email-update-container">
                      <p class="email-update-info">Enter your university name.</p>
                      <input 
                        type="text" 
                        placeholder="Enter university name" 
                        bind:value={newUniversity}
                        class="email-input"
                      />
                      <button 
                        class="email-update-button" 
                        on:click={updateUserUniversity} 
                        disabled={!newUniversity}
                      >
                        {isUpdatingUniversity && newUniversity ? 'Update' : 'Update'}
                      </button>
                      {#if universityUpdateMessage}
                        <div class="feedback-message {universityUpdateSuccess ? 'success-message' : 'error-message'}">
                          {universityUpdateMessage}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              
              <div class="profile-item">
                <div class="profile-icon">✉️</div>
                <div class="profile-value">
                  {profileData?.email || 'Not set'}
                  <button 
                    class="button small" 
                    on:click={() => isUpdatingEmail = !isUpdatingEmail} 
                    disabled={isUpdatingEmail}
                  >
                    {isUpdatingEmail ? 'Cancel' : 'Change'}
                  </button>
                  {#if isUpdatingEmail}
                    <div class="email-update-container">
                      <p class="email-update-info">To change your email, enter your new email address below. A confirmation email will be sent to the new address.</p>
                      <input 
                        type="email" 
                        placeholder="Enter new email" 
                        bind:value={newEmail}
                        class="email-input"
                      />
                      <button 
                        class="email-update-button" 
                        on:click={updateEmail} 
                        disabled={!newEmail}
                      >
                        {isUpdatingEmail && newEmail ? 'Send Confirmation' : 'Send Confirmation'}
                      </button>
                      {#if updateEmailMessage}
                        <div class="feedback-message {updateEmailSuccess ? 'success-message' : 'error-message'}">
                          {updateEmailMessage}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              
              <div class="profile-item">
                <div class="profile-icon">🔑</div>
                <div class="profile-value">
                  Password
                  <button 
                    class="button small" 
                    on:click={resetPassword} 
                    disabled={isResettingPassword}
                  >
                    {isResettingPassword ? 'Sending...' : 'Reset'}
                  </button>
                </div>
              </div>
              
              {#if resetPasswordMessage}
                <div class="feedback-message {resetPasswordSuccess ? 'success-message' : 'error-message'}">
                  {resetPasswordMessage}
                </div>
              {/if}
            </div>
            
            <div class="section-footer">
              <button class="button secondary" on:click={() => navigateTo('/profile')}>
                Save changes
              </button>
              <button class="button danger" on:click={() => goto('/login')}>
                Sign out
              </button>
            </div>
          </div>
        </div>
        
        <!-- Security Section -->
        <div class="dashboard-section" bind:this={_sections[1]}>
          <div class="section-header" on:click={() => toggleSection(1)} on:keydown={(e) => e.key === 'Enter' && toggleSection(1)} tabindex="0" role="button">
            <h2>Security</h2>
            <button class="toggle-button" aria-label={expandedSections[1] ? 'Collapse section' : 'Expand section'}>
              {expandedSections[1] ? '−' : '+'}
            </button>
          </div>
          <div class="section-content" bind:this={_sectionContents[1]}>
            <p class="section-description">
              Enable two-factor authentication and enhance the security of your account.
            </p>
            
            <div class="security-info">
              <h3>Secure your account with 2FA</h3>
              
              <ul class="security-benefits">
                <li>✓ Extra layer of protection for your account</li>
                <li>✓ No risk of compromised password or learning progress</li>
                <li>✓ Enjoy worry-free learning</li>
              </ul>
              
              {#if mfaEnabled}
                <div class="mfa-status">
                  <button class="button primary" disabled>
                    Two Factor Authentication Enabled
                  </button>
                  <button 
                    type="button"
                    class="button secondary" 
                    on:click|preventDefault|stopPropagation={() => {
                      console.log('Disable button clicked');
                      disableTwoFactor();
                    }} 
                    disabled={disablingMfa}
                  >
                    {disablingMfa ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </div>
                <div style="margin-top: 10px;">
                  <small>Factor ID: {factorId || 'Not available'}</small>
                </div>
                
                {#if mfaFeedback}
                  <div class="mfa-feedback {mfaFeedback.includes('successfully') ? 'success' : 'error'}">
                    {mfaFeedback}
                  </div>
                {/if}
              {:else}
                {#if qrCode}
                  <div>
                    <div>Scan this QR code in your authenticator app:</div>
                    <img src={qrCode} alt="MFA QR Code" style="width:180px;height:180px;" />
                    <input type="text" placeholder="Enter code from app" bind:value={totpCode} maxlength={6} style="width:120px;" />
                    <button on:click={submitTotpCode} disabled={!totpCode || mfaLoading}>Verify</button>
                    {#if mfaFeedback}
                      <div class="mfa-feedback">{mfaFeedback}</div>
                    {/if}
                  </div>
                {:else}
                  <button class="button primary" on:click={enableTwoFactor} disabled={mfaLoading || !profileData}>
                    {#if mfaLoading}
                      Loading...
                    {:else}
                      Enable Two Factor Authentication
                    {/if}
                  </button>
                {/if}
              {/if}
            </div>
          </div>
        </div>
        
        <!-- Subscription Section -->
        <div class="dashboard-section" bind:this={_sections[2]}>
          <div class="section-header" on:click={() => toggleSection(2)} on:keydown={(e) => e.key === 'Enter' && toggleSection(2)} tabindex="0" role="button">
            <h2>Subscription plan</h2>
            <button class="toggle-button" aria-label={expandedSections[2] ? 'Collapse section' : 'Expand section'}>
              {expandedSections[2] ? '−' : '+'}
            </button>
          </div>
          <div class="section-content" bind:this={_sectionContents[2]}>
            <p class="section-description">
              View and manage your current subscription plan, billing information, and payment.
            </p>
            
            {#if !profileData?.square_subscription_id}
              <div class="subscription-status free-trial">
                <strong>Free Trial:</strong> You are currently on the free trial. Subscribe to a plan to access all features and content.
              </div>
            {/if}
            
            {#if pendingPlanChange}
              <div class="pending-plan-change">
                {#if subscriptionPlans.length > 0}
                  {@const pendingPlanId = pendingPlanChange?.new_plan_variation_id || ''}
                  {#if pendingPlanId}
                    {@const pendingPlan = subscriptionPlans.find(plan => plan.id === pendingPlanId)}
                    <p>
                      <strong>Pending Plan Change:</strong> Your subscription will change to 
                      <strong>{pendingPlan ? pendingPlan.name : 'new plan'}</strong> 
                      on {new Date(pendingPlanChange.effective_date).toLocaleDateString()}.
                    </p>
                    <p class="pending-plan-note">
                      Your current billing cycle will continue until this date, when the new plan will take effect.
                    </p>
                  {/if}
                {/if}
              </div>
            {/if}
            
            <div class="subscription-plans">
              {#if subscriptionPlansLoading}
                <div class="loading">Loading subscription plans...</div>
              {:else if subscriptionPlans.length === 0}
                <div class="no-plans">No subscription plans available at this time.</div>
              {:else}
                {#each subscriptionPlans as plan}
                  <div 
                    class="plan-option plan-{plan.id} {selectedPlanVariationId === plan.id ? 'selected' : ''} {profileData?.square_subscription_variation_id === plan.id ? 'current' : ''} {plan.interval === 'yearly' ? 'best-value' : ''}"
                    on:click={() => selectPlan(plan.id)}
                    on:keydown={(e) => e.key === 'Enter' && selectPlan(plan.id)}
                    role="button"
                    tabindex="0"
                  >
                    <div class="plan-header">
                      {#if profileData?.square_subscription_variation_id === plan.id}
                        <span class="plan-tag">Current plan</span>
                      {/if}
                      {#if plan.interval === 'yearly'}
                        <span class="plan-tag highlight">Best Value</span>
                      {/if}
                      <h3>{plan.name}</h3>
                      <p class="plan-description">{plan.description || `Access to all ASL resources with ${plan.name.toLowerCase()} billing.`}</p>
                    </div>
                    
                    <div class="plan-price">
                      <span class="price">{plan.formattedMonthlyPrice}</span>
                      <span class="price-period">/month equiv.</span>
                    </div>
                    
                    {#if plan.variation && plan.interval === 'monthly'}
                      <div class="price-details">
                        Billed monthly at {plan.variation.formattedPrice}
                      </div>
                    {:else if plan.variation && plan.interval === 'semester'}
                      <div class="plan-savings">
                        Save 16% compared to monthly
                      </div>
                      <div class="price-details">
                        Billed every 6 months at {plan.variation.formattedTotalPrice}
                      </div>
                    {:else if plan.variation && plan.interval === 'yearly'}
                      <div class="plan-savings">
                        Save 25% compared to monthly
                      </div>
                      <div class="price-details">
                        Billed annually at {plan.variation.formattedTotalPrice}
                      </div>
                    {/if}
                    
                    <ul class="plan-features">
                      <li><span class="check-icon">✓</span> Access to all 500 signs</li>
                      <li><span class="check-icon">✓</span> Interactive quizzes</li>
                      <li><span class="check-icon">✓</span> Advanced sign recognition</li>
                    </ul>
                  </div>
                {/each}
              {/if}
            </div>
            
            <div class="section-footer subscription-actions">
              <button 
                class="button secondary" 
                on:click={updateSubscriptionPlan}
                disabled={isUpdateButtonDisabled()}
              >
                {#if isUpdatingSubscription}
                  Updating...
                {:else}
                  Update subscription
                {/if}
              </button>
              {#if profileData?.square_subscription_id && profileData?.square_subscription_status === 'ACTIVE' && !isCanceled}
                <button 
                  class="button danger" 
                  on:click={() => {
                    if (confirm('Are you sure you want to cancel your subscription? You will have access until the end of your current billing period.')) {
                      cancelSubscription();
                    }
                  }}
                >
                  Cancel subscription
                </button>
              {:else if isCanceled && subscriptionEndDate}
                <div class="subscription-status canceled">
                  Your subscription has been canceled and will end on {new Date(subscriptionEndDate).toLocaleDateString()}.
                </div>
              {:else if profileData?.square_subscription_status === 'CANCELED' || profileData?.square_subscription_canceled_date}
                <div class="subscription-status canceled">
                  Your subscription is scheduled to end on {new Date(profileData?.square_subscription_canceled_date).toLocaleDateString()}.
                </div>
              {/if}
              <div class="action-links">
                <button 
                  class="link-button" 
                  on:click|preventDefault={fetchUserInvoices}
                >
                  View invoices
                  {#if invoicesLoading}
                    <span class="loading-indicator">...</span>
                  {/if}
                </button>
                <button 
                  class="link-button" 
                  on:click|preventDefault={handleViewBilling}
                >
                  Manage Payment Method
                </button>
                {#if billingErrorMessage}
                  <div class="error-message">{billingErrorMessage}</div>
                {/if}
              </div>
            </div>
            {#if subscriptionUpdateMessage}
              <div class="feedback-message {subscriptionUpdateSuccess ? 'success-message' : 'error-message'}">
                {subscriptionUpdateMessage}
              </div>
            {/if}
          </div>
        </div>
        
        <!-- Notifications Section -->
        <div class="dashboard-section" bind:this={_sections[3]}>
          <div class="section-header" on:click={() => toggleSection(3)} on:keydown={(e) => e.key === 'Enter' && toggleSection(3)} tabindex="0" role="button">
            <h2>Notifications</h2>
            <button class="toggle-button" aria-label={expandedSections[3] ? 'Collapse section' : 'Expand section'}>
              {expandedSections[3] ? '−' : '+'}
            </button>
          </div>
          <div class="section-content" bind:this={_sectionContents[3]}>
            <p class="section-description">
              Manage your notification preferences.
            </p>
            
            <div class="notification-options">
              <div class="notification-option">
                <label class="checkbox-container">
                  <input type="checkbox" bind:checked={notificationPreferences.tipsAndGuidance}>
                  <span class="checkbox-label">Tips, tricks and helpful guidance</span>
                </label>
              </div>
              
              <div class="notification-option">
                <label class="checkbox-container">
                  <input type="checkbox" bind:checked={notificationPreferences.productUpdates}>
                  <span class="checkbox-label">Product updates and learning tips</span>
                </label>
              </div>
            </div>
            
            <div class="section-footer">
              <button 
                class="button secondary" 
                on:click={saveNotificationPreferences}
                disabled={isUpdatingNotifications}
              >
                {#if isUpdatingNotifications}
                  Saving...
                {:else}
                  Save changes
                {/if}
              </button>
              <button 
                class="button secondary" 
                on:click={() => {
                  notificationPreferences.tipsAndGuidance = false;
                  notificationPreferences.productUpdates = false;
                }}
                disabled={isUpdatingNotifications}
              >
                Unsubscribe from all
              </button>
            </div>
            
            {#if notificationUpdateMessage}
              <div class="feedback-message {notificationUpdateSuccess ? 'success-message' : 'error-message'}">
                {notificationUpdateMessage}
              </div>
            {/if}
          </div>
        </div>
        
        <!-- Debug Section - Only visible in development mode -->
        {#if import.meta.env.DEV}
          <div class="dashboard-section" bind:this={_sections[4]}>
            <div class="section-header" on:click={() => toggleSection(4)} on:keydown={(e) => e.key === 'Enter' && toggleSection(4)} tabindex="0" role="button">
              <h2>Debug</h2>
              <button class="toggle-button" aria-label={expandedSections[4] ? 'Collapse section' : 'Expand section'}>
                {expandedSections[4] ? '−' : '+'}
              </button>
            </div>
            <div class="section-content" bind:this={_sectionContents[4]}>
              <p class="section-description">
                Debugging tools.
              </p>
              
              <div class="debug-actions">
                <button 
                  class="button primary" 
                  on:click={addCurrentUserToMailchimp}
                  disabled={isAddingToMailchimp}
                >
                  {#if isAddingToMailchimp}
                    Adding to Mailchimp...
                  {:else}
                    Add to Mailchimp
                  {/if}
                </button>
              </div>
              
              {#if mailchimpMessage}
                <div class="feedback-message {mailchimpSuccess ? 'success-message' : 'error-message'}">
                  {mailchimpMessage}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>

{#if showInvoicePopup}
  <InvoicePopup 
    invoices={invoices} 
    isOpen={showInvoicePopup} 
    onClose={closeInvoicePopup} 
    isLoading={invoicesLoading}
    errorMessage={invoiceErrorMessage}
  />
{/if}

{#if showBillingPopup}
  <BillingPopup 
    isOpen={showBillingPopup} 
    onClose={handleCloseBillingPopup} 
    isLoading={false}
    errorMessage={billingErrorMessage}
    subscriptionId={profileData?.square_subscription_id || ''}
    squareCustomerId={profileData?.square_customer_id || ''}
  />
{/if}

<style>
  .dashboard-layout {
    display: flex;
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 0;
  }
  
  .welcome-message {
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: #2d3748;
  }
  
  .dashboard-menu {
    width: 80px;
    background-color: #f8f9fa;
    border-radius: 16px;
    margin-right: 2rem;
    padding: 1.5rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: sticky;
    top: 2rem;
    height: fit-content;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  }
  
  .menu-items {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    align-items: center;
  }
  
  .menu-item {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
    width: 48px;
    height: 48px;
  }
  
  .menu-item:hover {
    background-color: #edf2f7;
  }
  
  .menu-item.active {
    background-color: #ebf4ff;
  }
  
  .menu-icon {
    color: #718096;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .menu-item.active .menu-icon {
    color: #3b82f6;
  }
  
  .placeholder-content {
    background-color: #f7fafc;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    margin-top: 2rem;
    color: #718096;
  }
  
  .dashboard-container {
    flex: 1;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    padding: 1.5rem;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 1.5rem;
    color: #2d3748;
  }
  
  .dashboard-section {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    margin-bottom: 1.5rem;
    overflow: hidden;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background-color: #f7fafc;
    border-bottom: 1px solid #e2e8f0;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .section-header:hover {
    background-color: #edf2f7;
  }
  
  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #2d3748;
  }
  
  .toggle-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #4a5568;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
  }
  
  .toggle-button:hover {
    color: #2b6cb0;
  }
  
  .section-content {
    padding: 1.5rem;
    overflow: hidden;
    box-sizing: border-box;
  }
  
  .section-description {
    margin-top: 0;
    margin-bottom: 1.5rem;
    color: #718096;
  }
  
  .section-footer {
    margin-top: 6.5rem;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 1rem;
  }
  
  .profile-items {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .profile-item {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #f7fafc;
    border-radius: 6px;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .profile-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  }
  
  .profile-icon {
    margin-right: 1rem;
    font-size: 1.25rem;
    width: 24px;
    text-align: center;
  }
  
  .profile-value {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
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
  
  .danger {
    background-color: #ffffff;
    color: #e53e3e;
    border: 1px solid #e53e3e;
  }
  
  .danger:hover {
    background-color: #fdf2f2;
  }
  
  .button[disabled] {
    opacity: 0.7;
    cursor: not-allowed;
    background-color: #e2e8f0;
    color: #a0aec0;
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
  }
  
  /* Security section styles */
  .security-info {
    background-color: #f7fafc;
    padding: 1.5rem;
    border-radius: 6px;
  }
  
  .security-info h3 {
    color: #2d3748;
    margin-top: 0;
    margin-bottom: 1rem;
  }
  
  .security-benefits {
    list-style-type: none;
    padding-left: 0;
    margin-bottom: 1.5rem;
  }
  
  .security-benefits li {
    margin-bottom: 0.5rem;
    color: #4a5568;
  }
  
  /* Subscription plan styles */
  .subscription-plans {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .plan-option {
    background-color: #f7fafc;
    border-radius: 6px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: pointer;
    border: 2px solid transparent;
  }
  
  .plan-option:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.05);
  }
  
  .plan-option.current {
    position: relative;
  }
  
  .plan-option.selected {
    border: 2px solid #3b82f6;
    background-color: #ebf4ff;
  }
  
  .plan-option.best-value {
    position: relative;
    /* border-top: 4px solid #3b82f6; */
  }
  
  .plan-header {
    margin-bottom: 1rem;
  }
  
  .plan-tag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background-color: #3b82f6;
    color: white;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-bottom: 0.75rem;
  }
  
  .plan-tag.highlight {
    background-color: #2c5282;
  }
  
  .plan-header h3 {
    margin: 0 0 0.5rem 0;
    color: #2d3748;
  }
  
  .plan-description {
    color: #718096;
    font-size: 0.875rem;
    margin: 0;
  }
  
  .plan-price {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .price {
    font-size: 1.5rem;
    font-weight: 700;
    color: #2d3748;
  }
  
  .price-period {
    color: #718096;
    font-size: 0.875rem;
  }
  
  .price-details {
    font-size: 0.8rem;
    color: #718096;
    margin-bottom: 1rem;
  }
  
  .plan-savings {
    font-size: 0.8125rem;
    color: #48bb78;
    margin-bottom: 0.5rem;
  }
  
  .plan-features {
    list-style-type: none;
    padding-left: 0;
    margin-top: 1rem;
    margin-bottom: 0;
    flex-grow: 1;
  }
  
  .plan-features li {
    margin-bottom: 0.5rem;
    color: #4a5568;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
  }
  
  .check-icon {
    color: #38b2ac;
    margin-right: 0.5rem;
    font-weight: bold;
  }
  
  .subscription-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .action-links {
    display: flex;
    gap: 1.5rem;
  }
  
  .link-button {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.875rem;
    cursor: pointer;
    color: #4a5568;
    text-decoration: none;
  }
  
  .link-button:hover {
    color: #3b82f6;
    text-decoration: underline;
  }
  
  .subscription-status {
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  
  .subscription-status.canceled {
    background-color: #FEF2F2;
    color: #B91C1C;
    border: 1px solid #FCA5A5;
  }
  
  .button.small {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    border-radius: 4px;
  }
  
  .feedback-message {
    margin-top: 0.5rem;
    padding: 0.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }
  
  .success-message {
    background-color: #c6f6d5;
    color: #2f855a;
  }
  
  .error-message {
    background-color: #fee2e2;
    color: #b91c1c;
  }
  
  .mfa-enroll-box {
    padding: 1rem;
    background-color: #f7fafc;
    border-radius: 6px;
  }
  
  .mfa-feedback {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .mfa-feedback.success {
    background-color: #c6f6d5;
    color: #2f855a;
    border: 1px solid #9ae6b4;
  }
  
  .mfa-feedback.error {
    background-color: #fed7d7;
    color: #c53030;
    border: 1px solid #feb2b2;
  }
  
  .mfa-status {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  
  .button.secondary {
    background-color: #e53e3e;
    color: white;
  }
  
  .button.secondary:hover:not(:disabled) {
    background-color: #c53030;
  }
  
  .button.secondary:disabled {
    background-color: #fc8181;
    cursor: not-allowed;
  }
  
  .pending-plan-change {
    padding: 1rem;
    background-color: #ebffef;
    border-radius: 6px;
    margin-top: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    border: 1px solid #bee3f8;
  }
  
  .pending-plan-note {
    color: #718096;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }
  
  .subscription-status.free-trial {
    background-color: #ebf4ff;
    color: #3b82f6;
    border: 1px solid #bee3f8;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  
  .email-update-container {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .email-update-info {
    font-size: 0.875rem;
    color: #64748b;
    margin-bottom: 0.75rem;
  }

  .email-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .email-update-button {
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .email-update-button:hover {
    background-color: #2563eb;
  }

  .email-update-button:disabled {
    background-color: #94a3b8;
    cursor: not-allowed;
  }

  .notification-options {
    margin: 1rem 0;
  }

  .notification-option {
    margin-bottom: 1rem;
  }

  .checkbox-container {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .checkbox-container input[type="checkbox"] {
    margin-right: 0.75rem;
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .checkbox-label {
    font-size: 0.95rem;
    color: #4a5568;
  }
  
  .notification-message.error {
    color: #e53e3e;
  }
  
  .notification-message.success {
    color: #38a169;
  }
  
  /* Debug section styles */
  .debug-actions {
    margin-top: 1rem;
  }
  
  .debug-actions .button {
    background-color: #4a5568;
  }
  
  .debug-actions .button:hover:not(:disabled) {
    background-color: #2d3748;
  }
  
  .debug-actions .button:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
  
  .feedback-message {
    margin-top: 0.75rem;
    padding: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  
  .success-message {
    background-color: rgba(56, 161, 105, 0.1);
    color: #38a169;
  }
  
  .error-message {
    background-color: rgba(229, 62, 62, 0.1);
    color: #e53e3e;
  }
</style>

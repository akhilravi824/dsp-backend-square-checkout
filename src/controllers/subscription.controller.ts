import { Request, Response, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { Client, Environment } from 'square';
import supabaseService from '../services/supabase.service';
import squareService from '../services/square.service';
import { User } from '@supabase/supabase-js';

// Define a type that includes user property
interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * Get all available subscription plans
 */
export const getSubscriptionPlans: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Fetch subscription plans with variations from Square
    const subscriptionData = await squareService.listSubscriptionItems();
    
    // Group variations by plan
    const planMap = new Map<string, any>();
    
    // Filter for active plans only
    const activePlans = subscriptionData.objects?.filter(plan => plan.active === true);
    
    console.log(`Found ${activePlans?.length || 0} active plans out of ${subscriptionData.objects?.length || 0}`);
    
    // Process only active plans
    activePlans?.forEach((plan: any) => {
      if (!planMap.has(plan.name)) {
        planMap.set(plan.name, {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          variations: []
        });
      }
      
      // Add variation to the plan
      planMap.get(plan.name).variations.push({
        variationId: plan.variationId,
        price: plan.price,
        basePrice: plan.basePrice,
        monthlyPrice: plan.monthlyPrice,
        totalPrice: plan.totalPrice,
        discountPercent: plan.discountPercent,
        hasDiscount: plan.hasDiscount,
        currency: plan.currency,
        formattedPrice: plan.formattedPrice,
        formattedMonthlyPrice: plan.formattedMonthlyPrice,
        formattedTotalPrice: plan.formattedTotalPrice,
        formattedBasePrice: plan.formattedBasePrice,
        interval: plan.interval,
        formattedInterval: plan.formattedInterval,
        phases: plan.phases
      });
    });
    
    // Convert map to array of plans
    const formattedPlans = Array.from(planMap.values());
    
    res.status(200).json({
      success: true,
      objects: formattedPlans,
      environment: process.env.SQUARE_ENVIRONMENT || 'sandbox'
    });
  } catch (error) {
    console.error('Error getting subscription plans:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Get user's current subscriptions
 */
export const getUserSubscriptions: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    // Use service client to bypass RLS restrictions
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get the user's subscription data from Supabase
    const { data: userData, error: userError } = await client
      .from('users')
      .select(`
        id,
        square_customer_id,
        square_subscription_id,
        square_subscription_variation_id,
        square_subscription_status,
        square_subscription_canceled_date,
        pending_plan_change,
        has_active_subscription,
        updated_at
      `)
      .eq('id', userId)
      .single();
    
    if (userError) {
      throw new Error(`Error fetching user subscription: ${userError.message}`);
    }
    
    // If no user data found, return empty response
    if (!userData) {
      res.status(200).json({
        success: true,
        data: {
          has_active_subscription: false,
          square_subscription_id: null,
          square_subscription_variation_id: null,
          square_customer_id: null,
          square_subscription_status: null,
          square_subscription_canceled_date: null,
          is_in_grace_period: false,
          grace_period_ends_at: null,
          pending_plan_change: null,
          is_canceled: false,
          subscription_end_date: null,
          updated_at: null
        }
      });
      return;
    }
    
    // Define grace period duration (e.g., 7 days after cancellation)
    const GRACE_PERIOD_DAYS = 7;
    
    // Check for grace period if subscription is canceled
    let isInGracePeriod = false;
    let gracePeriodEndsAt: string | null = null;
    
    if (
      userData && 
      !userData.has_active_subscription && 
      userData.square_subscription_status === 'CANCELED' && 
      userData.square_subscription_canceled_date
    ) {
      // Calculate grace period end date
      const cancelDate = new Date(userData.square_subscription_canceled_date);
      const gracePeriodEnd = new Date(cancelDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);
      
      // Check if current date is within grace period
      const now = new Date();
      if (now <= gracePeriodEnd) {
        isInGracePeriod = true;
        gracePeriodEndsAt = gracePeriodEnd.toISOString();
      }
    }
    
    // If user has an active subscription, check if there's a pending plan change
    let pendingPlanChange = null;
    let subscriptionEndDate = null;
    let isCanceled = false;
    
    if (userData && userData.square_subscription_id) {
      try {
        console.log(`Checking for pending plan changes for subscription: ${userData.square_subscription_id}`);
        
        // Check for pending plan changes in the database first (this is the most reliable source)
        if (userData.pending_plan_change && 
            userData.pending_plan_change.effective_date && 
            userData.pending_plan_change.new_plan_variation_id) {
          console.log('Found pending plan change in database:', JSON.stringify(userData.pending_plan_change, null, 2));
          pendingPlanChange = userData.pending_plan_change;
        }
        // Check for pending plan changes using the planned_changes field
        else if (userData.square_subscription_id) {
          // Get subscription details from Square to check for pending changes
          const subscriptionDetails = await squareService.getSubscription(userData.square_subscription_id);
          
          // Check if subscription is canceled and get the end date
          if (subscriptionDetails?.status === 'CANCELED' || userData.square_subscription_status === 'CANCELED') {
            isCanceled = true;
            // Use charged_through_date as the end date for canceled subscriptions
            if (subscriptionDetails?.charged_through_date) {
              subscriptionEndDate = subscriptionDetails.charged_through_date;
            }
          } else if (subscriptionDetails?.canceled_date) {
            // If there's a canceled_date, the subscription is scheduled to be canceled
            isCanceled = true;
            // Use charged_through_date as the end date
            if (subscriptionDetails?.charged_through_date) {
              subscriptionEndDate = subscriptionDetails.charged_through_date;
            }
          }
          
          // Check for pending plan changes using the planned_changes field
          if (subscriptionDetails && subscriptionDetails.planned_changes && subscriptionDetails.planned_changes.length > 0) {
            console.log('Found planned changes:', JSON.stringify(subscriptionDetails.planned_changes, null, 2));
            
            // Find the first pending plan change
            const planChange = subscriptionDetails.planned_changes.find((change: { type: string; effective_date: string; new_plan_variation_id?: string }) => 
              change.type === 'PLAN_CHANGE' && change.effective_date
            );
            
            if (planChange) {
              console.log('Found pending plan change:', JSON.stringify(planChange, null, 2));
              
              // The new plan variation ID from Square is what's actually current
              // The database variation ID is what will be pending
              const currentPlanVariationId = planChange.new_plan_variation_id;
              
              pendingPlanChange = {
                effective_date: planChange.effective_date,
                // Reverse the logic: Square API's new_plan_variation_id is actually the current plan
                // and the database's square_subscription_variation_id is the pending plan
                new_plan_variation_id: userData.square_subscription_variation_id
              };
              
              // Update the database to reflect the current plan from Square
              try {
                await client
                  .from('users')
                  .update({
                    square_subscription_variation_id: currentPlanVariationId
                  })
                  .eq('id', userId);
                console.log(`Updated user's subscription variation ID to ${currentPlanVariationId}`);
              } catch (updateError) {
                console.error('Error updating user subscription variation ID:', updateError);
              }
              
              console.log('Set pendingPlanChange to:', JSON.stringify(pendingPlanChange, null, 2));
            } else {
              console.log('No PLAN_CHANGE type found in planned changes');
            }
          } 
          // Alternative method: Check if the plan_variation_id from Square is different from what we have in the database
          else if (subscriptionDetails && 
                  subscriptionDetails.plan_variation_id && 
                  userData.square_subscription_variation_id &&
                  subscriptionDetails.plan_variation_id !== userData.square_subscription_variation_id) {
            
            console.log('Detected pending plan change by comparing variation IDs:');
            console.log(`Square API variation ID: ${subscriptionDetails.plan_variation_id}`);
            console.log(`Database variation ID: ${userData.square_subscription_variation_id}`);
            
            // If there's a mismatch, it means there's a pending plan change
            // The effective date would be the charged_through_date (end of current billing period)
            if (subscriptionDetails.charged_through_date) {
              // The Square API plan_variation_id is the current plan
              // The database square_subscription_variation_id is the pending plan
              pendingPlanChange = {
                effective_date: subscriptionDetails.charged_through_date,
                // Reverse the logic: database variation ID is the pending plan
                new_plan_variation_id: userData.square_subscription_variation_id
              };
              
              // Update the database to reflect the current plan from Square
              try {
                await client
                  .from('users')
                  .update({
                    square_subscription_variation_id: subscriptionDetails.plan_variation_id
                  })
                  .eq('id', userId);
                console.log(`Updated user's subscription variation ID to ${subscriptionDetails.plan_variation_id}`);
              } catch (updateError) {
                console.error('Error updating user subscription variation ID:', updateError);
              }
              
              console.log('Set pendingPlanChange based on ID mismatch:', JSON.stringify(pendingPlanChange, null, 2));
            }
          } else {
            console.log('No planned changes found for this subscription');
          }
        } else {
          console.log('Skipping pending plan change check - conditions not met:', JSON.stringify({
            hasUserData: !!userData,
            hasActiveSubscription: userData?.has_active_subscription,
            hasSubscriptionId: !!userData?.square_subscription_id,
            subscriptionId: userData?.square_subscription_id
          }, null, 2));
        }
      } catch (error) {
        console.error('Error fetching subscription details from Square:', error);
        // Continue without pending plan change info if there's an error
        // This prevents the entire controller from failing if just this part fails
      }
    } else {
      console.log('Skipping pending plan change check - conditions not met:', JSON.stringify({
        hasUserData: !!userData,
        hasActiveSubscription: userData?.has_active_subscription,
        hasSubscriptionId: !!userData?.square_subscription_id,
        subscriptionId: userData?.square_subscription_id
      }, null, 2));
    }
    
    console.log('Final response data:', JSON.stringify({
      has_active_subscription: userData?.has_active_subscription || false,
      square_subscription_id: userData?.square_subscription_id || null,
      square_subscription_variation_id: userData?.square_subscription_variation_id || null,
      is_in_grace_period: isInGracePeriod,
      pending_plan_change: pendingPlanChange,
      is_canceled: isCanceled,
      subscription_end_date: subscriptionEndDate
    }, null, 2));
    
    res.status(200).json({
      success: true,
      data: {
        has_active_subscription: userData?.has_active_subscription || false,
        square_subscription_id: userData?.square_subscription_id || null,
        square_subscription_variation_id: userData?.square_subscription_variation_id || null,
        square_customer_id: userData?.square_customer_id || null,
        square_subscription_status: userData?.square_subscription_status || null,
        square_subscription_canceled_date: userData?.square_subscription_canceled_date || null,
        is_in_grace_period: isInGracePeriod,
        grace_period_ends_at: gracePeriodEndsAt,
        pending_plan_change: pendingPlanChange,
        is_canceled: isCanceled,
        subscription_end_date: subscriptionEndDate,
        updated_at: userData?.updated_at || null
      }
    });
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Create a new subscription for the current user
 */
export const createSubscription: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { planId, sourceId, userId, variationId } = req.body;
    
    console.log('Subscription creation request received with params:', {
      planId,
      sourceId: sourceId ? 'provided' : 'missing',
      userId,
      variationId
    });
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    if (!planId) {
      res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
      return;
    }
    
    if (!sourceId) {
      res.status(400).json({
        success: false,
        message: 'Payment source ID is required'
      });
      return;
    }
    
    let planVariationId = variationId || planId; // Use provided variationId if available, otherwise use planId
    console.log(`Initial planVariationId: ${planVariationId}`);
    
    // Store the original variation ID to ensure we don't lose it
    const originalVariationId = variationId;
    
    let planData: {
      name: string;
      price: number;
      currency: string;
      interval: string;
      phases: any[];
      hasRelativePricing?: boolean; // Add optional property for RELATIVE pricing flag
      phaseOrdinals?: any[]; // Add optional property for phase ordinals
    } | undefined = undefined;
    
    try {
      // Get all subscription plans to find the correct variation ID
      const plans = await squareService.listSubscriptionItems();
      
      // Log the plans for debugging
      console.log(`Retrieved ${plans.objects?.length || 0} subscription plans`);
      
      // Find the plan with matching ID
      const matchingPlan = plans.objects?.find(plan => plan.id === planId);
      
      if (matchingPlan) {
        console.log(`Found matching plan: ${matchingPlan.name}`);
        
        // Find the matching variation if we have a variationId
        if (variationId) {
          // Find the specific variation within all plans
          let foundVariation = false;
          
          for (const plan of plans.objects || []) {
            // Check each variation in each plan
            if (plan.variations) {
              for (const variation of plan.variations) {
                if (variation.variationId === variationId) {
                  console.log(`Found matching variation with ID ${variationId} (${variation.interval})`);
                  planVariationId = variation.variationId;
                  foundVariation = true;
                  
                  // Store plan data for pricing information
                  planData = {
                    name: plan.name,
                    price: variation.price,
                    currency: variation.currency || 'USD',
                    interval: variation.interval || 'monthly',
                    phases: variation.phases || []
                  };
                  console.log(`Variation pricing: ${planData.price} ${planData.currency} (${planData.interval})`);
                  
                  // Log the phases for debugging
                  if (variation.phases && variation.phases.length > 0) {
                    console.log('Variation phases:', JSON.stringify(variation.phases.map((p: any) => ({
                      cadence: p.cadence,
                      pricing: p.pricing
                    })), null, 2));
                  }
                  
                  break;
                }
              }
            }
            if (foundVariation) break;
          }
          
          if (!foundVariation) {
            console.warn(`No matching variation found for ID: ${variationId}, falling back to plan`);
          }
        }
        
        // If no variation was found or no variationId was provided, use the first variation of the matching plan
        if (!planData && matchingPlan.variationId) {
          planVariationId = matchingPlan.variationId;
          console.log(`Using plan's first variation ID: ${planVariationId}`);
          
          // Store plan data for pricing information
          planData = {
            name: matchingPlan.name,
            price: matchingPlan.price,
            currency: matchingPlan.currency || 'USD',
            interval: matchingPlan.interval || 'monthly',
            phases: matchingPlan.phases || []
          };
          console.log(`Plan pricing: ${planData.price} ${planData.currency} (${planData.interval})`);
        }
        
        // Check for RELATIVE pricing type if we have plan data
        if (planData && planData.phases) {
          const hasRelativePricing = planData.phases.some((phase: any) => 
            phase.pricing && phase.pricing.type === 'RELATIVE'
          );
          
          if (hasRelativePricing) {
            console.log('IMPORTANT: Plan has RELATIVE pricing type - creating special request');
            planData.hasRelativePricing = true;
            
            // Store the phase ordinals for proper subscription creation
            planData.phaseOrdinals = planData.phases.map((phase: any) => ({
              ordinal: phase.ordinal || 0
            }));
            console.log('Extracted phase ordinals:', JSON.stringify(planData.phaseOrdinals));
          }
          
          if (planData.phases.length > 0) {
            console.log(`Plan has ${planData.phases.length} phases with cadences: ${planData.phases.map((p: any) => p.cadence || 'unknown').join(', ')}`);
          } else {
            console.log('Plan has no phases data');
          }
        }
      } else {
        console.warn(`No matching plan found for ID: ${planId}, using ID as-is`);
      }
    } catch (error) {
      console.error('Error finding plan variation ID:', error);
      // Continue with the process using the original planId
    }
    
    // 1. Get user information from Supabase
    console.log(`Attempting to retrieve user data from Supabase for userId: ${userId}`);
    
    // Use service client to bypass RLS
    const supabaseClient = supabaseService.serviceClient || supabaseService.client;
    let { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('email, name, square_customer_id, has_active_subscription, square_subscription_variation_id, square_subscription_id')
      .eq('id', userId)
      .single();
    
    console.log('Supabase user query result:', { 
      success: !userError,
      userData: userData || null,
      error: userError ? JSON.stringify(userError) : null,
      usingServiceClient: !!supabaseService.serviceClient
    });
    
    if (userError || !userData) {
      console.error('User lookup failed:', userError);
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    // Check if user has a Square customer ID (required for subscription)
    let squareCustomerId: string;
    
    if (userData.square_customer_id) {
      console.log('Found Square customer ID in Supabase:', userData.square_customer_id);
      
      // Verify the customer exists in Square
      try {
        const customerDetails = await squareService.getCustomer(userData.square_customer_id);
        if (customerDetails && customerDetails.id) {
          console.log('Verified customer exists in Square:', customerDetails.id);
          squareCustomerId = customerDetails.id;
        } else {
          console.log('Customer ID exists in Supabase but not found in Square, will create new');
          // Create a new customer since the ID in our database doesn't exist in Square
          squareCustomerId = await createNewSquareCustomer(userId, userData.email, userData.name);
        }
      } catch (error) {
        console.log('Error verifying Square customer, will create new:', error);
        // Create a new customer if verification fails
        squareCustomerId = await createNewSquareCustomer(userId, userData.email, userData.name);
      }
    } else {
      console.log('No Square customer ID in Supabase, creating new customer');
      squareCustomerId = await createNewSquareCustomer(userId, userData.email, userData.name);
    }
    
    // Check if user already has an active subscription in Square
    try {
      console.log('Checking if user has any active subscriptions in Square...');
      
      const existingSubscriptions = await squareService.listCustomerSubscriptions(squareCustomerId);
      const activeSubscriptions = existingSubscriptions.filter(
        (sub: any) => ['ACTIVE', 'PENDING'].includes(sub.status || '')
      );
      
      if (activeSubscriptions.length > 0) {
        console.log('Found active subscription in Square:', activeSubscriptions[0].id);
        
        // Update Supabase if needed to mark user as having active subscription
        const { data: userData, error: userError } = await supabaseClient
          .from('users')
          .select('has_active_subscription')
          .eq('id', userId)
          .single();
          
        if (!userError && userData && 
            (!userData.has_active_subscription)) {
          // Update Supabase with current subscription info
          console.log('Updating Supabase with current subscription info');
          await supabaseClient
            .from('users')
            .update({ 
              has_active_subscription: true,
              square_subscription_variation_id: activeSubscriptions[0].planId || 'unknown',
              square_subscription_id: activeSubscriptions[0].id || 'unknown'
            })
            .eq('id', userId);
        }
        
        res.status(400).json({
          success: false,
          message: 'User already has an active subscription. Please cancel the existing subscription before creating a new one.',
          data: {
            subscriptionId: activeSubscriptions[0].id
          }
        });
        return;
      }
      
      console.log('No active subscriptions found in Square, proceeding with new subscription...');
    } catch (error) {
      // Log the error but continue - we don't want to block creating a subscription
      // if we can't check existing ones due to an API error
      console.error('Error checking for existing subscriptions in Square:', error);
    }
    
    // Helper function to create a new Square customer
    async function createNewSquareCustomer(userId: string, email: string, userName: string | null) {
      // Use the name from the users table, or fall back to email username if not available
      const customerName = userName || email.split('@')[0].split(/[._]/)
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
      
      // Create a new Square customer
      const newCustomerId = await squareService.createCustomer({
        name: customerName,
        email: email,
        id: userId
      });
      
      // Update user with square customer ID - using the already defined supabaseClient from parent scope
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ square_customer_id: newCustomerId })
        .eq('id', userId);
      
      if (updateError) {
        console.error('Error saving Square customer ID to Supabase:', updateError);
      }
      
      return newCustomerId;
    }
    
    // 2. Create the subscription in Square
    let squareSubscription;
    try {
      // Store the payment method
      const card = await squareService.storeCustomerCard(squareCustomerId, sourceId);
      if (!card || !card.id) {
        throw new Error('Failed to store payment method');
      }
      
      // Log the variation ID being used
      console.log(`Creating subscription with variation ID: ${planVariationId}`);
      
      // IMPORTANT: If we have an original variation ID from the frontend, use it directly
      if (originalVariationId) {
        console.log(`Overriding with original variation ID from frontend: ${originalVariationId}`);
        planVariationId = originalVariationId;
      }
      
      // Call Square service with proper parameters
      squareSubscription = await squareService.createSubscription(
        squareCustomerId,
        planVariationId, // Using the plan variation ID
        card.id,
        planData // Pass plan data for pricing information
      );
      
      if (!squareSubscription || !squareSubscription.id) {
        throw new Error('Failed to create subscription');
      }
    } catch (error) {
      console.error('Error creating Square subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      res.status(500).json({
        success: false,
        message: `Failed to create subscription: ${errorMessage}`
      });
      return;
    }
    
    // Update the user record with subscription information
    try {
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ 
          square_subscription_variation_id: planVariationId,
          square_subscription_id: squareSubscription.id,
          has_active_subscription: true,
          had_subscription: true, // Set had_subscription to true when user gets a paid subscription
          square_subscription_status: squareSubscription.status
        })
        .eq('id', userId);
        
      if (updateError) {
        console.error('Error updating user with subscription details:', updateError);
        // Continue despite the error - we've already created the subscription
      }
    } catch (updateError) {
      console.error('Exception updating user with subscription details:', updateError);
      // Continue despite the error - we've already created the subscription
    }
    
    // We don't need to update the users table - this will be handled by the webhook
    // Just return the subscription information
    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        id: squareSubscription.id,
        status: squareSubscription.status,
        start_date: squareSubscription.startDate,
        charged_through_date: squareSubscription.chargedThroughDate
      }
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Cancel a subscription
 */
export const cancelSubscription: RequestHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    if (!subscriptionId) {
      res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
      return;
    }
    
    // Use service client to bypass RLS restrictions
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get current subscription status
    const { data: userData, error: userError } = await client
      .from('users')
      .select('square_subscription_status, square_subscription_canceled_date')
      .eq('id', userId)
      .single();
    
    // If subscription is already canceled, return success without calling Square API
    if (userData && 
        (userData.square_subscription_status === 'CANCELED' || userData.square_subscription_canceled_date)) {
      res.status(200).json({
        success: true,
        message: 'Subscription is already canceled',
        alreadyCanceled: true
      });
      return;
    }
    
    // Cancel the subscription in Square
    try {
      const cancelledSubscription = await squareService.cancelSubscription(
        subscriptionId
      );
      
      if (!cancelledSubscription) {
        throw new Error('Failed to cancel subscription');
      }
      
      // Update user record with cancellation information
      if (cancelledSubscription.canceled_date) {
        await client
          .from('users')
          .update({ 
            square_subscription_status: 'CANCELED',
            square_subscription_canceled_date: cancelledSubscription.canceled_date
          })
          .eq('id', userId);
      }
      
      res.status(200).json({
        success: true,
        message: 'Subscription cancellation request sent successfully',
        cancelDate: cancelledSubscription.canceled_date
      });
      return;
    } catch (error) {
      console.error('Error canceling Square subscription:', error);
      
      // Check if error message indicates subscription is already canceled
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      if (errorMessage.includes('already has a pending cancel date')) {
        // Extract the cancel date from the error message if possible
        const cancelDateMatch = errorMessage.match(/pending cancel date of `([^`]+)`/);
        const cancelDate = cancelDateMatch ? cancelDateMatch[1] : null;
        
        // Update user record with cancellation information if we have a date
        if (cancelDate) {
          await client
            .from('users')
            .update({
              square_subscription_status: 'CANCELED',
              square_subscription_canceled_date: cancelDate
            })
            .eq('id', userId);
        }
        
        res.status(200).json({
          success: true,
          message: 'Subscription is already scheduled for cancellation',
          alreadyCanceled: true,
          cancelDate
        });
        return;
      }
      
      res.status(500).json({
        success: false,
        message: `Failed to cancel subscription: ${errorMessage}`
      });
      return;
    }
  } catch (error) {
    console.error('Error canceling subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Update subscription payment method
 */
export const updateSubscriptionPaymentMethod: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const { sourceId } = req.body;
    const userId = req.user?.id;
    
    console.log('Update payment method - User ID from auth:', userId);
    console.log('Update payment method - Subscription ID:', subscriptionId);
    console.log('Update payment method - Source ID received:', sourceId ? 'Valid source ID' : 'Missing source ID');
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    if (!subscriptionId) {
      res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
      return;
    }
    
    if (!sourceId) {
      res.status(400).json({
        success: false,
        message: 'Source ID is required'
      });
      return;
    }
    
    // Get the user's Square customer ID
    console.log('Update payment method - Querying Supabase for user with ID:', userId);
    
    // Use service client if available (same as in getPaymentMethod)
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Query the users table - check if the user exists
    const { data: userData, error: userError } = await client
      .from('users')
      .select('square_customer_id, square_subscription_id')
      .eq('id', userId)
      .single();
    
    console.log('Update payment method - Query result:', userData ? 'User found' : 'User not found');
    
    if (userError || !userData) {
      console.error('Update payment method - Supabase error:', userError);
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    if (userData.square_subscription_id !== subscriptionId) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to update this subscription'
      });
      return;
    }
    
    try {
      // 1. Store the new payment method
      const newCard = await squareService.storeCustomerCard(userData.square_customer_id, sourceId);
      if (!newCard || !newCard.id) {
        throw new Error('Failed to store payment method');
      }
      
      // 2. Get the current subscription to find its card ID
      console.log('Getting subscription details for ID:', subscriptionId);
      const subscriptionDetails = await squareService.getSubscription(subscriptionId);
      if (!subscriptionDetails) {
        throw new Error('Subscription not found');
      }
      
      // 3. Update the subscription to use the new card
      console.log('Updating subscription with new card ID:', newCard.id);
      const baseUrl = squareService.environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': squareService.apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const updateResponse = await fetch(`${baseUrl}/v2/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          subscription: {
            card_id: newCard.id
          }
        })
      });
      
      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(`Failed to update subscription: ${JSON.stringify(errorData)}`);
      }
      
      // 4. Get customer cards to find old ones
      console.log(`Retrieving cards for customer ID: ${userData.square_customer_id}`);
      const cardsResponse = await fetch(`${baseUrl}/v2/cards?customer_id=${userData.square_customer_id}`, {
        method: 'GET',
        headers
      });
      
      if (!cardsResponse.ok) {
        const errorData = await cardsResponse.json();
        console.error('Error retrieving customer cards:', errorData);
        throw new Error(`Failed to retrieve customer cards: ${JSON.stringify(errorData)}`);
      }
      
      const cardsData = await cardsResponse.json();
      const oldCards = cardsData.cards || [];
      console.log(`Found ${oldCards.length} existing cards for customer`);
      
      // 5. Disable old cards (except the new one)
      if (oldCards.length > 1) {
        console.log('Disabling old cards to keep payment methods clean');
        let disableSuccesses = 0;
        let disableFailures = 0;
        
        for (const card of oldCards) {
          if (card.id !== newCard.id) {
            try {
              console.log(`Attempting to disable old card ${card.id}`);
              
              // Use the disable-card endpoint (POST /v2/cards/{card_id}/disable)
              const disableResponse = await fetch(`${baseUrl}/v2/cards/${card.id}/disable`, {
                method: 'POST',
                headers
              });
              
              if (disableResponse.ok) {
                console.log(`Successfully disabled old card ${card.id}`);
                disableSuccesses++;
              } else {
                let errorData;
                try {
                  const responseText = await disableResponse.text();
                  errorData = responseText ? JSON.parse(responseText) : null;
                } catch (e) {
                  console.log('Response was not valid JSON');
                }
                
                console.warn(`Failed to disable old card ${card.id}:`, errorData);
                disableFailures++;
              }
            } catch (disableError) {
              console.warn(`Error disabling old card ${card.id}:`, disableError);
              disableFailures++;
              // Continue even if disabling fails
            }
          } else {
            console.log(`Skipping disabling of new card ${card.id}`);
          }
        }
        
        console.log(`Card disabling summary: ${disableSuccesses} successful, ${disableFailures} failed`);
      } else {
        console.log('No old cards found to disable');
      }
      
      // 6. Return the updated card details
      res.status(200).json({
        success: true,
        message: 'Payment method updated successfully',
        card: {
          id: newCard.id,
          brand: newCard.cardBrand,
          last4: newCard.last4,
          expMonth: newCard.expMonth,
          expYear: newCard.expYear
        }
      });
    } catch (error) {
      console.error('Error updating payment method:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      res.status(500).json({
        success: false,
        message: `Failed to update payment method: ${errorMessage}`
      });
    }
  } catch (error) {
    console.error('Error in updateSubscriptionPaymentMethod:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Swap subscription plan to a new plan variation
 */
export const swapSubscriptionPlan: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    const { subscriptionId } = req.params;
    const { newPlanVariationId, squareCustomerId } = req.body;
    
    if (!subscriptionId || !newPlanVariationId || !squareCustomerId) {
      res.status(400).json({
        success: false,
        message: 'Subscription ID, new plan variation ID, and squareCustomerId are required'
      });
      return;
    }
    
    console.log(`Attempting to swap subscription ${subscriptionId} to plan variation ${newPlanVariationId}`);
    
    // Use service client to bypass RLS restrictions
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get the user with the specified Square customer ID
    const { data: userData, error: userError } = await client
      .from('users')
      .select('*')
      .eq('square_customer_id', squareCustomerId)
      .single();
    
    console.log('User lookup result:', { 
      found: !!userData, 
      error: userError ? userError.message : null,
      subscriptionId
    });
    
    if (userError || !userData) {
      res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
      return;
    }
    
    // Verify the subscription belongs to the user
    if (userData.id !== userId) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this subscription'
      });
      return;
    }
    
    // Check if user is trying to swap to the same plan
    if (userData.square_subscription_variation_id === newPlanVariationId) {
      res.status(400).json({
        success: false,
        message: 'You are already subscribed to this plan'
      });
      return;
    }
    
    // Swap the plan using Square service
    const updatedSubscription = await squareService.swapSubscriptionPlan(
      subscriptionId,
      newPlanVariationId
    );

    // Handle pending plan change response from service
    if (updatedSubscription && updatedSubscription.success === false) {
      if (updatedSubscription.reason === 'pending_plan_change') {
        res.status(409).json({
          success: false,
          message: 'A plan change is already pending for this subscription. Please wait until it completes before making another change.'
        });
        return;
      }
      
      if (updatedSubscription.reason === 'same_plan') {
        res.status(400).json({
          success: false,
          message: 'You are already subscribed to this plan'
        });
        return;
      }
    }
    
    console.log('Plan swap successful:', updatedSubscription);
    
    // Update user's square_subscription_variation_id in Supabase after successful swap
    if (updatedSubscription && updatedSubscription.id) {
      const client = supabaseService.serviceClient || supabaseService.client;
      
      // Look up user by square_customer_id
      const { data: users, error } = await client
        .from('users')
        .select('id')
        .eq('square_customer_id', updatedSubscription.customer_id)
        .limit(1);

      if (!error && users && users.length > 0) {
        // Check if there's a pending plan change
        if (updatedSubscription.pendingPlanChange) {
          console.log('Storing pending plan change in database:', updatedSubscription.pendingPlanChange);
          
          // Store the pending plan change information in the database
          await client
            .from('users')
            .update({
              pending_plan_change: {
                effective_date: updatedSubscription.pendingPlanChange.effective_date,
                new_plan_variation_id: updatedSubscription.pendingPlanChange.new_plan_variation_id
              }
            })
            .eq('id', users[0].id);
          
          console.log('Pending plan change stored in database');
        } else {
          // If no pending plan change, update the subscription variation ID directly
          await client
            .from('users')
            .update({ 
              square_subscription_variation_id: newPlanVariationId,
              pending_plan_change: null // Clear any existing pending plan change
            })
            .eq('id', users[0].id);
          
          console.log('Updated square_subscription_variation_id in database immediately');
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully',
      subscription: updatedSubscription
    });
  } catch (error) {
    console.error('Error swapping subscription plan:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Get user's invoices from Square
 */
export const getUserInvoices: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    // Use service client to bypass RLS restrictions
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get the user's Square customer ID
    const { data: userData, error: userError } = await client
      .from('users')
      .select('square_customer_id')
      .eq('id', userId)
      .single();
    
    if (userError) {
      console.error('Error fetching user data:', userError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user data'
      });
      return;
    }
    
    // If user doesn't have a Square customer ID yet, return empty invoices
    if (!userData || !userData.square_customer_id) {
      res.status(200).json({
        success: true,
        invoices: [],
        message: 'No invoices found. You may not have any invoices yet.'
      });
      return;
    }
    
    // Fetch invoices from Square
    try {
      const invoicesData = await squareService.listCustomerInvoices(userData.square_customer_id);
      
      res.status(200).json({
        success: true,
        invoices: invoicesData.invoices || [],
        environment: invoicesData.environment
      });
    } catch (error) {
      console.error('Error fetching invoices from Square:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      // Send a more user-friendly error message
      res.status(500).json({
        success: false,
        message: 'Failed to fetch invoices. This could be because you don\'t have any invoices yet or there was an error connecting to Square.',
        technicalError: errorMessage
      });
    }
  } catch (error) {
    console.error('Error retrieving user invoices:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Create Square Checkout session for subscription
 */
export const createCheckoutSession: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { planId, variationId, successUrl, cancelUrl } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    // Use variationId as planId if planId is not provided
    const finalPlanId = planId || variationId;
    
    if (!finalPlanId) {
      res.status(400).json({
        success: false,
        message: 'Plan ID or Variation ID is required'
      });
      return;
    }
    
    if (!successUrl || !cancelUrl) {
      res.status(400).json({
        success: false,
        message: 'Success URL and Cancel URL are required'
      });
      return;
    }
    
    // Use service client to bypass RLS
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get user data
    const { data: userData, error: userError } = await client
      .from('users')
      .select('email, name, square_customer_id, has_active_subscription')
      .eq('id', userId)
      .single();
    
    if (userError || !userData) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }
    
    // Check if user already has an active subscription
    if (userData.has_active_subscription) {
      res.status(400).json({
        success: false,
        message: 'User already has an active subscription'
      });
      return;
    }
    
    // Get or create Square customer
    let squareCustomerId = userData.square_customer_id;
    
    if (!squareCustomerId) {
      // Create new customer
      const customerName = userData.name || userData.email.split('@')[0];
      squareCustomerId = await squareService.createCustomer({
        name: customerName,
        email: userData.email,
        id: userId
      });
      
      // Update user with customer ID
      await client
        .from('users')
        .update({ square_customer_id: squareCustomerId })
        .eq('id', userId);
    }
    
    // Create checkout session
    const checkoutUrl = await squareService.createCheckoutSession({
      planId: finalPlanId,
      userId: userId,
      userEmail: userData.email,
      userName: userData.name || userData.email.split('@')[0],
      successUrl: successUrl,
      cancelUrl: cancelUrl
    });
    
    res.status(200).json({
      success: true,
      checkoutUrl,
      customerId: squareCustomerId
    });
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Handle Square Checkout webhook
 */
export const handleCheckoutWebhook: RequestHandler = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    console.log('Square Checkout webhook received:', JSON.stringify(event, null, 2));
    
           // Handle subscription.created event (better for subscription products)
           if (event.type === 'subscription.created') {
      const subscription = event.data.object;
      
      if (subscription && subscription.id) {
        // Get customer ID from the subscription
        const customerId = subscription.customer_id;
        
        if (customerId) {
          // Find user by Square customer ID
          const client = supabaseService.serviceClient || supabaseService.client;
          const { data: userData, error: userError } = await client
            .from('users')
            .select('id, square_subscription_id')
            .eq('square_customer_id', customerId)
            .single();
          
          if (!userError && userData) {
            // Update user with subscription information
            await client
              .from('users')
              .update({
                square_subscription_id: subscription.id,
                has_active_subscription: true,
                had_subscription: true,
                square_subscription_status: subscription.status || 'ACTIVE'
              })
              .eq('id', userData.id);
            
            console.log(`Updated user ${userData.id} with subscription ${subscription.id} (status: ${subscription.status})`);
          }
        }
      }
    }
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error handling checkout webhook:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

/**
 * Get payment method for a customer
 */
export const getPaymentMethod: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    if (!customerId) {
      res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
      return;
    }
    
    // Verify the customer ID belongs to the authenticated user
    const client = supabaseService.serviceClient || supabaseService.client;
    const { data: userData, error: userError } = await client
      .from('users')
      .select('square_customer_id')
      .eq('id', userId)
      .single();
    
    if (userError || !userData || userData.square_customer_id !== customerId) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to access this customer\'s payment methods'
      });
      return;
    }
    
    try {
      // Get customer cards from Square API
      const baseUrl = squareService.environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': squareService.apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      // Retrieve customer cards
      const cardsResponse = await fetch(`${baseUrl}/v2/cards?customer_id=${customerId}`, {
        method: 'GET',
        headers
      });
      
      if (!cardsResponse.ok) {
        const errorData = await cardsResponse.json();
        throw new Error(`Failed to retrieve customer cards: ${JSON.stringify(errorData)}`);
      }
      
      const cardsData = await cardsResponse.json();
      const cards = cardsData.cards || [];
      
      // Return the most recently added card (assuming it's the active one)
      if (cards.length > 0) {
        // Sort cards by creation date (newest first)
        cards.sort((a: any, b: any) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        
        const latestCard = cards[0];
        
        res.status(200).json({
          success: true,
          card: {
            id: latestCard.id,
            brand: latestCard.card_brand,
            last4: latestCard.last_4,
            expMonth: latestCard.exp_month,
            expYear: latestCard.exp_year
          }
        });
      } else {
        res.status(200).json({
          success: true,
          card: null,
          message: 'No payment methods found for this customer'
        });
      }
    } catch (error) {
      console.error('Error retrieving payment method:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      res.status(500).json({
        success: false,
        message: `Failed to retrieve payment method: ${errorMessage}`
      });
    }
  } catch (error) {
    console.error('Error in getPaymentMethod:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Create Square hosted checkout link for subscription
 */
export const createSubscriptionCheckoutLink: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { planId } = req.body as { planId: keyof typeof PLAN_VARIATIONS };
    
    // Define plan variations mapping
    const PLAN_VARIATIONS: Record<string, string> = {
      pro_monthly: process.env.SQUARE_PLAN_VARIATION_PRO_MONTHLY!,
      pro_yearly: process.env.SQUARE_PLAN_VARIATION_PRO_YEARLY!,
    };
    
    const variation = PLAN_VARIATIONS[planId];
    if (!variation) {
      return res.status(400).json({ error: 'Invalid planId' });
    }

    // Initialize Square client
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN!,
      environment: process.env.SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    });

    // Build return URL
    function buildReturnUrl() {
      const base = (process.env.RETURN_URL_BASE ?? '').replace(/\/$/, '');
      if (!base) throw new Error('RETURN_URL_BASE not set');
      return `${base}/billing/return`;
    }

    // Create payment link
    const { result } = await client.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      subscriptionPlanId: variation,
      checkoutOptions: { redirectUrl: buildReturnUrl() },
    });

    const url = result.paymentLink?.url;
    if (!url) {
      return res.status(500).json({ error: 'No checkout URL returned' });
    }
    
    res.json({ checkoutUrl: url });
  } catch (err: any) {
    res.status(400).json({ 
      error: err?.result?.errors?.[0]?.detail || err.message || 'Failed to create checkout link' 
    });
  }
};

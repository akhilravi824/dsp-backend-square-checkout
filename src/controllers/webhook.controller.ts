import { Request, Response } from 'express';
import crypto from 'crypto';
import { WebhooksHelper } from 'square';
import config from '../config/config';
import supabaseService from '../services/supabase.service';

/**
 * Handle Square webhook events
 * @param req Express request
 * @param res Express response
 */
export const handleSquareWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    let event;
    
    // Get the raw request body
    let rawBody = req.body;
    let bodyText = '';
    
    // If the body is a Buffer (from express.raw middleware), convert to string
    if (Buffer.isBuffer(rawBody)) {
      console.log('Request body is a Buffer, converting to string');
      bodyText = rawBody.toString('utf8');
    } else if (typeof rawBody === 'string') {
      console.log('Request body is already a string');
      bodyText = rawBody;
    } else {
      console.log('Request body is an object, stringify it');
      bodyText = JSON.stringify(rawBody);
    }
    
    // Verify the webhook signature if webhook verification is enabled
    let signatureVerified = false;
    if (config.square.webhookSignatureKey) {
      const signatureHeader = req.header('x-square-hmacsha256-signature');
      
      if (signatureHeader) {
        console.log('Webhook signature check enabled');
        
        try {
          // Get the notification URL as it appears in the Square Dashboard
          // Handle Vercel's URL construction properly
          const isVercel = process.env.VERCEL === '1';
          let protocol = req.headers['x-forwarded-proto'] as string || req.protocol;
          let host = req.headers.host || req.get('host');
          
          // On Vercel, ensure we use https and the correct host
          if (isVercel) {
            protocol = 'https'; // Vercel always uses HTTPS
            // Use the host from headers, which should be the public domain
            host = req.headers.host || 'dsp-api.vercel.app';
          }
          
          // Clean up the URL path - remove query parameters for signature verification
          const cleanPath = req.originalUrl.split('?')[0];
          const notificationUrl = `${protocol}://${host}${cleanPath}`;
          
          console.log('Environment:', isVercel ? 'Vercel' : 'Local');
          console.log('Protocol:', protocol);
          console.log('Host:', host);
          console.log('Original URL:', req.originalUrl);
          console.log('Clean Path:', cleanPath);
          console.log('Notification URL:', notificationUrl);
          
          // Use Square's official WebhooksHelper to verify the signature
          signatureVerified = await WebhooksHelper.verifySignature({
            requestBody: bodyText,
            signatureHeader: signatureHeader,
            signatureKey: config.square.webhookSignatureKey,
            notificationUrl: notificationUrl
          });
          
          console.log('Square signature:', signatureHeader);
          console.log('Signature verification:', signatureVerified ? 'Succeeded' : 'Failed');
          
          if (!signatureVerified) {
            console.log('Signature verification failed');
            
            // Try alternative URL constructions for debugging
            const alternativeUrls = [
              `https://dsp-api.vercel.app/api/webhooks/square`,
              `${protocol}://${host}/api/webhooks/square`,
              `https://${host}${cleanPath}`,
              `${req.protocol}://${req.get('host')}${req.originalUrl}`
            ];
            
            console.log('Trying alternative URL constructions:');
            for (const altUrl of alternativeUrls) {
              console.log(`Trying URL: ${altUrl}`);
              try {
                const altVerified = await WebhooksHelper.verifySignature({
                  requestBody: bodyText,
                  signatureHeader: signatureHeader,
                  signatureKey: config.square.webhookSignatureKey,
                  notificationUrl: altUrl
                });
                console.log(`Result for ${altUrl}: ${altVerified ? 'SUCCESS' : 'FAILED'}`);
                if (altVerified) {
                  signatureVerified = true;
                  console.log(`✅ Signature verification succeeded with URL: ${altUrl}`);
                  break;
                }
              } catch (altError) {
                console.log(`Error with ${altUrl}:`, altError);
              }
            }
            
            if (!signatureVerified) {
              console.log('❌ All signature verification attempts failed');
              console.log('Request headers:', JSON.stringify(req.headers, null, 2));
              console.log('Body length:', bodyText.length);
              console.log('Body preview:', bodyText.substring(0, 200));
              res.status(401).json({ success: false, message: 'Unauthorized - signature verification failed' });
              return;
            }
          } else {
            console.log('✅ Signature verification succeeded on first try!');
          }
        } catch (error: unknown) {
          console.error('Error during signature verification:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          res.status(401).json({ success: false, message: `Unauthorized - signature verification error: ${errorMessage}` });
          return;
        }
      } else {
        console.error('Webhook request missing signature header');
        res.status(401).json({ success: false, message: 'Unauthorized - missing signature header' });
        return;
      }
    }
    
    // Parse the request body to get the event
    event = typeof rawBody === 'string' || Buffer.isBuffer(rawBody)
      ? JSON.parse(bodyText)
      : rawBody;
    
    // Process the webhook event
    console.log('Received Square webhook event:', event.type);
    console.log('Webhook event data:', event.data?.object);
    console.log('Signature verification:', signatureVerified ? 'Succeeded' : 'Failed');
    
    // Handle different event types
    switch (event.type) {
      case 'subscription.created':
        await handleSubscriptionCreated(event.data.object.subscription);
        break;
        
      case 'subscription.updated':
        await handleSubscriptionUpdated(event.data.object.subscription);
        break;
        
      default:
        console.log('Ignoring unhandled webhook event type:', event.type);
    }
    
    // Always respond with success to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    console.error('Error processing Square webhook:', error);
    
    // Return detailed error status to allow Square to retry the webhook
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

/**
 * Handle subscription created event
 * @param subscription Square subscription data
 */
const handleSubscriptionCreated = async (subscription: any): Promise<void> => {
  try {
    const customerId = subscription.customer_id;
    const planVariationId = subscription.plan_variation_id || subscription.plan_id;
    const subscriptionId = subscription.id;
    
    if (!customerId) {
      console.error('Subscription missing customer ID:', subscription.id);
      return;
    }
    
    console.log('Looking for user with Square customer ID:', customerId);
    
    // Use the more reliable service client to bypass RLS issues
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Find user by Square customer ID (exact match)
    let { data, error } = await client
      .from('users')
      .select('*')
      .eq('square_customer_id', customerId)
      .maybeSingle();
      
    if (error) {
      console.error('Error finding user by Square customer ID:', error);
      return;
    }

    // If no exact match, get all users and try to match manually
    if (!data) {
      // Get all users
      const { data: allUsers, error: usersError } = await client
        .from('users')
        .select('id, email, square_customer_id');
        
      if (usersError) {
        console.error('Error getting all users:', usersError);
      } else {
        // Look for a user with a matching square_customer_id (case-insensitive)
        const matchingUser = allUsers.find(user => 
          user.square_customer_id && 
          (user.square_customer_id.toLowerCase() === customerId.toLowerCase() ||
           user.square_customer_id.trim() === customerId.trim() ||
           user.square_customer_id.includes(customerId) ||
           customerId.includes(user.square_customer_id))
        );
        
        if (matchingUser) {
          // If found with manual match, get full user data
          const { data: userData, error: userError } = await client
            .from('users')
            .select('*')
            .eq('id', matchingUser.id)
            .single();
            
          if (userError) {
            console.error('Error getting matched user data:', userError);
          } else {
            data = userData;
            console.log('Found user via matching strategy:', data.id);
            
            // Update the square_customer_id to ensure it matches exactly in the future
            if (client) {
              await client
                .from('users')
                .update({ square_customer_id: customerId })
                .eq('id', data.id);
            }
          }
        }
      }
    }
    
    if (data) {
      // User exists, update their subscription status to active
      await updateUserSubscriptionStatus(
        data.id, 
        true, 
        customerId,
        null, 
        'ACTIVE',
        planVariationId,
        subscriptionId
      );
      
      console.log(`Updated user subscription status to ACTIVE for user:`, data.id);
    } else {
      console.log('No matching user found for Square customer ID:', customerId);
    }
  } catch (error: unknown) {
    console.error('Error handling subscription created event:', error);
  }
};

/**
 * Handle subscription updated event
 * @param subscription Square subscription data
 */
const handleSubscriptionUpdated = async (subscription: any): Promise<void> => {
  try {
    const customerId = subscription.customer_id;
    const status = subscription.status;
    const planVariationId = subscription.plan_variation_id || subscription.plan_id;
    const subscriptionId = subscription.id;
    const hasCanceledDate = !!subscription.canceled_date;
    const isCanceled = status === 'CANCELED' || hasCanceledDate;
    const canceledDate = isCanceled ? (subscription.canceled_date || new Date().toISOString()) : null;
    
    if (!customerId) {
      console.error('Subscription missing customer ID:', subscription.id);
      return;
    }
    
    console.log(`Processing subscription ${isCanceled ? 'cancellation' : 'update'} for customer:`, customerId);
    
    // Use the more reliable service client to bypass RLS issues
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Find user by Square customer ID
    let { data, error } = await client
      .from('users')
      .select('*')
      .eq('square_customer_id', customerId)
      .maybeSingle();
      
    if (error) {
      console.error('Error finding user by Square customer ID:', error);
      return;
    }
    
    // If no exact match, try with case-insensitive search
    if (!data) {
      // Get all users
      const { data: allUsers, error: usersError } = await client
        .from('users')
        .select('id, email, square_customer_id');
        
      if (usersError) {
        console.error('Error getting all users:', usersError);
      } else {
        // Look for a user with a matching square_customer_id (case-insensitive)
        const matchingUser = allUsers.find(user => 
          user.square_customer_id && 
          (user.square_customer_id.toLowerCase() === customerId.toLowerCase() ||
           user.square_customer_id.trim() === customerId.trim() ||
           user.square_customer_id.includes(customerId) ||
           customerId.includes(user.square_customer_id))
        );
        
        if (matchingUser) {
          // If found with manual match, get full user data
          const { data: userData, error: userError } = await client
            .from('users')
            .select('*')
            .eq('id', matchingUser.id)
            .single();
            
          if (userError) {
            console.error('Error getting matched user data:', userError);
          } else {
            data = userData;
            console.log('Found user via matching strategy:', data.id);
          }
        }
      }
    }
    
    if (data) {
      // Check if this is a plan change that has actually taken effect
      // Only update the plan variation ID if this is not a pending change
      let shouldUpdatePlanVariation = true;
      
      // Check for pending_plan_variation_id which is the key indicator of a pending plan change
      if (subscription.pending_plan_variation_id) {
        console.log(`Detected pending plan change: Current plan=${planVariationId}, Pending plan=${subscription.pending_plan_variation_id}`);
        shouldUpdatePlanVariation = false;
      }
      // Check for pending plan changes in the actions array
      else if (subscription.actions) {
        // Ensure actions is always defined as an array
        const actions = Array.isArray(subscription.actions) ? subscription.actions : [];
        
        if (actions.length > 0) {
          // Look for SWAP_PLAN actions
          const swapPlanAction = actions.find((action: any) => 
            action.type === 'SWAP_PLAN' && action.effective_date && action.new_plan_variation_id
          );
          
          if (swapPlanAction) {
            console.log(`Detected pending plan change in actions array: Current plan=${planVariationId}, New plan=${swapPlanAction.new_plan_variation_id}, Effective date=${swapPlanAction.effective_date}`);
            shouldUpdatePlanVariation = false;
          }
        } else {
          console.log('No actions found for this subscription in webhook');
        }
      }
      // Check for any other indicators of a pending plan change
      else if (subscription.has_pending_changes === true || 
               (subscription.planned_changes && subscription.planned_changes.length > 0)) {
        console.log(`Detected pending plan change via has_pending_changes or planned_changes array`);
        shouldUpdatePlanVariation = false;
      }
      // If there's no pending plan but the plan has changed from what's in our database
      else if (data.square_subscription_variation_id && 
          data.square_subscription_variation_id !== planVariationId) {
        console.log(`Plan has changed: Database=${data.square_subscription_variation_id}, Square=${planVariationId}`);
        
        // Check if this matches a pending plan change in our database
        if (data.pending_plan_change && 
            data.pending_plan_change.new_plan_variation_id === planVariationId) {
          console.log('This matches our pending plan change - the change has taken effect');
          
          // Clear the pending plan change since it has now taken effect
          await client
            .from('users')
            .update({ 
              pending_plan_change: null,
              square_subscription_variation_id: planVariationId
            })
            .eq('id', data.id);
          
          console.log('Cleared pending plan change and updated subscription variation ID');
        } else {
          // This is a plan change we weren't expecting
          console.log('Updating plan variation ID for unexpected plan change');
          shouldUpdatePlanVariation = true;
        }
      }
      
      // User exists, update their subscription status based on subscription status
      const isActive = status === 'ACTIVE';
      
      await updateUserSubscriptionStatus(
        data.id,
        isActive,
        customerId,
        canceledDate,
        status,
        shouldUpdatePlanVariation ? planVariationId : data.square_subscription_variation_id,
        subscriptionId
      );
      
      console.log(`Updated user subscription status to ${status} for user:`, data.id);
    } else {
      console.log('No matching user found for Square customer ID:', customerId);
    }
  } catch (error: unknown) {
    console.error('Error handling subscription updated event:', error);
  }
};

/**
 * Update user subscription status
 * @param userId User ID
 * @param hasActiveSubscription Boolean indicating if user has active subscription
 * @param squareCustomerId Square customer ID
 * @param canceledDate Date when subscription was canceled (if applicable)
 * @param subscriptionStatus The current status of the subscription from Square
 * @param subscriptionType The plan variation ID or plan ID from Square
 * @param subscriptionId The actual Square subscription ID
 */
const updateUserSubscriptionStatus = async (
  userId: string, 
  hasActiveSubscription: boolean,
  squareCustomerId: string,
  canceledDate: string | null = null,
  subscriptionStatus: string | null = null,
  subscriptionType: string | null = null,
  subscriptionId: string | null = null
): Promise<void> => {
  try {
    // Use the more reliable service client
    const client = supabaseService.serviceClient || supabaseService.client;
    
    if (!client) {
      console.error('No client available for updating user subscription status');
      return;
    }
    
    // Basic update data that we know exists in the table
    const updateData: any = {
      has_active_subscription: hasActiveSubscription,
      square_customer_id: squareCustomerId,
      updated_at: new Date().toISOString()
    };
    
    // If subscription is active, set had_subscription to true
    // This ensures we track users who have ever had a subscription
    if (hasActiveSubscription && subscriptionStatus === 'ACTIVE') {
      updateData.had_subscription = true;
    }
    
    // Add subscription status if provided
    if (subscriptionStatus) {
      updateData.square_subscription_status = subscriptionStatus;
    }
    
    // Add subscription type if provided
    if (subscriptionType) {
      updateData.square_subscription_variation_id = subscriptionType;
    }
    
    // Add subscription ID if provided
    if (subscriptionId) {
      updateData.square_subscription_id = subscriptionId;
    }
    
    // Handle cancellation date:
    // - If canceledDate is null and we're activating a subscription, explicitly clear any existing cancellation date
    // - If canceledDate has a value, store it (from a cancellation)
    if (hasActiveSubscription && canceledDate === null) {
      // Explicitly set to null to clear any previous cancellation date when resubscribing
      updateData.square_subscription_canceled_date = null;
    } else if (canceledDate) {
      // Store the cancellation date when canceling
      updateData.square_subscription_canceled_date = canceledDate;
    }
    
    const { error } = await client
      .from('users')
      .update(updateData)
      .eq('id', userId);
      
    if (error) {
      console.error('Error updating user subscription status:', error);
    }
  } catch (error: unknown) {
    console.error('Exception updating user subscription status:', error);
  }
};

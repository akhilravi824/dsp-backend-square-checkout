import { Request, Response, RequestHandler } from 'express';
import supabaseService from '../services/supabase.service';
import mailchimpService from '../services/mailchimp.service';
import squareService from '../services/square.service';

/**
 * Profile controller
 * Handles operations related to user profiles and notification preferences
 * Note: User creation is handled by auth.controller.ts
 */

export const updateNotificationPreferences: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const { tipsAndGuidance, productUpdates } = req.body;
    const userId = user.id;
    
    // Validate the input
    if (tipsAndGuidance === undefined || productUpdates === undefined) {
      res.status(400).json({
        success: false,
        message: 'Both tipsAndGuidance and productUpdates fields are required'
      });
      return;
    }
    
    // Use the service client to bypass RLS for admin operations
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Update the user's notification preferences in the database
    const { data: userData, error: updateError } = await client
      .from('users')
      .update({
        tips_and_guidance: tipsAndGuidance,
        product_updates: productUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('*')
      .single();
    
    if (updateError) {
      res.status(500).json({
        success: false,
        message: 'Failed to update notification preferences',
        error: updateError.message
      });
      return;
    }
    
    // Sync with Mailchimp if credentials are available
    try {
      if (mailchimpService.isInitialized()) {
        // Mailchimp service is initialized, sync the preferences
        try {
          await mailchimpService.updateUserTags(
            userData.email,
            userData.name || '',
            tipsAndGuidance,
            productUpdates
          );
          console.log('Successfully synced user preferences with Mailchimp');
        } catch (mailchimpError: any) {
          // Check if the error is that the user doesn't exist in Mailchimp
          if (mailchimpError.response && 
              mailchimpError.response.body && 
              mailchimpError.response.body.title === 'Member Not Found') {
            
            console.log('User not found in Mailchimp, adding them...');
            
            // Add the user to Mailchimp
            await mailchimpService.addContact(
              userData.email,
              userData.name || '',
              tipsAndGuidance,
              productUpdates
            );
            
            console.log('Successfully added user to Mailchimp');
          } else {
            // Log other errors but don't fail the request
            console.error('Error syncing with Mailchimp:', mailchimpError);
          }
        }
      } else {
        // Mailchimp service is not initialized, log a warning
        console.warn('Mailchimp service not initialized, skipping sync for user:', userData.email);
      }
    } catch (error) {
      // Log the error but don't fail the request
      console.error('Error checking Mailchimp service status:', error);
    }
    
    res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully'
    });
    
  } catch (error) {
    console.error('Update notification preferences error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Add a new contact to Mailchimp audience
 */
export const addMailchimpContact: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Validate request
    const { email, name, tipsAndGuidance, productUpdates } = req.body;
    
    if (!email) {
      res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
      return;
    }
    
    // Ensure Mailchimp service is initialized
    if (!mailchimpService.isInitialized()) {
      res.status(500).json({
        success: false,
        message: 'Mailchimp service is not properly configured'
      });
      return;
    }
    
    try {
      await mailchimpService.addContact(
        email,
        name || '',
        tipsAndGuidance === undefined ? false : tipsAndGuidance,
        productUpdates === undefined ? false : productUpdates
      );
      
      res.status(200).json({
        success: true,
        message: 'Contact added to Mailchimp successfully'
      });
    } catch (mailchimpError: any) {
      // Check if it's just that the contact already exists
      if (mailchimpError.response?.body?.title === 'Member Exists') {
        // If the member exists, try to update their tags instead
        try {
          await mailchimpService.updateUserTags(
            email,
            name || '',
            tipsAndGuidance === undefined ? false : tipsAndGuidance,
            productUpdates === undefined ? false : productUpdates
          );
          
          res.status(200).json({
            success: true,
            message: 'Contact already existed in Mailchimp and was updated successfully'
          });
        } catch (updateError: any) {
          res.status(500).json({
            success: false,
            message: 'Failed to update existing contact in Mailchimp',
            error: updateError.message || 'Unknown error'
          });
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to add contact to Mailchimp',
          error: mailchimpError.message || 'Unknown error'
        });
      }
    }
  } catch (error) {
    console.error('Add Mailchimp contact error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Add the current authenticated user to Mailchimp
 */
export const addCurrentUserToMailchimp: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const userId = user.id;
    
    // Ensure Mailchimp service is initialized
    if (!mailchimpService.isInitialized()) {
      res.status(500).json({
        success: false,
        message: 'Mailchimp service is not properly configured'
      });
      return;
    }
    
    // Use the service client to bypass RLS for admin operations
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get the user's profile data
    const { data: userData, error: userError } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (userError || !userData) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user profile',
        error: userError?.message || 'User not found'
      });
      return;
    }
    
    // Extract email, name, and notification preferences
    const { 
      email, 
      name, 
      tips_and_guidance: tipsAndGuidance = false, 
      product_updates: productUpdates = false 
    } = userData;
    
    try {
      await mailchimpService.addContact(
        email,
        name || '',
        tipsAndGuidance,
        productUpdates
      );
      
      res.status(200).json({
        success: true,
        message: 'User added to Mailchimp successfully'
      });
    } catch (mailchimpError: any) {
      // Check if it's just that the contact already exists
      if (mailchimpError.response?.body?.title === 'Member Exists') {
        // If the member exists, try to update their tags instead
        try {
          await mailchimpService.updateUserTags(
            email,
            name || '',
            tipsAndGuidance,
            productUpdates
          );
          
          res.status(200).json({
            success: true,
            message: 'User already existed in Mailchimp and was updated successfully'
          });
        } catch (updateError: any) {
          res.status(500).json({
            success: false,
            message: 'Failed to update existing user in Mailchimp',
            error: updateError.message || 'Unknown error'
          });
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to add user to Mailchimp',
          error: mailchimpError.message || 'Unknown error'
        });
      }
    }
  } catch (error) {
    console.error('Add current user to Mailchimp error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Get the current user's profile data
 */
export const getProfile: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const userId = user.id;
    
    // Use the service client to bypass RLS for admin operations
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Get the user's profile data from the database
    const { data: profile, error: profileError } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profileError) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve profile',
        error: profileError.message
      });
      return;
    }
    
    // Check if the user has an active subscription
    const hasActiveSubscription = profile?.has_active_subscription || false;
    
    // Simple check - if profile exists in the database at all, consider it created
    const profileCreated = !!profile;
    
    // Format response
    const responseData = {
      ...profile,
      // Make sure to standardize camelCase for frontend consumption
      //hasActiveSubscription,
      profileCreated,
      // Map Supabase snake_case to camelCase for frontend
      tipsAndGuidance: profile?.tips_and_guidance || false,
      productUpdates: profile?.product_updates || false,
      squareCustomerId: profile?.square_customer_id || null,
      createdAt: profile?.created_at || null,
      updatedAt: profile?.updated_at || null,
      // Remove duplicated snake_case fields to avoid confusion
      tips_and_guidance: undefined,
      product_updates: undefined,
      square_customer_id: undefined,
      created_at: undefined,
      updated_at: undefined
    };
    
    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Update a user's university
 */
export const updateUniversity: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const { university } = req.body;
    
    if (!university) {
      res.status(400).json({ 
        success: false, 
        message: 'University is required' 
      });
      return;
    }
    
    const userId = user.id;

    // Update university
    const { data, error } = await supabaseService.updateUserUniversity(userId, university);
    
    if (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'University updated successfully',
      data
    });
  } catch (error) {
    console.error('Update university error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Update a user's signed_up status
 */
export const updateSignedUp: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const { signed_up } = req.body;
    
    if (signed_up === undefined) {
      res.status(400).json({ 
        success: false, 
        message: 'signed_up field is required' 
      });
      return;
    }
    
    const userId = user.id;

    // Update signed_up status
    const { data, error } = await supabaseService.updateSignedUp(userId, signed_up);
    
    if (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Signed up status updated successfully',
      data
    });
  } catch (error) {
    console.error('Update signed up status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Update a user's name across all systems (auth, database, Mailchimp, Square)
 */
export const updateUserName: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const { name } = req.body;
    
    if (!name) {
      res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
      return;
    }
    
    const userId = user.id;
    const email = user.email;
    
    console.log(`Updating name for user ${userId} (${email}) to: ${name}`);
    
    // Use the service client to bypass RLS for admin operations
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // 1. Update name in Supabase (database and auth)
    const { data: userData, error: supabaseError } = await supabaseService.updateUserName(userId, name);
    
    if (supabaseError) {
      res.status(500).json({
        success: false,
        message: 'Failed to update name in database',
        error: supabaseError.message
      });
      return;
    }
    
    // Track any errors that occur in external services
    const serviceErrors: {service: string, error: string}[] = [];
    
    // 2. Update name in Mailchimp if service is initialized
    if (mailchimpService.isInitialized()) {
      try {
        await mailchimpService.updateContactName(email, name);
        console.log('Successfully updated name in Mailchimp');
      } catch (mailchimpError: any) {
        // Log error but don't fail the request
        console.error('Error updating name in Mailchimp:', mailchimpError);
        serviceErrors.push({
          service: 'Mailchimp',
          error: mailchimpError.message || 'Unknown error'
        });
      }
    }
    
    // 3. Update name in Square if user has a Square customer ID
    try {
      // Get the user's Square customer ID from the database
      const { data: userProfile } = await client
        .from('users')
        .select('square_customer_id')
        .eq('id', userId)
        .single();
      
      if (userProfile && userProfile.square_customer_id) {
        try {
          await squareService.updateCustomerName(userProfile.square_customer_id, name);
          console.log('Successfully updated name in Square');
        } catch (squareError: any) {
          // Log error but don't fail the request
          console.error('Error updating name in Square:', squareError);
          serviceErrors.push({
            service: 'Square',
            error: squareError.message || 'Unknown error'
          });
        }
      } else {
        console.log('User does not have a Square customer ID, skipping Square update');
      }
    } catch (profileError: any) {
      console.error('Error fetching user profile for Square update:', profileError);
      serviceErrors.push({
        service: 'Square lookup',
        error: profileError.message || 'Unknown error'
      });
    }
    
    // Return success response with any service errors
    res.status(200).json({
      success: true,
      message: 'Name updated successfully',
      data: userData,
      serviceErrors: serviceErrors.length > 0 ? serviceErrors : undefined
    });
    
  } catch (error) {
    console.error('Update name error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Update a user's video usage permission
 */
export const updateAllowVideoUsage: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const { allow_video_usage } = req.body;
    
    if (allow_video_usage === undefined) {
      res.status(400).json({ 
        success: false, 
        message: 'allow_video_usage field is required' 
      });
      return;
    }
    
    const userId = user.id;

    // Update video usage permission
    const { data, error } = await supabaseService.updateAllowVideoUsage(userId, allow_video_usage);
    
    if (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Video usage permission updated successfully',
      data
    });
  } catch (error) {
    console.error('Update video usage permission error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

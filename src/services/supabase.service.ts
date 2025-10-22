import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config/config';
import { defaultProgress } from '../utils/defaultProgress';
import { UserProgress } from '../types/progress';
import { User, SignupData } from '../types/user';

class SupabaseService {
  private _client: SupabaseClient;
  private _serviceClient: SupabaseClient | null = null;

  constructor() {
    this._client = createClient(config.supabase.url, config.supabase.key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  }

  /**
   * Get Supabase client
   * @returns SupabaseClient
   */
  get client(): SupabaseClient {
    return this._client;
  }

  /**
   * Get service role client for admin operations (bypasses RLS)
   * @returns SupabaseClient with service role privileges or null if service key not available
   */
  get serviceClient(): SupabaseClient | null {
    // Initialize service client if we have service role key and it's not already initialized
    if (!this._serviceClient && config.supabase.serviceKey) {
      this._serviceClient = createClient(
        config.supabase.url,
        config.supabase.serviceKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
    }
    return this._serviceClient;
  }

  /**
   * Sign up a new user
   * @param email User email
   * @param password User password
   * @returns User data or error
   */
  async signUp(email: string, password: string) {
    return await this._client.auth.signUp({
      email,
      password,
    });
  }

  /**
   * Sign in a user
   * @param email User email
   * @param password User password
   * @returns Session data or error
   */
  async signIn(email: string, password: string) {
    // Ensure we get both access and refresh tokens
    const { data, error } = await this._client.auth.signInWithPassword({
      email,
      password,
    });
    
    // Debug what Supabase returns
    console.log('Supabase signIn result:', {
      hasSession: !!data?.session,
      hasAccessToken: !!data?.session?.access_token,
      hasRefreshToken: !!data?.session?.refresh_token,
      sessionKeys: data?.session ? Object.keys(data.session) : []
    });
    
    return { data, error };
  }

  /**
   * Sign out a user
   * @returns Result of sign out operation
   */
  async signOut() {
    return await this._client.auth.signOut();
  }

  /**
   * Get user by id
   * @param id User id
   * @returns User data or null
   */
  async getUserById(id: string) {
    const { data, error } = await this._client
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  }

  /**
   * Check if a user already exists by email
   * @param email User email
   * @returns Boolean indicating if user exists
   */
  async userExistsByEmail(email: string) {
    const { data, error } = await this._client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    
    if (error) {
      throw error;
    }
    
    return !!data;
  }

  /**
   * Register a new user with Supabase Auth
   * @param profile Profile data including name, meta, email, password, and consent
   * @returns Profile data or error
   */
  async registerAuthUser(profile: { name: string; meta?: any; email: string; password: string; consent: boolean }) {
    // Register the user with Supabase Auth with user metadata
    const { data: authData, error: authError } = await this._client.auth.signUp({
      email: profile.email,
      password: profile.password,
      options: {
        data: {
          name: profile.name,
          meta: profile.meta || {},
          consent: profile.consent,
          payment_methods: [],
          created_at: new Date().toISOString()
        }
      }
    });
    
    if (authError) {
      throw authError;
    }
    
    return { auth: authData, profile: authData?.user?.user_metadata };
  }

  /**
   * Create a user record in the users database table
   * @param userId The user's ID from auth
   * @param profileData Profile data to save including:
   *   - name: User's name
   *   - email: User's email address
   *   - university: User's university (optional)
   *   - allow_video_usage: Whether user allows video usage (default: false)
   *   - signup_data: Additional signup data as JSONB (default: {})
   * @returns Result of operation with data and error properties
   */
  async createUserDatabaseRecord(userId: string, profileData: { 
    name: string; 
    email: string; 
    university?: string; 
    allow_video_usage?: boolean; 
    signup_data?: SignupData; 
    [key: string]: any; 
  }) {
    try {
      console.log('Creating user profile for user ID:', userId);
      console.log('Profile data:', profileData);
      
      // Extract data from the profile object
      const { name, university, email, allow_video_usage = false, signup_data = {} } = profileData;
      
      // Check if we have a service client available (needed to bypass RLS)
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service role client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // Create the user record in the users table using the service client to bypass RLS
      const { data, error } = await this.serviceClient
        .from('users')
        .upsert({
          id: userId,
          name,
          email,
          university,
          allow_video_usage,
          progress: defaultProgress, // Use default progress from utils
          has_active_subscription: false, // New user starts with no active subscription
          square_customer_id: null, // Will be updated when user subscribes in Square
          signup_data, // Include signup data
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });
      
      if (error) {
        console.error('Error creating user profile:', error);
        return { data: null, error };
      }
      
      console.log('Profile created successfully');
      return { data, error: null };
    } catch (err) {
      console.error('Exception in createUserDatabaseRecord:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to create user profile') 
      };
    }
  }

  /**
   * Get user by access token
   * @param token JWT access token
   * @returns User data or error
   */
  async getUserByToken(token: string) {
    try {
      // Set auth headers directly for this request
      const { data, error } = await this._client.auth.getUser(token);
      
      if (error) {
        console.error('Error getting user by token:', error.message);
        return { data: null, error };
      }
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in getUserByToken:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to get user by token') 
      };
    }
  }

  /**
   * Refresh session using refresh token
   * @param refreshToken JWT refresh token
   * @returns New access and refresh tokens or error
   */
  async refreshSession(refreshToken: string) {
    try {
      // Attempt to refresh the session with the refresh token
      const { data, error } = await this._client.auth.refreshSession({
        refresh_token: refreshToken
      });
      
      if (error) {
        console.error('Error refreshing session:', error.message);
        return { data: null, error };
      }
      
      if (!data.session) {
        return { 
          data: null, 
          error: new Error('No session returned when refreshing token') 
        };
      }
      
      return { 
        data: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token
        }, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in refreshSession:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to refresh session') 
      };
    }
  }

  /**
   * Confirm a user's email address using the admin API
   * This bypasses the email confirmation step for development
   * @param userId The user ID to confirm
   * @returns Result of the operation
   */
  async confirmUserEmail(userId: string) {
    try {
      // Check if we have a service client available
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service role client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // Use the admin API to update the user's email confirmation status
      const { data, error } = await this.serviceClient.auth.admin.updateUserById(
        userId,
        { email_confirm: true }
      );
      
      if (error) {
        console.error('Error confirming user email:', error);
        return { data: null, error };
      }
      
      console.log('User email confirmed successfully');
      return { data, error: null };
    } catch (err) {
      console.error('Exception in confirmUserEmail:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to confirm user email') 
      };
    }
  }

  /**
   * Send a password reset email to the user
   * @param email User email
   * @returns Result of the operation
   */
  async resetPassword(email: string) {
    try {
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Send password reset email with redirect to frontend
      const { data, error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${config.clientUrl}/reset-password`
      });
      
      if (error) {
        console.error('Error sending password reset email:', error.message);
        return { data: null, error };
      }
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in resetPassword:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to send password reset email') 
      };
    }
  }

  /**
   * Request email change for a user
   * This will send a confirmation email to the new address
   * @param userId User ID
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after email confirmation
   * @returns Result of the operation
   */
  async requestEmailChange(userId: string, newEmail: string, redirectTo?: string) {
    try {
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      // First, get the current user to make sure they exist
      const { data: userData, error: userError } = await client.auth.admin.getUserById(userId);
      if (userError) {
        console.error('Error getting user data:', userError.message);
        return { data: null, error: userError };
      }
      
      console.log('Current user email:', userData?.user?.email);
      console.log('New email:', newEmail);

      // Prepare options for email confirmation
      const options: any = {
        email_confirm: false // Require email confirmation
      };
      
      if (redirectTo) {
        options.email_confirm_redirect_url = redirectTo;
      }

      // Use the admin API to update the user's email
      // This will send a confirmation email to the new address
      const { data, error } = await client.auth.admin.updateUserById(
        userId,
        { 
          email: newEmail,
          ...options
        }
      );
      
      if (error) {
        console.error('Error requesting email change:', error.message);
        return { data: null, error };
      }
      
      console.log('Email change requested successfully');
      return { data, error: null };
    } catch (err) {
      console.error('Exception in requestEmailChange:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to request email change') 
      };
    }
  }

  /**
   * Update user email in the database after confirmation
   * This should be called after the user confirms their email change
   * @param userId User ID
   * @param newEmail New confirmed email address
   * @returns Result of the operation
   */
  async updateUserEmailInDatabase(userId: string, newEmail: string) {
    try {
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Update the email in the users table
      const { error } = await client
        .from('users')
        .update({ email: newEmail })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating email in users table:', error.message);
        return { success: false, error };
      }
      
      console.log('User email updated in database successfully');
      return { success: true, error: null };
    } catch (err) {
      console.error('Exception in updateUserEmailInDatabase:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err : new Error('Failed to update user email in database') 
      };
    }
  }

  /**
   * Update a user's email address
   * @param userId User ID
   * @param newEmail New email address
   * @returns Result of the operation
   */
  async updateUserEmail(userId: string, newEmail: string) {
    try {
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      // Update the user's email in auth
      const { data, error } = await client.auth.admin.updateUserById(
        userId,
        { 
          email: newEmail,
          email_confirm: true // Skip email confirmation
        }
      );
      
      if (error) {
        console.error('Error updating user email:', error.message);
        return { data: null, error };
      }
      
      // Also update the email in the users table
      const { error: dbError } = await client
        .from('users')
        .update({ email: newEmail })
        .eq('id', userId);
      
      if (dbError) {
        console.error('Error updating email in users table:', dbError.message);
        return { data, error: dbError };
      }
      
      console.log('User email updated successfully');
      return { data, error: null };
    } catch (err) {
      console.error('Exception in updateUserEmail:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to update user email') 
      };
    }
  }

  /**
   * Initiate an email change with confirmation
   * @param userId User ID
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after confirmation
   * @returns Result of the operation
   */
  async initiateEmailChange(userId: string, newEmail: string, redirectTo?: string) {
    try {
      // Make sure we have the service client
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      // First get the user to ensure they exist
      const { data: userData, error: userError } = await this.serviceClient.auth.admin.getUserById(userId);
      if (userError) {
        console.error('Error getting user data:', userError.message);
        return { data: null, error: userError };
      }

      console.log('Current user email:', userData?.user?.email);
      console.log('New email:', newEmail);

      // For Supabase, we need to use their updateUserById method
      // with the correct options to trigger an email confirmation
      const options: any = { 
        email: newEmail,
        email_confirm: false // This should trigger a confirmation email
      };

      // Add redirect URL if provided
      if (redirectTo) {
        options.email_confirm_redirect_url = redirectTo;
      }

      console.log('Initiating email change with options:', JSON.stringify(options, null, 2));

      // Use the admin API to update the user's email
      const { data, error } = await this.serviceClient.auth.admin.updateUserById(
        userId,
        options
      );
      
      if (error) {
        console.error('Error initiating email change:', error.message);
        return { data: null, error };
      }
      
      console.log('Email change initiated successfully');
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in initiateEmailChange:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to initiate email change') 
      };
    }
  }

  /**
   * Request email change with confirmation using Supabase's built-in flow
   * This method uses the REST API directly to trigger the email confirmation flow
   * 
   * @param accessToken User's access token
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after confirmation
   * @returns Result of the operation
   */
  async requestEmailChangeWithConfirmation(accessToken: string, newEmail: string, redirectTo?: string) {
    try {
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      console.log('Requesting email change with REST API');
      console.log('New email:', newEmail);
      console.log('Redirect URL:', redirectTo || 'Not provided');
      
      // Prepare the request body
      const requestBody: any = {
        email: newEmail
      };
      
      // Add redirect URL if provided
      if (redirectTo) {
        requestBody.email_confirm_redirect_url = redirectTo;
      }
      
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      
      // Make a direct API call to Supabase's auth endpoint
      // Note: We're using POST instead of PATCH as some servers might not support PATCH
      const response = await fetch(`${config.supabase.url}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': config.supabase.key
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('API response status:', response.status);
      
      // Handle empty response
      const responseText = await response.text();
      console.log('API response text:', responseText);
      
      let responseData;
      try {
        // Try to parse the response as JSON
        responseData = responseText ? JSON.parse(responseText) : {};
        console.log('API response data:', JSON.stringify(responseData, null, 2));
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        responseData = {};
      }
      
      if (!response.ok) {
        const errorMessage = responseData.error || response.statusText || 'Unknown error';
        console.error('Error requesting email change:', errorMessage);
        return { 
          data: null, 
          error: new Error(`Failed to update email: ${errorMessage}`) 
        };
      }
      
      console.log('Email change requested successfully');
      
      return { 
        data: responseData, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in requestEmailChangeWithConfirmation:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to request email change') 
      };
    }
  }

  /**
   * Request email change with confirmation using the admin API
   * @param userId User ID
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after confirmation
   * @returns Result of the operation
   */
  async requestEmailChangeWithAdmin(userId: string, newEmail: string, redirectTo?: string) {
    try {
      // Make sure we have the service client
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      // First get the user to ensure they exist
      const { data: userData, error: userError } = await this.serviceClient.auth.admin.getUserById(userId);
      if (userError) {
        console.error('Error getting user data:', userError.message);
        return { data: null, error: userError };
      }

      console.log('Current user email:', userData?.user?.email);
      console.log('New email:', newEmail);

      // Try a different approach - use the admin API to create a custom OTP
      console.log('Attempting to create a custom OTP for email change');
      
      // First, update user metadata to store the pending email change
      const { error: metadataError } = await this.serviceClient.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            pending_email_change: newEmail
          }
        }
      );
      
      if (metadataError) {
        console.error('Error updating user metadata:', metadataError.message);
        return { data: null, error: metadataError };
      }
      
      // Generate a one-time password for email verification
      const { data: otpData, error: otpError } = await this.serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: newEmail,
        options: {
          redirectTo: redirectTo || config.clientUrl
        }
      });

      if (otpError) {
        console.error('Error generating recovery link:', otpError.message);
        return { data: null, error: otpError };
      }

      console.log('Recovery link generated successfully for email change verification');
      console.log('OTP data:', JSON.stringify(otpData, null, 2));
      
      // Return success
      return { 
        data: { 
          user: userData.user,
          email: newEmail,
          message: 'Email change verification sent'
        }, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in requestEmailChangeWithAdmin:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to request email change') 
      };
    }
  }

  /**
   * Complete email change after verification
   * @param userId User ID
   * @param token Verification token
   * @returns Result of the operation
   */
  async completeEmailChange(userId: string, token: string) {
    try {
      // Make sure we have the service client
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // First get the user to ensure they exist and get the pending email
      const { data: userData, error: userError } = await this.serviceClient.auth.admin.getUserById(userId);
      if (userError) {
        console.error('Error getting user data:', userError.message);
        return { data: null, error: userError };
      }
      
      // Get the pending email from user metadata
      const pendingEmail = userData.user.user_metadata?.pending_email_change;
      if (!pendingEmail) {
        return {
          data: null,
          error: new Error('No pending email change found')
        };
      }
      
      console.log('Found pending email change:', pendingEmail);
      
      // Verify the token and update the email
      const { data, error } = await this.serviceClient.auth.admin.updateUserById(
        userId,
        { 
          email: pendingEmail,
          email_confirm: true, // Skip email confirmation since we've already verified
          user_metadata: {
            // Remove the pending email change from metadata
            pending_email_change: null
          }
        }
      );
      
      if (error) {
        console.error('Error updating user email:', error.message);
        return { data: null, error };
      }
      
      // Also update the email in the users table
      const { error: dbError } = await this.serviceClient
        .from('users')
        .update({ email: pendingEmail })
        .eq('id', userId);
      
      if (dbError) {
        console.error('Error updating email in users table:', dbError.message);
        // Don't return error here, as the auth email is already updated
      }
      
      console.log('Email change completed successfully');
      return { 
        data: { 
          user: data.user,
          email: pendingEmail,
          message: 'Email change completed successfully'
        }, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in completeEmailChange:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to complete email change') 
      };
    }
  }

  /**
   * Check if user's email in auth matches the email in the users table
   * @param userId User ID
   * @returns Result with needsSync flag and user data
   */
  async checkEmailSync(userId: string) {
    try {
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Get user from auth
      const { data: authUser, error: authError } = await client.auth.admin.getUserById(userId);
      if (authError) {
        console.error('Error getting auth user:', authError.message);
        return { 
          data: null, 
          error: authError 
        };
      }
      
      if (!authUser || !authUser.user) {
        return {
          data: null,
          error: new Error('User not found in auth system')
        };
      }
      
      // Get user from database
      const { data: dbUser, error: dbError } = await client
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();
      
      if (dbError) {
        console.error('Error getting user from database:', dbError.message);
        return { 
          data: null, 
          error: dbError 
        };
      }
      
      const authEmail = authUser.user.email;
      const dbEmail = dbUser?.email;
      
      // Check if emails match
      const needsSync = authEmail !== dbEmail;
      
      return {
        data: {
          needsSync,
          authEmail,
          dbEmail,
          user: authUser.user
        },
        error: null
      };
    } catch (err) {
      console.error('Exception in checkEmailSync:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to check email sync') 
      };
    }
  }

  /**
   * Sync user's email in the database with the email in auth
   * @param userId User ID
   * @returns Result of the operation
   */
  async syncEmailInDatabase(userId: string) {
    try {
      // First check if sync is needed
      const { data: checkData, error: checkError } = await this.checkEmailSync(userId);
      if (checkError) {
        return { data: null, error: checkError };
      }
      
      if (!checkData || !checkData.needsSync) {
        // No sync needed
        return { 
          data: { 
            synced: false, 
            message: 'Email already in sync' 
          }, 
          error: null 
        };
      }
      
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Update the email in the users table
      const { error: updateError } = await client
        .from('users')
        .update({ email: checkData.authEmail })
        .eq('id', userId);
      
      if (updateError) {
        console.error('Error updating email in database:', updateError.message);
        return { data: null, error: updateError };
      }
      
      console.log('Email synced successfully for user:', userId);
      return { 
        data: { 
          synced: true, 
          message: 'Email synced successfully',
          oldEmail: checkData.dbEmail,
          newEmail: checkData.authEmail
        }, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in syncEmailInDatabase:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to sync email in database') 
      };
    }
  }

  /**
   * Initialize the users table for duplicate checking
   */
  async initialize(): Promise<void> {
    try {
      // Check if users table exists, if not create it
      const { error } = await this.client.from('users').select('id').limit(1);
      
      if (error && error.message.includes('does not exist')) {
        console.log('Creating users table for email duplicate checking');
        // Create the users table using SQL
        const { error: createError } = await this.client.rpc('create_users_table');
        
        if (createError) {
          console.error('Error creating users table:', createError);
        } else {
          console.log('Users table created successfully');
        }
      }
    } catch (error) {
      console.error('Error initializing Supabase service:', error);
    }
  }

  /**
   * Request email change using Supabase's built-in confirmation flow with admin API
   * 
   * @param userId User ID
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after confirmation
   * @returns Result of the operation
   */
  async requestEmailChangeWithBuiltInFlow(userId: string, newEmail: string, redirectTo?: string) {
    try {
      // Make sure we have the service client
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      // First get the user to ensure they exist
      const { data: userData, error: userError } = await this.serviceClient.auth.admin.getUserById(userId);
      if (userError) {
        console.error('Error getting user data:', userError.message);
        return { data: null, error: userError };
      }

      console.log('Current user email:', userData?.user?.email);
      console.log('New email:', newEmail);

      // Use generateLink with email_change_new type to generate a confirmation link
      // This is the proper way to trigger Supabase's built-in email confirmation flow
      console.log('Generating email change confirmation link');
      console.log(`Current email: ${userData.user.email}, New email: ${newEmail}`);
      console.log(`Redirect URL: ${redirectTo || config.clientUrl}`);
      
      // According to Supabase documentation, to trigger the email confirmation flow:
      // 1. We need to set email_confirm: false
      // 2. We can set email_confirm_redirect_url for redirection after confirmation
      
      // Create the update options
      const updateOptions: Record<string, any> = {
        email: newEmail,
        email_confirm: false
      };
      
      // Add redirect URL if provided
      if (redirectTo) {
        updateOptions.email_confirm_redirect_url = redirectTo;
      }

      console.log('Link parameters:', JSON.stringify(updateOptions, null, 2));

      // Use the admin API to update the user's email and trigger confirmation
      const { data, error } = await this.serviceClient.auth.admin.updateUserById(
        userId,
        updateOptions
      );
      
      if (error) {
        console.error('Error initiating email change:', error.message);
        return { data: null, error };
      }
      
      console.log('Email change initiated successfully');
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      return { 
        data: { 
          user: userData.user,
          email: newEmail,
          message: 'Email change confirmation sent'
        }, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in requestEmailChangeWithBuiltInFlow:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to request email change') 
      };
    }
  }

  /**
   * Request email change using Supabase's built-in confirmation flow with admin API
   * 
   * @param userId User ID
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after confirmation
   * @returns Result of the operation
   */
  async requestEmailChangeAdmin(userId: string, newEmail: string, redirectTo?: string) {
    try {
      // Make sure we have the service client
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service client not available. Check SUPABASE_SERVICE_KEY in your environment.')
        };
      }
      
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      // First get the user to ensure they exist
      const { data: userData, error: userError } = await this.serviceClient.auth.admin.getUserById(userId);
      if (userError) {
        console.error('Error getting user data:', userError.message);
        return { data: null, error: userError };
      }

      console.log('Current user email:', userData?.user?.email);
      console.log('New email:', newEmail);

      // According to Supabase documentation, to trigger the email confirmation flow:
      // 1. We need to set email_confirm: false
      // 2. We can set email_confirm_redirect_url for redirection after confirmation
      
      // Create the update options
      const updateOptions = {
        email: newEmail,
        email_confirm: false
      } as any;
      
      // Add redirect URL if provided
      if (redirectTo) {
        updateOptions.email_confirm_redirect_url = redirectTo;
      }
      
      console.log('Requesting email change with options:', JSON.stringify(updateOptions, null, 2));

      // Use the admin API to update the user's email and trigger confirmation
      const { data, error } = await this.serviceClient.auth.admin.updateUserById(
        userId,
        updateOptions
      );
      
      if (error) {
        console.error('Error requesting email change:', error.message);
        return { data: null, error };
      }
      
      console.log('Email change requested successfully');
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in requestEmailChangeAdmin:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to request email change') 
      };
    }
  }

  /**
   * Request email change using Supabase's direct API approach
   * This method follows the guide provided and uses a direct API call
   * to trigger the built-in email confirmation flow
   * 
   * @param accessToken User's access token
   * @param newEmail New email address
   * @param redirectTo URL to redirect to after confirmation
   * @returns Result of the operation
   */
  async requestEmailChangeDirectApi(accessToken: string, newEmail: string, redirectTo?: string) {
    try {
      // Check if email already exists
      const emailExists = await this.userExistsByEmail(newEmail);
      if (emailExists) {
        return {
          data: null,
          error: new Error('Email address is already in use')
        };
      }

      console.log('Requesting email change with direct API approach');
      console.log('New email:', newEmail);
      console.log('Redirect URL:', redirectTo || 'Not provided');
      console.log('Access token (first 10 chars):', accessToken.substring(0, 10) + '...');

      // Prepare the request body
      const requestBody: any = {
        email: newEmail
      };
      
      // Add redirect URL if provided
      if (redirectTo) {
        requestBody.email_confirm_redirect_url = redirectTo;
      }

      // Make a direct API call to Supabase's auth endpoint
      const response = await fetch(`${config.supabase.url}/auth/v1/user`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': config.supabase.key
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.json();
      
      console.log('API response status:', response.status);
      console.log('API response data:', JSON.stringify(responseData, null, 2));

      if (!response.ok) {
        const errorMessage = responseData.error || response.statusText;
        console.error('Error requesting email change:', errorMessage);
        return { 
          data: null, 
          error: new Error(`Failed to update email: ${errorMessage}`) 
        };
      }
      
      console.log('Email change requested successfully');
      
      return { 
        data: responseData, 
        error: null 
      };
    } catch (err) {
      console.error('Exception in requestEmailChangeDirectApi:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to request email change') 
      };
    }
  }

  /**
   * Resend verification email to a user
   * @param email User's email address
   * @returns Result of the operation
   */
  async resendVerificationEmail(email: string) {
    try {
      console.log('Resending verification email to:', email);
      
      // Check if we have a service client available (needed for admin operations)
      if (!this.serviceClient) {
        return {
          data: null,
          error: new Error('Service client not available. Make sure SUPABASE_SERVICE_KEY is set.')
        };
      }

      // Use the correct method to resend verification email to an existing user
      const { data, error } = await this.serviceClient.auth.resend({
        type: 'signup',
        email: email
      });
      
      if (error) {
        console.error('Error resending verification email:', error.message);
        return { data: null, error };
      }
      
      console.log('Verification email resent successfully');
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in resendVerificationEmail:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to resend verification email') 
      };
    }
  }

  /**
   * Update a user's university
   * @param userId User ID
   * @param university New university value
   * @returns Result of the operation
   */
  async updateUserUniversity(userId: string, university: string) {
    try {
      console.log('Updating university for user ID:', userId);
      console.log('New university:', university);
      
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Update the university field in the users table
      const { data, error } = await client
        .from('users')
        .update({ university })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating university:', error.message);
        return { data: null, error };
      }
      
      console.log('University updated successfully');
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in updateUserUniversity:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to update university') 
      };
    }
  }

  /**
   * Update a user's video usage permission
   * @param userId User ID
   * @param allowVideoUsage New allow_video_usage value
   * @returns Result of the operation
   */
  async updateAllowVideoUsage(userId: string, allowVideoUsage: boolean) {
    try {
      console.log('Updating allow_video_usage for user ID:', userId);
      console.log('New allow_video_usage value:', allowVideoUsage);
      
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Update the allow_video_usage field in the users table
      const { data, error } = await client
        .from('users')
        .update({ allow_video_usage: allowVideoUsage })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating allow_video_usage:', error.message);
        return { data: null, error };
      }
      
      console.log('Video usage permission updated successfully');
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in updateAllowVideoUsage:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to update video usage permission') 
      };
    }
  }

  /**
   * Update a user's name in the database and auth metadata
   * @param userId User ID
   * @param name New name value
   * @returns Result of the operation
   */
  async updateUserName(userId: string, name: string) {
    try {
      console.log('Updating name for user ID:', userId);
      console.log('New name:', name);
      
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Update the name field in the users table
      const { data, error } = await client
        .from('users')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('*')
        .single();
      
      if (error) {
        console.error('Error updating name in database:', error.message);
        return { data: null, error };
      }

      // Also update the user's metadata in auth
      if (this.serviceClient) {
        try {
          const { error: metadataError } = await this.serviceClient.auth.admin.updateUserById(
            userId,
            { user_metadata: { name } }
          );
          
          if (metadataError) {
            console.error('Error updating name in auth metadata:', metadataError.message);
            // Don't fail the operation if only the metadata update fails
          } else {
            console.log('Name updated successfully in auth metadata');
          }
        } catch (metaErr) {
          console.error('Exception updating auth metadata:', metaErr);
          // Don't fail the operation if only the metadata update fails
        }
      }
      
      console.log('Name updated successfully in database');
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in updateUserName:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to update name') 
      };
    }
  }

  /**
   * Update a user's signed_up status
   * @param userId User ID
   * @param signedUp New signed_up value
   * @returns Result of the operation
   */
  async updateSignedUp(userId: string, signedUp: boolean) {
    try {
      console.log('Updating signed_up status for user ID:', userId);
      console.log('New signed_up value:', signedUp);
      
      // Use the service client if available to bypass RLS
      const client = this.serviceClient || this._client;
      
      // Update the signed_up field in the users table
      const { data, error } = await client
        .from('users')
        .update({ signed_up: signedUp, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('*')
        .single();
      
      if (error) {
        console.error('Error updating signed_up status:', error.message);
        return { data: null, error };
      }
      
      console.log('Signed up status updated successfully');
      
      return { data, error: null };
    } catch (err) {
      console.error('Exception in updateSignedUp:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to update signed up status') 
      };
    }
  }
}

export default new SupabaseService();

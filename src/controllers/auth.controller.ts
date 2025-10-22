import { Request, Response, RequestHandler } from 'express';
import supabaseService from '../services/supabase.service';
import { createClient } from '@supabase/supabase-js';
import config from '../config/config';
import { 
  DSP_ACCESS_TOKEN_NAME, 
  DSP_REFRESH_TOKEN_NAME,
  ACCESS_TOKEN_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE_OPTIONS
} from '../constants/auth.constants';
import { getDomainFromUrl } from '../utils/url.utils';

// Helper to detect Safari browser
const isSafari = (req: Request): boolean => {
  const userAgent = req.headers['user-agent'] || '';
  
  // More robust Safari detection that handles modern Safari user agents
  // Safari always includes 'Safari' and 'Version' but Chrome/Edge don't include 'Version'
  const hasSafari = userAgent.includes('Safari');
  const hasVersion = userAgent.includes('Version/');
  const isChrome = userAgent.includes('Chrome/') && !userAgent.includes('Edg');
  const isEdge = userAgent.includes('Edg');
  const isFirefox = userAgent.includes('Firefox');
  const isOpera = userAgent.includes('OPR') || userAgent.includes('Opera');
  
  // True Safari has 'Safari' and 'Version' but is not Chrome, Edge, Firefox, or Opera
  // This handles both desktop Safari and mobile Safari (including iOS Chrome which uses Safari engine)
  return hasSafari && hasVersion && !isChrome && !isEdge && !isFirefox && !isOpera;
};

// Helper function to get cookie options based on browser and environment
const getCookieOptions = (req: Request, isRefreshToken: boolean = false) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSafariBrowser = isSafari(req);
  const options = isRefreshToken ? REFRESH_TOKEN_COOKIE_OPTIONS : ACCESS_TOKEN_COOKIE_OPTIONS;

  // For all browsers in production, ensure proper cross-origin cookie settings
  if (isProduction) {
    return {
      ...options,
      secure: true,
      sameSite: 'none' as 'none', // Cross-site cookies in production need 'none'
      // Keep domain as is from options
    };
  }
  
  // For Safari in development, we need special handling
  if (isSafariBrowser && !isProduction) {
    return {
      ...options,
      secure: false, // Safari in local dev has issues with secure cookies
      sameSite: 'lax' as 'lax',
      domain: undefined // Don't set domain for Safari in development
    };
  }

  return options;
};

// --- Add Factor type for local use ---
type Factor = {
  id: string;
  status: string;
  factor_type?: string;
  totp?: {
    qr_code?: string;
  };
  [key: string]: any;
};

export const login: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
      return;
    }
    
    const { data, error } = await supabaseService.signIn(email, password);
    if (data && data.user) {
      // Enforce MFA: If user has a verified TOTP factor, require MFA
      const hasVerifiedTotp = Array.isArray(data.user.factors) && data.user.factors.some(
        (f: any) => f.status === 'verified' && f.factor_type === 'totp'
      );
      if (hasVerifiedTotp) {
        res.status(200).json({
          success: false,
          mfaRequired: true,
          factors: data.user.factors,
          userId: data.user.id,
          accessToken: data.session?.access_token // Pass access token for MFA verification
        });
        return;
      }
    }
    
    if (error) {
      // If MFA is required, Supabase returns error.status === 400 and error.message includes 'MFA required'
      const err: any = error;
      if (error.status === 400 && error.message && error.message.toLowerCase().includes('mfa')) {
        res.status(200).json({
          success: false,
          mfaRequired: true,
          factors: err.factors || [],
          userId: err.user?.id || null,
          accessToken: err.session?.access_token // Pass access token for MFA verification
        });
        return;
      }
      res.status(401).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }

    if (data?.session) {
      // Get browser-specific cookie options
      const accessTokenOptions = getCookieOptions(req);
      const refreshTokenOptions = getCookieOptions(req);
      
      // Set the access token cookie
      res.cookie(DSP_ACCESS_TOKEN_NAME, data.session.access_token, accessTokenOptions);
      
      // Also set the refresh token cookie if available
      if (data.session?.refresh_token) {
        res.cookie(DSP_REFRESH_TOKEN_NAME, data.session.refresh_token, refreshTokenOptions);
      }
      
      // Set headers to ensure cookies are properly set
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    // For Safari browsers, we need a token-based approach since cookies don't work properly
    const safariDetected = isSafari(req);
    console.log('Login - User Agent:', req.headers['user-agent']);
    console.log('Login - Safari detected:', safariDetected);
    
    if (safariDetected) {
      // Still set cookies as a fallback, but don't rely on them
      // Instead, return tokens in the response body for Safari
      console.log('Supabase session data:', {
        access_token: data.session?.access_token ? 'present' : 'missing',
        refresh_token: data.session?.refresh_token ? 'present' : 'missing',
        expires_at: data.session?.expires_at
      });
      res.status(200).json({
        success: true,
        data: {
          user: data.user,
          // Safari-specific auth data
          safariAuth: {
            accessToken: data.session?.access_token,
            refreshToken: data.session?.refresh_token,
            expiresAt: data.session?.expires_at,
            // Add a flag so frontend knows to use token-based auth for this session
            useSafariAuth: true
          }
        },
        // Also add top-level flag for easier detection
        useSafariAuth: true
      });
    } else {
      // For non-Safari browsers, still provide tokens as fallback for incognito mode
      // The frontend can use these if cookies don't work
      res.status(200).json({
        success: true,
        data: {
          user: data.user,
          // Provide tokens as fallback for incognito mode
          fallbackAuth: {
            accessToken: data.session?.access_token,
            refreshToken: data.session?.refresh_token,
            expiresAt: data.session?.expires_at
          }
        },
        useSafariAuth: false
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

export const logout: RequestHandler = async (req: Request, res: Response) => {
  try {
    
    const { error } = await supabaseService.signOut();
    
    if (error) {
      res.status(400).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Get browser-specific cookie options
    const cookieOptions = getCookieOptions(req);
    
    // Clear cookies
    res.clearCookie(DSP_ACCESS_TOKEN_NAME, cookieOptions);
    res.clearCookie(DSP_REFRESH_TOKEN_NAME, cookieOptions);
    
    // Also try clearing with minimal options in case that helps
    res.clearCookie(DSP_ACCESS_TOKEN_NAME, {
      path: '/',
    });
    res.clearCookie(DSP_REFRESH_TOKEN_NAME, {
      path: '/',
    });
    
    // For Safari, we need to send a special response indicating tokens should be cleared
    if (isSafari(req)) {
      res.status(200).json({ 
        success: true,
        message: 'Logged out successfully',
        safariAuth: {
          clearTokens: true,
          useSafariAuth: false
        },
        useSafariAuth: false
      });
    } else {
      // Standard response for other browsers
      res.status(200).json({ 
        success: true,
        message: 'Logged out successfully' 
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

export const verify: RequestHandler = async (req: Request, res: Response) => {
  try {
    
    // Get token from cookie first, then try other sources
    let token = req.cookies[DSP_ACCESS_TOKEN_NAME];
    let refreshToken = req.cookies[DSP_REFRESH_TOKEN_NAME];
    
    // Try Authorization header for all browsers (not just Safari)
    // This handles Safari cross-origin issues AND Chrome incognito mode
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    // Try query parameters as fallback (especially for Safari and refresh scenarios)
    if (!token && req.query.access_token) {
      token = req.query.access_token as string;
    }
    
    if (!refreshToken && req.query.refresh_token) {
      refreshToken = req.query.refresh_token as string;
    }
    
    if (!token) {
      if (!refreshToken) {
        res.status(200).json({
          authenticated: false
        });
        return;
      }
      
      // Try to refresh the session using the refresh token
      const { data: refreshData, error: refreshError } = await supabaseService.refreshSession(refreshToken);
      
      if (refreshError || !refreshData) {
        res.status(200).json({
          authenticated: false
        });
        return;
      }
      
      // Set new cookies with the refreshed tokens
      const { accessToken, refreshToken: newRefreshToken } = refreshData;
      
      // Get browser-specific cookie options
      const accessTokenOptions = getCookieOptions(req);
      const refreshTokenOptions = getCookieOptions(req, true);
      
      // Set new cookies with refreshed tokens
      res.cookie(DSP_ACCESS_TOKEN_NAME, accessToken, accessTokenOptions);
      res.cookie(DSP_REFRESH_TOKEN_NAME, newRefreshToken, refreshTokenOptions);
      
      // Set headers to ensure cookies are properly set
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Get user data with the new token
      const { data, error } = await supabaseService.getUserByToken(accessToken);
      
      if (error || !data || !data.user) {
        res.status(200).json({
          authenticated: false
        });
        return;
      }
      
      // Check if Safari or refresh token query parameter to return tokens
      const safariDetected = isSafari(req);
      const hasRefreshToken = !!req.query.refresh_token;

      
      // If Safari is detected OR this is a refresh request, return tokens
      if (safariDetected || hasRefreshToken) {
        res.status(200).json({
          authenticated: true,
          user: {
            id: data.user.id,
            email: data.user.email
          },
          safariAuth: {
            accessToken: accessToken,
            refreshToken: newRefreshToken,
            useSafariAuth: true
          },
          useSafariAuth: true
        });
      } else {
        res.status(200).json({
          authenticated: true,
          user: {
            id: data.user.id,
            email: data.user.email
          }
        });
      }
      return;
    }
    
    // Verify token is valid
    const { data, error } = await supabaseService.getUserByToken(token);
    
    if (error || !data || !data.user) {
      // If access token is invalid but refresh token exists, try the refresh flow
      if (refreshToken) {
        // Try to refresh the session using the refresh token
        const { data: refreshData, error: refreshError } = await supabaseService.refreshSession(refreshToken);
        
        if (refreshError || !refreshData) {
          
          // Clear invalid cookies with browser-specific options
          const clearOptions = getCookieOptions(req);
          res.clearCookie(DSP_ACCESS_TOKEN_NAME, clearOptions);
          res.clearCookie(DSP_REFRESH_TOKEN_NAME, clearOptions);
          
          res.status(200).json({
            authenticated: false
          });
          return;
        }
        
        // Set new cookies with the refreshed tokens
        const { accessToken, refreshToken: newRefreshToken } = refreshData;
        
        // Get browser-specific cookie options
        const accessTokenOptions = getCookieOptions(req);
        const refreshTokenOptions = getCookieOptions(req, true);
        
        console.log('Verify endpoint - Setting new cookies after token refresh');
        console.log('Browser info:', {
          userAgent: req.headers['user-agent'],
          isSafari: isSafari(req)
        });
        
        res.cookie(DSP_ACCESS_TOKEN_NAME, accessToken, accessTokenOptions);
        res.cookie(DSP_REFRESH_TOKEN_NAME, newRefreshToken, refreshTokenOptions);
        
        // Set headers to ensure cookies are properly set
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Get user data with the new token
        const { data: userData, error: userError } = await supabaseService.getUserByToken(accessToken);
        
        if (userError || !userData || !userData.user) {
          res.status(200).json({
            authenticated: false
          });
          return;
        }
        
        // Check if Safari or refresh token query parameter to return tokens
        const safariDetected = isSafari(req);
        const hasRefreshToken = !!req.query.refresh_token;

        
        // If Safari is detected OR this is a refresh request, return tokens
        if (safariDetected || hasRefreshToken) {
          res.status(200).json({
            authenticated: true,
            user: {
              id: userData.user.id,
              email: userData.user.email
            },
            safariAuth: {
              accessToken: accessToken,
              refreshToken: newRefreshToken,
              useSafariAuth: true
            },
            useSafariAuth: true
          });
        } else {
          res.status(200).json({
            authenticated: true,
            user: {
              id: userData.user.id,
              email: userData.user.email
            }
          });
        }
        return;
      }
      
      // No refresh token available, clear any invalid cookies
      const clearAccessOptions = {
        httpOnly: true,
        secure: !isSafari(req) || process.env.NODE_ENV === 'production',
        sameSite: 'lax' as 'lax',
        path: '/'
      };
      
      console.log('Clearing invalid cookies with options:', clearAccessOptions);
      res.clearCookie(DSP_ACCESS_TOKEN_NAME, clearAccessOptions);
      
      res.status(200).json({
        authenticated: false
      });
      return;
    }
    
    // For Safari, include the tokens in the response for the frontend to use
    const safariDetected = isSafari(req);
    const hasRefreshToken = !!req.query.refresh_token;
    console.log('=== VERIFY FINAL PATH DEBUG ===');
    console.log('Verify - User Agent:', req.headers['user-agent']);
    console.log('Verify - Safari detected:', safariDetected);
    console.log('Verify - Has refresh token query:', hasRefreshToken);
    console.log('Verify - Query params:', req.query);
    console.log('Verify - Original token:', token ? 'present' : 'missing');
    console.log('Verify - Original refreshToken:', refreshToken ? 'present' : 'missing');
    console.log('Verify - Will return tokens:', safariDetected || hasRefreshToken);
    console.log('===============================');
    
    // If Safari is detected OR this is a refresh request (with refresh_token query),
    // return tokens in the response for token-based authentication
    if (safariDetected || hasRefreshToken) {
      res.status(200).json({
        authenticated: true,
        user: {
          id: data.user.id,
          email: data.user.email
        },
        // Include the tokens for Safari token-based authentication
        safariAuth: {
          accessToken: token,
          // Include refresh token for complete Safari auth solution
          refreshToken: refreshToken,
          useSafariAuth: true
        },
        // Top-level flag for easier detection
        useSafariAuth: true
      });
    } else {
      // Standard response for other browsers
      res.status(200).json({
        authenticated: true,
        user: {
          id: data.user.id,
          email: data.user.email
        },
        useSafariAuth: false
      });
    }
  } catch (error) {
    res.status(200).json({
      authenticated: false
    });
  }
};

/**
 * Handle user signup
 * @route POST /api/auth/signup
 * @body {string} name - User's full name
 * @body {string} email - User's email address
 * @body {string} password - User's password
 * @body {string} university - User's university (optional)
 * @body {boolean} consent - User's consent to terms
 * @body {boolean} allow_video_usage - Whether user allows video usage (optional, default: false)
 * @body {object} meta - Additional metadata (optional)
 * @body {object} signup_data - Additional signup data stored as JSONB (optional)
 */
export const signup: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { name, email, password, university, consent, allow_video_usage = false, meta = {}, signup_data = {} } = req.body;
    
    if (!email || !password || !name || consent === undefined) {
      res.status(400).json({ 
        success: false, 
        message: 'Email, password, name, and consent are required' 
      });
      return;
    }
    
    // First, check if a user with this email already exists
    try {
      // Try to use the dedicated method first
      try {
        const userExists = await supabaseService.userExistsByEmail(email);
        if (userExists) {
          res.status(400).json({ 
            success: false, 
            message: 'A user with this email already exists' 
          });
          return;
        }
      } catch (checkError) {
        console.error('Error using userExistsByEmail:', checkError);
        // Fall back to manual checks if the method fails
      }
      
      // Fallback: manually check for existing users with this email
      // Use service client to bypass RLS, with fallback to regular client
      const client = supabaseService.serviceClient || supabaseService.client;
      
      const { data: users, error: usersError } = await client
        .from('users')
        .select('id')
        .eq('email', email);
        
      if (usersError) {
        console.error('Error checking for existing users:', usersError);
      } else if (users && users.length > 0) {
        res.status(400).json({ 
          success: false, 
          message: 'A user with this email already exists' 
        });
        return;
      }
      
      // Also check auth users directly as a fallback
      if (supabaseService.serviceClient) {
        // Use the correct API for listing users
        const { data: authUsers, error: authError } = await supabaseService.serviceClient.auth.admin.listUsers();
        
        // Filter users manually since the API might not support direct filtering
        const matchingUsers = authUsers?.users?.filter(user => user.email === email);
        
        if (!authError && matchingUsers && matchingUsers.length > 0) {
          res.status(400).json({ 
            success: false, 
            message: 'A user with this email already exists' 
          });
          return;
        }
      }
    } catch (err) {
      console.error('Error checking for existing users:', err);
    }
    
    // Create the user in Supabase auth
    const { data, error } = await supabaseService.signUp(email, password);
    
    if (error) {
      // Check for specific error messages related to duplicate emails
      if (error.message?.includes('User already registered') || 
          error.message?.includes('already exists') || 
          error.message?.includes('duplicate')) {
        res.status(400).json({ 
          success: false, 
          message: 'A user with this email already exists' 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      return;
    }
    
    const userId = data.user?.id;
    
    if (!userId) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to create user account' 
      });
      return;
    }
    
    // Create the user profile immediately
    const profileData = { name, university, email, allow_video_usage, meta, signup_data };
    const { error: profileError } = await supabaseService.createUserDatabaseRecord(userId, profileData);
    
    if (profileError) {
      console.error('Failed to create profile, but user was created:', profileError);
      
      // Check if this is a duplicate email error
      // PostgreSQL error code for unique constraint violation is 23505
      const pgError = profileError as { code?: string; message?: string };
      if (pgError.code === '23505' && pgError.message?.includes('users_email_key')) {
        // Delete the auth user since we couldn't create the profile due to duplicate email
        if (supabaseService.serviceClient) {
          try {
            await supabaseService.serviceClient.auth.admin.deleteUser(userId);
            console.log('Deleted auth user due to duplicate email:', userId);
          } catch (deleteError) {
            console.error('Failed to delete auth user after profile creation failure:', deleteError);
          }
        }
        
        res.status(400).json({ 
          success: false, 
          message: 'A user with this email already exists' 
        });
        return;
      }
      
      // For other errors, we'll return a success with a warning
      console.warn('Non-critical error creating user profile:', profileError);
    }
    
    // Return the success response with user data but no session
    // The user needs to confirm their email before logging in
    res.status(201).json({
      success: true,
      message: 'User created successfully. Please check your email to confirm your account before logging in.',
      data: {
        user: data.user
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Get the MFA status for the current user
 */
export const getMfaStatus: RequestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    // Debug logging for Safari authentication issues
    console.log('getMfaStatus - Debug info:', {
      hasUser: !!(req as any).user,
      userId: userId,
      userAgent: req.headers['user-agent'],
      hasCookieToken: !!req.cookies[DSP_ACCESS_TOKEN_NAME],
      hasAuthHeader: !!req.headers.authorization,
      authHeaderStart: req.headers.authorization?.substring(0, 20)
    });
    
    if (!userId) {
      console.log('getMfaStatus - No user ID found, authentication failed');
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }
    
    // Use service client with fallback to regular client (for RLS)
    const client = supabaseService.serviceClient || supabaseService.client;
    const { data, error } = await client.auth.admin.getUserById(userId);
    
    if (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }
    
    // Debug: log the user object returned from Supabase
    //console.log('Supabase user data for MFA status:', data.user);
    const factors: Factor[] = Array.isArray(data.user?.factors) ? data.user.factors : [];
    const hasMfaEnabled = factors.some((f) => f.status === 'verified');
    
    // Filter to only return verified factors
    const verifiedFactors = factors.filter(f => f.status === 'verified').map(f => ({
      id: f.id,
      type: f.factor_type
    }));

    res.status(200).json({
      success: true,
      data: {
        mfaEnabled: hasMfaEnabled,
        factors: verifiedFactors
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

export const enrollMfa: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get access token from cookie or Authorization header
    const accessToken = req.cookies[DSP_ACCESS_TOKEN_NAME] || req.headers['authorization']?.split(' ')[1];
    if (!accessToken) {
      res.status(401).json({ success: false, message: 'Auth session missing!' });
      return;
    }
    const supabaseUrl = config.supabase.url;
    const supabaseAnonKey = config.supabase.key;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });

    // Clean up any unverified factors before enrolling a new one
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      res.status(400).json({ success: false, message: userError.message });
      return;
    }
    const factors: Factor[] = Array.isArray(userData.user?.factors) ? userData.user.factors : [];
    for (const factor of factors) {
      if (factor.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    // Now enroll a new factor
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        factorId: data.id,
        qrCode: data.totp.qr_code
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ success: false, message: errorMessage });
  }
};

/**
 * Verify and complete MFA (2FA) enrollment
 */
export const verifyMfa: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { factorId, code } = req.body;
    
    if (!factorId || !code) {
      res.status(400).json({
        success: false,
        message: 'Factor ID and verification code are required'
      });
      return;
    }
    
    // Verify the OTP code to complete enrollment
    const { data, error } = await supabaseService.client.auth.mfa.challengeAndVerify({
      factorId,
      code
    });
    
    if (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Disable MFA (2FA) for the current user
 */
export const disableMfa: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { factorId } = req.body;
    
    if (!factorId) {
      res.status(400).json({
        success: false,
        message: 'Factor ID is required'
      });
      return;
    }
    
    // Unenroll the MFA factor
    const { error } = await supabaseService.client.auth.mfa.unenroll({
      factorId
    });
    
    if (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Request a password reset email
 */
export const resetPassword: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required'
      });
      return;
    }
    
    // Use the service client if available to bypass RLS
    const client = supabaseService.serviceClient || supabaseService.client;
    
    // Check if user exists before sending reset email
    const { data: userData, error: userError } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    
    if (userError) {
      console.error('Error checking user existence:', userError.message);
      res.status(400).json({
        success: false,
        message: 'Invalid request format',
        error: userError.message
      });
      return;
    }
    
    if (!userData) {
      // Return success even if user doesn't exist for security reasons
      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
      return;
    }
    
    // Send password reset email
    const { error } = await supabaseService.resetPassword(email);
    
    if (error) {
      console.error('Error sending password reset:', error.message);
      
      // Determine appropriate status code based on error type
      const statusCode = error.message.includes('rate limit') ? 429 : 
                         error.message.includes('invalid') ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: 'Failed to send password reset email',
        error: error.message
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Exception in resetPassword controller:', errorMessage);
    
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while processing your request',
      error: errorMessage
    });
  }
};

/**
 * Update password after reset
 */
export const updatePasswordAfterReset: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { password, hash } = req.body;
    
    if (!password) {
      res.status(400).json({
        success: false,
        message: 'New password is required'
      });
      return;
    }
    
    if (!hash) {
      res.status(400).json({
        success: false,
        message: 'Reset token is required'
      });
      return;
    }
    
    // Extract the access token from the hash
    const hashParams = new URLSearchParams(hash.replace('#', ''));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');
    
    if (!accessToken || type !== 'recovery') {
      res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
      return;
    }
    
    try {
      // Create a new Supabase client with the provided token
      const supabase = createClient(
        config.supabase.url,
        config.supabase.key,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );
      
      // Set the session explicitly
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || ''
      });
      
      if (sessionError) {
        console.error('Error setting session:', sessionError.message);
        res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
        return;
      }
      
      // Get the user to check if MFA is enabled
      const { data: userData } = await supabase.auth.getUser();
      
      // Try to update the password normally first
      const { error } = await supabase.auth.updateUser({
        password
      });
      
      // If we get an AAL2 error, use the admin API to bypass MFA
      if (error && error.message.includes('AAL2 session is required')) {
        console.log('MFA is enabled, using admin API to update password');
        
        // Use the service client if available to bypass RLS
        const adminClient = supabaseService.serviceClient;
        
        if (!adminClient) {
          console.error('Admin client not available, check SUPABASE_SERVICE_KEY in environment');
          res.status(500).json({
            success: false,
            message: 'Admin client not available'
          });
          return;
        }
        
        console.log('Admin client available, proceeding with admin API');
        
        // Make sure we have a valid user ID
        if (!userData?.user?.id) {
          console.error('User ID not found in userData:', userData);
          res.status(400).json({
            success: false,
            message: 'Unable to retrieve user information'
          });
          return;
        }
        
        console.log('Using admin API to update password for user ID:', userData.user.id);
        
        try {
          // Use the admin API to update the password
          const { data: adminData, error: adminError } = await adminClient.auth.admin.updateUserById(
            userData.user.id,
            { password }
          );
          
          if (adminError) {
            console.error('Error updating password with admin API:', adminError.message);
            res.status(400).json({
              success: false,
              message: adminError.message
            });
            return;
          }
          
          console.log('Password updated successfully via admin API:', adminData);
          res.status(200).json({
            success: true,
            message: 'Password updated successfully'
          });
          return;
        } catch (adminApiError) {
          console.error('Exception in admin API call:', adminApiError);
          res.status(500).json({
            success: false,
            message: adminApiError instanceof Error ? adminApiError.message : 'Unexpected error in admin API'
          });
          return;
        }
      }
      
      if (error) {
        console.error('Error updating password:', error.message);
        res.status(400).json({
          success: false,
          message: error.message
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (sessionError) {
      console.error('Error with session:', sessionError);
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

// Challenge MFA (initiate verification)
export const challengeMfa: RequestHandler = async (req, res) => {
  try {
    const { factorId, accessToken: bodyAccessToken } = req.body;
    const rawAuthHeader = req.headers['authorization'];
    const headerAccessToken = rawAuthHeader && rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.split(' ')[1] : undefined;
    const cookieAccessToken = req.cookies[DSP_ACCESS_TOKEN_NAME];
    
    // Use token from: 1. Authorization header, 2. Cookie, 3. Request body
    const accessToken = headerAccessToken || cookieAccessToken || bodyAccessToken;
    
    console.log('MFA challenge: Token sources:', { 
      headerToken: !!headerAccessToken, 
      cookieToken: !!cookieAccessToken, 
      bodyToken: !!bodyAccessToken,
      finalToken: !!accessToken
    });
    
    const supabaseUrl = config.supabase.url;
    const supabaseAnonKey = config.supabase.key;
    
    if (!accessToken) {
      console.error('Error in MFA challenge: Missing access token');
      res.status(400).json({ 
        success: false, 
        message: 'Missing access token',
        debug: { 
          hasHeader: !!rawAuthHeader,
          hasCookie: !!cookieAccessToken,
          hasBodyToken: !!bodyAccessToken
        }
      });
      return;
    }
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Error in MFA challenge: Missing Supabase credentials');
      res.status(500).json({ success: false, message: 'Server configuration error' });
      return;
    }
    
    // Create Supabase client with the token in the authorization header
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    
    // Verify the token is valid by getting the user
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Error getting user by token:', userError.message);
      res.status(401).json({ success: false, message: 'Invalid access token' });
      return;
    }
    
    console.log('MFA challenge: User verified, proceeding with challenge');
    
    // Initiate the MFA challenge
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    
    if (error) {
      console.error('Error in MFA challenge:', error.message);
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    
    console.log('MFA challenge created successfully');
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Exception in MFA challenge:', error);
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unexpected error' 
    });
  }
};

// Verify MFA (complete verification)
export const verifyMfaChallenge: RequestHandler = async (req, res) => {
  try {
    const { factorId, challengeId, code, accessToken: bodyAccessToken } = req.body;
    const rawAuthHeader = req.headers['authorization'];
    const headerAccessToken = rawAuthHeader && rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.split(' ')[1] : undefined;
    const cookieAccessToken = req.cookies[DSP_ACCESS_TOKEN_NAME];
    
    // Use token from: 1. Authorization header, 2. Cookie, 3. Request body
    const accessToken = headerAccessToken || cookieAccessToken || bodyAccessToken;
    
    console.log('Verify endpoint - Token sources:', { 
      headerToken: !!headerAccessToken, 
      cookieToken: !!cookieAccessToken, 
      bodyToken: !!bodyAccessToken
    });
    
    const supabaseUrl = config.supabase.url;
    const supabaseAnonKey = config.supabase.key;
    
    if (!accessToken) {
      console.error('Verify endpoint - Missing access token');
      res.status(400).json({ success: false, message: 'Missing access token' });
      return;
    }
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Verify endpoint - Missing Supabase credentials');
      res.status(500).json({ success: false, message: 'Server configuration error' });
      return;
    }
    
    // Create Supabase client with the token in the authorization header
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    
    // Verify the MFA code
    const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    
    if (error) {
      console.error('Error in MFA verification:', error.message);
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    
    // Set session cookies after successful MFA verification
    if (data && data.access_token) {
      res.cookie(DSP_ACCESS_TOKEN_NAME, data.access_token, ACCESS_TOKEN_COOKIE_OPTIONS);
      if (data.refresh_token) {
        res.cookie(DSP_REFRESH_TOKEN_NAME, data.refresh_token, REFRESH_TOKEN_COOKIE_OPTIONS);
      }
    }
    
    console.log('MFA verification successful');
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Exception in MFA verification:', error);
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unexpected error' 
    });
  }
};

/**
 * Request email address change using Supabase's built-in confirmation flow
 */
export const updateEmail: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { newEmail } = req.body;
    
    if (!newEmail) {
      res.status(400).json({ 
        success: false, 
        message: 'New email is required' 
      });
      return;
    }

    // Get user from session
    const accessToken = req.cookies[DSP_ACCESS_TOKEN_NAME];
    if (!accessToken) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Get user from token
    const { data: userData, error: userError } = await supabaseService.getUserByToken(accessToken);
    if (userError || !userData || !userData.user) {
      res.status(401).json({
        success: false,
        message: userError?.message || 'Invalid authentication token'
      });
      return;
    }

    const userId = userData.user.id;

    // Initiate the email change with redirect to dashboard
    const redirectUrl = `${config.clientUrl}/dashboard`;
    const { data, error } = await supabaseService.requestEmailChangeWithConfirmation(accessToken, newEmail, redirectUrl);
    
    if (error) {
      const statusCode = error.message.includes('already in use') ? 400 : 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Email change confirmation sent. Please check your new email address to confirm the change.',
      data: {
        email: newEmail
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Complete email change process
 */
export const completeEmailChange: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { userId, token } = req.body;
    
    if (!userId || !token) {
      res.status(400).json({ 
        success: false, 
        message: 'User ID and token are required' 
      });
      return;
    }

    // Complete the email change
    const { data, error } = await supabaseService.completeEmailChange(userId, token);
    
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
      message: 'Email change completed successfully',
      data
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Sync user's email in the database with the email in auth
 */
export const syncEmailChange: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get user from session - check cookies first, then Authorization header
    let accessToken = req.cookies[DSP_ACCESS_TOKEN_NAME];
    
    // If no cookie token, check Authorization header (for Safari/token-based auth)
    if (!accessToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix
      }
    }
    
    if (!accessToken) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Get user from token
    const { data: userData, error: userError } = await supabaseService.getUserByToken(accessToken);
    if (userError || !userData || !userData.user) {
      res.status(401).json({
        success: false,
        message: userError?.message || 'Invalid authentication token'
      });
      return;
    }

    const userId = userData.user.id;

    // Sync email in database
    const { data, error } = await supabaseService.syncEmailInDatabase(userId);
    
    if (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Return result
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Check if user's email in auth matches the email in the users table
 */
export const checkEmailChange: RequestHandler = async (req: Request, res: Response) => {
  try {
    // Get user from session - check cookies first, then Authorization header
    let accessToken = req.cookies[DSP_ACCESS_TOKEN_NAME];
    
    // If no cookie token, check Authorization header (for Safari/token-based auth)
    if (!accessToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix
      }
    }
    
    if (!accessToken) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Get user from token
    const { data: userData, error: userError } = await supabaseService.getUserByToken(accessToken);
    if (userError || !userData || !userData.user) {
      res.status(401).json({
        success: false,
        message: userError?.message || 'Invalid authentication token'
      });
      return;
    }

    const userId = userData.user.id;

    // Check if email needs to be synced
    const { data, error } = await supabaseService.checkEmailSync(userId);
    
    if (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
      return;
    }
    
    // Return result
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

/**
 * Resend verification email to a user
 */
export const resendVerificationEmail: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
      return;
    }
    
    // Resend verification email
    const { data, error } = await supabaseService.resendVerificationEmail(email);
    
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
      message: 'Verification email has been resent. Please check your inbox.',
      data
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

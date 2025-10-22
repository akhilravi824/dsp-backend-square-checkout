import { Request, Response, NextFunction } from 'express';
import supabaseService from '../services/supabase.service';
import { User } from '@supabase/supabase-js';
import { 
  DSP_ACCESS_TOKEN_NAME, 
  DSP_REFRESH_TOKEN_NAME,
  ACCESS_TOKEN_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE_OPTIONS
} from '../constants/auth.constants';

const DEBUG = process.env.NODE_ENV === 'development';

// Define a type that includes user property
interface AuthenticatedRequest extends Request {
  user?: User;
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check for token in cookies first, then Authorization header (for Safari/token-based auth)
    let token = req.cookies[DSP_ACCESS_TOKEN_NAME];
    const refreshToken = req.cookies[DSP_REFRESH_TOKEN_NAME];
    
    // If no cookie token, check Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove 'Bearer ' prefix
        if (DEBUG) console.log('Auth middleware - Token found in Authorization header');
      }
    }
    
    if (DEBUG) console.log('Auth middleware - Token present:', !!token, token ? `(${token.substring(0, 20)}...)` : '');

    if (!token) {
      if (!refreshToken) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      if (DEBUG) console.log('Auth middleware - Attempting to refresh session with refresh token');
      const { data: refreshData, error: refreshError } = await supabaseService.refreshSession(refreshToken);

      if (refreshError || !refreshData) {
        console.error('Auth middleware - Token refresh failed:', refreshError?.message || 'No session refreshed');
        res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token'
        });
        return;
      }

      const { accessToken, refreshToken: newRefreshToken } = refreshData;
      res.cookie(DSP_ACCESS_TOKEN_NAME, accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
      res.cookie(DSP_REFRESH_TOKEN_NAME, newRefreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

      const { data, error } = await supabaseService.getUserByToken(accessToken);
      
      if (error || !data || !data.user) {
        console.error('Auth middleware - Refreshed token validation failed:', error?.message || 'No user found');
        res.status(401).json({
          success: false,
          message: 'Invalid refreshed token'
        });
        return;
      }

      if (DEBUG) console.log('Auth middleware - Session refreshed successfully for user:', data.user.email);
      (req as AuthenticatedRequest).user = data.user;
      next();
      return;
    }
    
    if (DEBUG) console.log('Auth middleware - Token extracted:', token ? `${token.substring(0, 10)}...` : 'No token');
    
    const { data, error } = await supabaseService.getUserByToken(token);

    if (error || !data || !data.user) {
      if (refreshToken) {
        if (DEBUG) console.log('Auth middleware - Access token invalid, attempting refresh flow');
        req.cookies[DSP_ACCESS_TOKEN_NAME] = '';
        return authenticate(req, res, next);
      }
      
      console.error('Auth middleware - Token validation failed:', error?.message || 'No user found');
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
      return;
    }

    if (DEBUG) console.log('Auth middleware - User authenticated:', data.user.email);
    (req as AuthenticatedRequest).user = data.user;
    next();
  } catch (error) {
    console.error('Auth middleware - Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

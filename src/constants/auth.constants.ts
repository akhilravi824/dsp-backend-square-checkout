/**
 * Authentication constants for Dawn Sign Press
 * Contains cookie names and configuration options
 */
import config from '../config/config';
import { getDomainFromUrl } from '../utils/url.utils';

// Cookie names for authentication tokens
export const DSP_ACCESS_TOKEN_NAME = 'dsp_access_token';
export const DSP_REFRESH_TOKEN_NAME = 'dsp_refresh_token';

// Get base domain for cookies
const getCookieDomain = () => {
  // For local development, don't set domain (improves compatibility)
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }
  
  // For production, use the base domain from client URL
  // If the frontend is hosted on Vercel or another service with a different domain,
  // we need to ensure cookies work across domains
  return getDomainFromUrl(config.clientUrl);
};

// Cookie options for access token (short-lived)
export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // Always use secure cookies for authentication
  sameSite: 'none' as 'none', // 'none' is required for cross-origin requests in production
  maxAge: 60 * 60 * 1000, // 1 hour
  path: '/',
  domain: getCookieDomain(),
  signed: false,
};

// Cookie options for refresh token (long-lived)
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // Always use secure cookies for authentication
  sameSite: 'none' as 'none', // 'none' is required for cross-origin requests in production
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
  domain: getCookieDomain(),
  signed: false,
};


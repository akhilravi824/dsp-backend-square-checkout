import axios from 'axios';
import { payments } from '@square/web-sdk';
import { gsap } from 'gsap'; // Import GSAP
import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

// Use environment variable for API URL if available, otherwise use relative path
// const API_URL = ''; // Temporarily using local API to test the fix
const API_URL = 'https://dsp-api-git-dev-hello-monday.vercel.app/api';//https://dsp-api-git-cookies-hello-monday.vercel.app/api'; // Production URL

// Detect Safari for CORS handling
const isSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent;
  return /Safari/.test(userAgent) && /Version\/[\d\.]+.*Safari/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent);
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  // For Safari cross-origin, we'll rely on token-based auth instead of cookies
  withCredentials: !isSafari() || API_URL.includes('localhost')
});

// For Safari cross-origin requests, we need to handle refresh tokens differently
const isSafariCrossOrigin = isSafari() && !API_URL.includes('localhost');

// Add request interceptor to include token in all requests
api.interceptors.request.use(
  config => {
    // For Safari or incognito mode, always use the freshest token from localStorage
    if (browser) {
      const token = localStorage.getItem('token');
      console.log('Request interceptor - Safari detected:', isSafari());
      console.log('Request interceptor - Token available:', !!token);
      console.log('Request interceptor - URL:', config.url);
      if (token) {
        // Always use the freshest token to avoid race conditions during refresh
        config.headers.Authorization = `Bearer ${token}`;
        console.log('Request interceptor - Added Authorization header');
      } else {
        console.log('Request interceptor - No token found in localStorage');
      }
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle token refresh
api.interceptors.response.use(
  response => {
    // Handle Safari auth responses and fallback auth
    // Try both nested structures: response.data.data.safariAuth and response.data.safariAuth
    const authData = response.data?.data?.safariAuth || response.data?.data?.fallbackAuth || 
                     response.data?.safariAuth || response.data?.fallbackAuth;
    
    if (browser && authData) {
      console.log('Response interceptor - Auth data found:', authData);
      console.log('Full auth data keys:', Object.keys(authData));
      console.log('Auth data accessToken:', authData.accessToken);
      console.log('Auth data refreshToken:', authData.refreshToken);
      
      // Check if this is a logout response (clearTokens: true)
      if (authData.clearTokens) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        console.log('Cleared tokens from localStorage (logout)');
      } else {
        // Update tokens if they're provided in the response (for login/refresh)
        const { accessToken, refreshToken } = authData;
        console.log('Response interceptor - Tokens:', { accessToken: !!accessToken, refreshToken: !!refreshToken });
        
        if (accessToken) {
          localStorage.setItem('token', accessToken);
          console.log('Response interceptor - Updated access token in localStorage');
        }
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
          console.log('Response interceptor - Updated refresh token in localStorage');
        } else {
          console.log('Response interceptor - No refresh token provided');
        }
      }
    } else if (browser) {
      console.log('Response interceptor - No auth data found in response');
    }
    return response;
  },
  async error => {
    const originalRequest = error.config;
    
    // Debug logging
    console.log('API Error:', error.response?.status, error.message);
    console.log('Error URL:', originalRequest?.url);
    
    // If we get a 401 and haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry && browser) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          console.log('Token expired, attempting refresh...');
          console.log('Using refresh token:', refreshToken);
          console.log('Safari cross-origin:', isSafariCrossOrigin);
          
          // Try to refresh the token using the verify endpoint
          // For Safari cross-origin, don't use withCredentials and pass refresh token as query parameter
          const refreshResponse = await axios.get(`${API_URL}/auth/verify?refresh_token=${refreshToken}`, {
            withCredentials: !isSafariCrossOrigin
          });
          
          console.log('Refresh response:', refreshResponse.data);
          
          // Extract new tokens from the refresh response
          const authData = refreshResponse.data.safariAuth || refreshResponse.data.fallbackAuth || refreshResponse.data.session;
          const newAccessToken = authData?.accessToken;
          const newRefreshToken = authData?.refreshToken;
          
          console.log('Extracted tokens from refresh:', {
            newAccessToken: !!newAccessToken,
            newRefreshToken: !!newRefreshToken
          });
          
          if (!newAccessToken) {
            console.log('No new access token received, redirecting to login');
            window.location.href = '/auth';
            return Promise.reject(error);
          }
          
          // Update tokens in localStorage
          localStorage.setItem('token', newAccessToken);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }
          
          console.log('Token refresh successful, retrying original request with new token');
          console.log('Safari detected:', isSafari());
          console.log('Original request URL:', originalRequest.url);
          console.log('New token (first 20 chars):', newAccessToken.substring(0, 20) + '...');
          
          // Ensure headers object exists
          if (!originalRequest.headers) {
            originalRequest.headers = {};
          }
          
          // Retry the original request with the new token DIRECTLY (don't rely on localStorage timing)
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          
          console.log('Retry request headers:', originalRequest.headers);
          
          return axios(originalRequest);
        } catch (refreshError: any) {
          console.log('Token refresh failed:', refreshError);
          console.log('Refresh error response:', refreshError.response?.data);
          console.log('Refresh error status:', refreshError.response?.status);
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          
          // Don't force redirect here - let the app handle it
          console.log('User needs to re-authenticate');
        }
      } else {
        console.log('No refresh token available, redirecting to login');
        // No refresh token available
        console.log('User needs to re-authenticate');
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (email: string, password: string) => 
    api.post('/auth/register', { email, password }),
  
  login: (email: string, password: string) => 
    api.post('/auth/login', { email, password }),
  
  loginMfa: (factorId: string, challengeId: string, code: string, accessToken: string) =>
    api.post('/auth/mfa/verify', { factorId, challengeId, code, accessToken }, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }),
  
  logout: () => api.post('/auth/logout'),
  
  // Use signup endpoint instead of createProfile
  signup: (profileData: { 
    name: string; 
    university?: string;
    email: string; 
    password: string; 
    consent: boolean; 
    allow_video_usage?: boolean;
    meta?: any 
  }) => api.post('/auth/signup', profileData),

  verifyAuth: () => api.get('/auth/verify'),
  
  // MFA methods
  getUserMfaStatus: () => api.get('/auth/mfa/status'),
  enrollMfa: () => api.post('/auth/mfa/enroll'),
  challengeMfa: (factorId: string, accessToken: string) =>
    api.post('/auth/mfa/challenge', { factorId, accessToken }, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }),
  verifyMfaChallenge: (factorId: string, challengeId: string, code: string) => api.post('/auth/mfa/verify', { factorId, challengeId, code }),
  verifyMfa: (factorId: string, code: string) => 
    api.post('/auth/mfa/verify', { factorId, code }),
  disableMfa: (factorId: string) => 
    api.post('/auth/mfa/disable', { factorId }),
    
  resetPassword: (email: string) =>
    api.post('/auth/reset-password', { email }),
    
  updatePasswordAfterReset: (password: string, hash: string) =>
    api.post('/auth/update-password', { password, hash }),
    
  updateEmail: (newEmail: string) =>
    api.post('/auth/update-email', { newEmail }),
    
  checkEmailChange: () =>
    api.get('/auth/check-email-change'),
    
  syncEmailChange: () =>
    api.post('/auth/sync-email-change'),
  
  completeEmailChange: (userId: string, token: string) =>
    api.post('/auth/complete-email-change', { userId, token }),
};

// Profile API
export const profileApi = {
  // This method is deprecated - use authApi.signup instead
  createProfile: (profileData: { 
    name: string; 
    email: string; 
    password: string; 
    consent: boolean 
  }) => authApi.signup(profileData),
  
  getProfile: () => {
    // Cookie will be automatically sent with the request
    return api.get('/profiles');
  },
  
  updateNotificationPreferences: (preferences: { 
    tipsAndGuidance: boolean; 
    productUpdates: boolean 
  }) => {
    return api.post('/profiles/notifications', preferences);
  },
  
  addToMailchimp: (contactData: {
    email: string;
    name?: string;
    tipsAndGuidance?: boolean;
    productUpdates?: boolean;
  }) => {
    return api.post('/profiles/mailchimp/contacts', contactData);
  },
  
  addCurrentUserToMailchimp: () => {
    return api.post('/profiles/mailchimp/current-user');
  },
  
  updateName: (name: string) => {
    return api.post('/profiles/name', { name });
  },
  
  updateUniversity: (university: string) => {
    return api.post('/profiles/university', { university });
  }
};

// Payment Method API
export const paymentMethodApi = {
  addPaymentMethod: (userId: string, paymentMethodData: {
    paymentMethodId: string;
    type: string;
    lastFour?: string;
    expiryMonth?: number;
    expiryYear?: number;
  }) => api.post('/payment-methods/add', { 
    userId,
    ...paymentMethodData
  }),
  
  getUserPaymentMethods: (userId: string) => 
    api.get(`/payment-methods/${userId}`),
};

// Payment API
export const paymentApi = {
  createPayment: (sourceId: string, amount: number, currency = 'USD') =>
    api.post('/payments/create', { sourceId, amount, currency }),
  
  getLocations: () =>
    api.get('/payments/locations'),
  
  listPayments: () =>
    api.get('/payments'),
};

// Square Web Payments API
export const squarePaymentApi = {
  // Initialize Square Web Payments SDK
  initializePayments: (applicationId: string, locationId: string) => {
    if (!browser) return null;
    
    try {
      return payments(applicationId, locationId);
    } catch (error) {
      console.error('Error initializing Square Web Payments SDK:', error);
      throw error;
    }
  },
  
  // Create a card payment method
  createCardPaymentMethod: async (paymentsInstance: any) => {
    if (!paymentsInstance) {
      throw new Error('Payments instance not initialized');
    }
    
    try {
      // Create a card payment method using the latest Square Web SDK approach
      const card = await paymentsInstance.card();
      
      // Check if card is properly initialized
      if (!card) {
        throw new Error('Failed to initialize Square card payment method');
      }
      
      // Attach the card to the DOM element - this is an async operation in the latest SDK
      await card.attach('#card-container');
      
      return card;
    } catch (error) {
      console.error('Error creating card payment method:', error);
      throw error;
    }
  },
  
  // Check if Apple Pay is supported in the current browser
  isApplePaySupported: async (paymentsInstance: any) => {
    if (!paymentsInstance) {
      throw new Error('Payments instance not initialized');
    }
    
    try {
      // Apple Pay cannot be tested on localhost or without HTTPS
      // Per Square documentation: "Apple Pay payments cannot be tested with HTTP or from localhost"
      if (window.location.protocol !== 'https:' || 
          window.location.hostname === 'localhost' || 
          window.location.hostname.includes('127.0.0.1')) {
        console.log('Apple Pay is disabled: requires HTTPS and cannot be used on localhost');
        return false;
      }
      
      // Check if we're in Safari (required for Apple Pay)
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (!isSafari) {
        console.log('Apple Pay is disabled: requires Safari browser');
        return false;
      }
      
      // For production environments with registered domains
      // We'll attempt to initialize Apple Pay
      const paymentRequest = {
        countryCode: 'US',
        currencyCode: 'USD',
        total: {
          amount: '1.00',
          label: 'Total'
        }
      };
      
      // Just try to initialize Apple Pay - if it fails, we'll catch the error
      paymentsInstance.applePay(paymentRequest);
      return true;
    } catch (error: any) {
      console.error('Apple Pay not supported:', error);
      return false;
    }
  },
  
  // Create Apple Pay payment method
  createApplePayMethod: async (paymentsInstance: any, options: {
    total: {
      amount: string,
      label: string
    },
    countryCode?: string,
    currencyCode?: string,
    lineItems?: Array<{
      amount: string,
      label: string
    }>
  }) => {
    if (!paymentsInstance) {
      throw new Error('Payments instance not initialized');
    }
    
    try {
      // Create payment request for Apple Pay
      const paymentRequest = {
        countryCode: options.countryCode || 'US',
        currencyCode: options.currencyCode || 'USD',
        total: options.total,
        lineItems: options.lineItems || []
      };
      
      // Initialize Apple Pay with the payment request
      const applePay = paymentsInstance.applePay(paymentRequest);
      
      // Check if Apple Pay is properly initialized
      if (!applePay) {
        throw new Error('Failed to initialize Apple Pay');
      }
      
      // Check if the device supports Apple Pay
      try {
        const canMakePayment = await applePay.canMakePayment();
        if (!canMakePayment) {
          throw new Error('This device does not support Apple Pay');
        }
      } catch (paymentError: any) {
        // Handle domain registration error specifically
        if (paymentError.name === 'PaymentMethodUnsupportedError' && 
            paymentError.message && 
            paymentError.message.includes('domain is not registered')) {
          throw new Error('This website is not registered for Apple Pay. Please contact support.');
        }
        throw paymentError;
      }
      
      return applePay;
    } catch (error) {
      console.error('Error creating Apple Pay payment method:', error);
      throw error;
    }
  },
  
  // Process Apple Pay payment
  processApplePayment: async (applePay: any) => {
    try {
      // Start the Apple Pay payment flow
      const result = await applePay.begin();
      
      // Check if the payment was successful
      if (result.status === 'OK') {
        // Return the token for backend processing
        return {
          status: 'OK',
          token: result.token
        };
      } else {
        throw new Error(result.errors || 'Apple Pay payment failed');
      }
    } catch (error) {
      console.error('Error processing Apple Pay payment:', error);
      throw error;
    }
  },
  
  // Process payment with Square
  processPayment: async (card: any, options: {
    amount: string,
    currencyCode: string,
    customerId?: string,
    verificationToken?: string
  }) => {
    try {
      // Tokenize the card
      const tokenResult = await card.tokenize();
      
      if (tokenResult.status === 'OK') {
        // Create payment with the token
        return api.post('/payments/create', {
          sourceId: tokenResult.token,
          amount: options.amount,
          currency: options.currencyCode,
          customerId: options.customerId,
          verificationToken: options.verificationToken
        });
      } else {
        throw new Error(tokenResult.errors[0].message);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      throw error;
    }
  },
  
  // Create Google Pay payment method
  createGooglePayMethod: (paymentsInstance: any, options: {
    merchantId: string,
    buttonOptions?: {
      buttonColor?: string,
      buttonType?: string,
      buttonSizeMode?: string
    }
  }) => {
    if (!paymentsInstance) {
      throw new Error('Payments instance not initialized');
    }
    
    try {
      const googlePay = paymentsInstance.googlePay(options);
      return googlePay;
    } catch (error) {
      console.error('Error creating Google Pay payment method:', error);
      throw error;
    }
  },
  
  // Create Apple Pay payment method
  createApplePayMethodOld: (paymentsInstance: any, options: {
    merchantId: string,
    buttonOptions?: {
      buttonColor?: string,
      buttonType?: string,
      buttonSizeMode?: string
    }
  }) => {
    if (!paymentsInstance) {
      throw new Error('Payments instance not initialized');
    }
    
    try {
      const applePay = paymentsInstance.applePay(options);
      return applePay;
    } catch (error) {
      console.error('Error creating Apple Pay payment method:', error);
      throw error;
    }
  },
  
  // Tokenize digital wallet payment
  tokenizeDigitalWalletPayment: async (digitalWallet: any, paymentRequest: any) => {
    try {
      const tokenResult = await digitalWallet.tokenize(paymentRequest);
      if (tokenResult.status === 'OK') {
        return api.post('/payments/create', {
          sourceId: tokenResult.token,
          amount: paymentRequest.total.amount,
          currency: paymentRequest.currencyCode
        });
      } else {
        throw new Error(tokenResult.errors);
      }
    } catch (error) {
      console.error('Processing digital wallet payment failed:', error);
      throw error;
    }
  },
  
  // Create payment request for digital wallets
  createPaymentRequest: (options: {
    countryCode: string,
    currencyCode: string,
    total: {
      amount: string,
      label: string
    },
    lineItems?: Array<{
      amount: string,
      label: string
    }>,
    requestShippingContact?: boolean,
    requestBillingContact?: boolean
  }) => {
    return options;
  },
  
  // Verify buyer for SCA requirements
  verifyBuyer: async (paymentsInstance: any, options: {
    token: string,
    amount: string,
    currencyCode: string,
    intent: string,
    billingContact?: {
      addressLines?: string[],
      familyName?: string,
      givenName?: string,
      countryCode?: string,
      city?: string,
      postalCode?: string,
      phone?: string,
      email?: string
    }
  }) => {
    try {
      const verificationResult = await paymentsInstance.verifyBuyer(
        options.token,
        {
          amount: options.amount,
          currencyCode: options.currencyCode,
          intent: options.intent,
          billingContact: options.billingContact
        }
      );
      
      return verificationResult;
    } catch (error) {
      console.error('Buyer verification failed:', error);
      throw error;
    }
  }
};

// Square Catalog API
export const catalogApi = {
  getSubscriptions: () => {
    // Cookie will be automatically sent with the request
    return api.get('/catalog/subscriptions');
  }
};

// Subscription API
export const subscriptionApi = {
  getSubscriptionPlans: () => {
    return api.get('/subscriptions/plans');
  },
  
  getUserSubscriptions: () => {
    return api.get('/subscriptions');
  },
  
  createSubscription: (planId: string, sourceId: string, userId: string, variationId?: string) => {
    return api.post('/subscriptions', { planId, sourceId, userId, variationId });
  },  

  cancelSubscription: (subscriptionId: string) => {
    return api.delete(`/subscriptions/${subscriptionId}`);
  },
  
  getUserInvoices: () => {
    return api.get('/subscriptions/invoices');
  },
  
  swapPlan: (subscriptionId: string, newPlanVariationId: string, squareCustomerId: string) => {
    return api.patch(`/subscriptions/${subscriptionId}/swap-plan`, { newPlanVariationId, squareCustomerId })
      .catch(error => {
        // Return the error response data so we can display the error message
        if (error.response && error.response.data) {
          return { data: error.response.data };
        }
        throw error;
      });
  },
  
  getPaymentMethod: (customerId: string) => {
    return api.get(`/subscriptions/payment-method/${customerId}`);
  },
  
  updatePaymentMethod: (subscriptionId: string, sourceId: string) => {
    return api.patch(`/subscriptions/${subscriptionId}/payment-method`, { sourceId });
  },
  
  getSquareLocationId: () => {
    return api.get('/payments/locations');
  }
};

// Progress API
export const progressApi = {
  /**
   * Get user progress data
   * @returns Promise with user progress data
   */
  getUserProgress: () => {
    return api.get('/progress');
  },
  
  /**
   * Update user progress
   * @param progressData Progress data to update
   * @returns Promise with update result
   */
  updateProgress: (progressData: {
    levelId: string;
    unitId: string;
    lessonId: string;
    attempt?: boolean;
    complete?: boolean;
    timeSpent?: number;
  }) => {
    return api.post('/progress/update', progressData);
  }
};

export default api;

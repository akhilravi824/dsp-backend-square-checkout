declare module '$lib/api' {
  // Auth API
  export const authApi: {
    register: (email: string, password: string) => Promise<any>;
    login: (email: string, password: string) => Promise<any>;
    loginMfa: (factorId: string, challengeId: string, code: string, accessToken: string) => Promise<any>;
    logout: () => Promise<any>;
    verifyAuth: () => Promise<any>;
    getUserMfaStatus: () => Promise<any>;
    enrollMfa: () => Promise<any>;
    challengeMfa: (factorId: string, accessToken: string) => Promise<any>;
    verifyMfaChallenge: (factorId: string, challengeId: string, code: string) => Promise<any>;
    verifyMfa: (factorId: string, code: string) => Promise<any>;
    disableMfa: (factorId: string) => Promise<any>;
    resetPassword: (email: string) => Promise<any>;
    updatePasswordAfterReset: (password: string, hash: string) => Promise<any>;
    updateEmail: (newEmail: string) => Promise<any>;
    checkEmailChange: () => Promise<any>;
    syncEmailChange: () => Promise<any>;
    checkAndSyncEmailChange: () => Promise<any>;
    completeEmailChange: (userId: string, token: string) => Promise<any>;
  };

  // Profile API
  export const profileApi: {
    createProfile: (profileData: { 
      name: string; 
      email: string; 
      password: string; 
      consent: boolean 
    }) => Promise<any>;
    getProfile: () => Promise<any>;
  };

  // Payment Method API
  export const paymentMethodApi: {
    addPaymentMethod: (userId: string, paymentMethodData: {
      paymentMethodId: string;
      type: string;
      lastFour?: string;
      expiryMonth?: number;
      expiryYear?: number;
    }) => Promise<any>;
    getUserPaymentMethods: (userId: string) => Promise<any>;
  };

  // Payment API
  export const paymentApi: {
    createPayment: (sourceId: string, amount: number, currency?: string) => Promise<any>;
    testPayment: () => Promise<any>;
    getLocations: () => Promise<any>;
    listPayments: () => Promise<any>;
  };

  // Square Web Payments API
  export const squarePaymentApi: {
    initializePayments: (applicationId: string, locationId: string) => Promise<any>;
    createCardPaymentMethod: (paymentsInstance: any, options?: any) => Promise<any>;
    processPayment: (card: any, options: {
      amount: string,
      currencyCode: string,
      customerId?: string,
      verificationToken?: string
    }) => Promise<any>;
    createGooglePayMethod: (paymentsInstance: any, options: any) => Promise<any>;
    createApplePayMethod: (paymentsInstance: any, options: any) => Promise<any>;
    createACHPayMethod: (paymentsInstance: any, options?: any) => Promise<any>;
    tokenizeDigitalWalletPayment: (digitalWallet: any, paymentRequest: any) => Promise<any>;
    createPaymentRequest: (options: any) => any;
    verifyBuyer: (paymentsInstance: any, options: any) => Promise<any>;
  };

  // Default export
  const api: any;
  export default api;
}

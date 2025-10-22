/**
 * URL utility functions for Dawn Sign Press
 */

/**
 * Extracts domain from a URL for cookie settings
 * @param url - The URL to extract domain from
 * @returns The domain or undefined for localhost/invalid URLs
 */
export const getDomainFromUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  
  try {
    const hostname = new URL(url).hostname;
    // For localhost, return undefined to ensure cookies work properly in development
    if (hostname === 'localhost') return undefined;
    return hostname;
  } catch (e) {
    console.warn('Invalid URL format, cannot extract domain:', e);
    return undefined;
  }
};

import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
  // Check if the request is for the Chrome DevTools file
  if (url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
    // Return empty JSON object with correct content type
    return new Response(JSON.stringify({}), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  
  // Return 404 for other requests
  return new Response('Not found', { status: 404 });
};

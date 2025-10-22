import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  // Return empty JSON object with correct content type
  return new Response(JSON.stringify({}), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

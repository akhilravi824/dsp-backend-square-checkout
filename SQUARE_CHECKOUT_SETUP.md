# Square Checkout Integration - Vercel Preview Setup

## Environment Variables Required

### Backend (Preview) Environment Variables

Add these to your Backend project → Settings → Environment Variables → Preview:

```
ALLOWED_ORIGINS=https://<FE-PREVIEW>.vercel.app
CLIENT_URL=https://<BE-PREVIEW>.vercel.app
SQUARE_ENVIRONMENT=sandbox
SQUARE_ACCESS_TOKEN=<sandbox_access_token>
SQUARE_PLAN_VARIATION_PRO_MONTHLY=<subscription_plan_variation_id>
SQUARE_PLAN_VARIATION_PRO_YEARLY=<subscription_plan_variation_id>
RETURN_URL_BASE=https://<FE-PREVIEW>.vercel.app
```

### Frontend (Preview) Environment Variables

Add these to your Frontend project → Settings → Environment Variables → Preview:

```
PUBLIC_API_URL=https://<BE-PREVIEW>.vercel.app
```

### Optional: Vercel Deployment Protection Bypass

If your backend preview has Deployment Protection enabled:

```
VERCEL_BYPASS_TOKEN=<protection_bypass_token>
```

## Square Dashboard Configuration

1. Set webhook URL to: `https://<BE-PREVIEW>.vercel.app/api/webhooks/square`
2. Ensure subscription plan variation IDs are correct
3. Test with sandbox environment

## Testing Flow

1. Open Frontend Preview URL
2. Click Subscribe → redirects to Square sandbox checkout
3. Complete sandbox payment → redirects to `/billing/return`
4. Page shows "Subscription active! 🎉" after webhook processes

## Troubleshooting

- **401/403 errors**: Check Deployment Protection bypass token
- **CORS errors**: Ensure calls go through `/api/proxy`
- **Return page timeout**: Check webhook configuration and logs

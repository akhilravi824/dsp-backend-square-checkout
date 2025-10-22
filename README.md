# Dawn Sign Press Backend

A Node.js TypeScript backend application for Dawn Sign Press that handles user authentication and subscription management using Square for payments and Supabase for authentication and database operations.

## Technologies

- **Node.js** - JavaScript runtime
- **TypeScript** - Type-safe JavaScript
- **Express** - Web framework
- **Supabase** - Authentication and database
- **Square** - Payment processing and subscription management
- **GSAP** - Animation library

## Project Structure

```
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Request handlers (auth, profile, subscription, webhook)
│   ├── middleware/     # Express middleware (authentication)
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── app.ts          # Express app setup
│   └── index.ts        # Entry point
├── frontend/           # Frontend application
├── .env                # Environment variables
├── .env.example        # Example environment variables
├── package.json        # Dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- Supabase account and project
- Square developer account

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

Copy the `.env.example` file to `.env` and update with your credentials:

```bash
cp .env.example .env
```

Update the following variables in the `.env` file:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon key
- `SQUARE_ACCESS_TOKEN`: Your Square access token
- `SQUARE_ENVIRONMENT`: Set to `sandbox` for testing or `production` for live
- `SQUARE_LOCATION_ID`: Your Square location ID for processing payments

### Development

Run the backend development server:

```bash
npm run dev
```

Run both frontend and backend development servers:

```bash
npm start
```

or

```bash
npm run dev:full
```

### Building for Production

Build the TypeScript code:

```bash
npm run build
```

Start the production server:

```bash
npm run start:prod
```

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login a user
- `POST /api/auth/logout` - Logout a user
- `GET /api/auth/verify` - Verify email/account

### Multi-Factor Authentication (MFA)

- `GET /api/auth/mfa/status` - Get MFA status for user
- `POST /api/auth/mfa/enroll` - Enroll in MFA
- `POST /api/auth/mfa/verify` - Verify MFA code
- `POST /api/auth/mfa/disable` - Disable MFA

### Subscription Management

- `GET /api/subscription/plans` - Get available subscription plans
- `GET /api/subscription/` - Get user subscriptions
- `POST /api/subscription/` - Create a new subscription
- `DELETE /api/subscription/:subscriptionId` - Cancel a subscription
- `PATCH /api/subscription/:subscriptionId/payment-method` - Update subscription payment method

### User Profile

- `GET /api/profile` - Get user profile
- `POST /api/profiles/notifications` - Update notification preferences
- `POST /api/profiles/mailchimp/contacts` - Add contact to Mailchimp
- `POST /api/profiles/mailchimp/current-user` - Add current user to Mailchimp

> Note: User creation is handled by the `/api/auth/signup` endpoint

### Webhooks

- `POST /api/webhook` - Handle webhooks from Square

## Setting Up Supabase

1. Create a new project on [Supabase](https://supabase.com)
2. Set up authentication with email and password
3. Create necessary tables for users, profiles, and subscription data
4. Configure email templates for verification and password reset
5. Copy the project URL and anon key to your `.env` file

## Setting Up Square

1. Create a developer account on [Square](https://developer.squareup.com/)
2. Create a new application
3. Configure webhook endpoints for subscription events
4. Generate an access token (use sandbox for testing)
5. Copy the access token and location ID to your `.env` file
6. Create subscription plans in the Square Dashboard

## Testing Webhooks

For local development, use ngrok to expose your local server:

```bash
npm run ngrok
```

Then use the generated URL as your webhook endpoint in Square Developer Dashboard.

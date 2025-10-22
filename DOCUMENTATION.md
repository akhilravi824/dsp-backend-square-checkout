# Dawn Sign Press Backend Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Configuration](#configuration)
4. [Core Services](#core-services)
   - [Supabase Service](#supabase-service)
   - [Square Service](#square-service)
   - [Mailchimp Service](#mailchimp-service)
   - [Progress Service](#progress-service)
5. [API Endpoints](#api-endpoints)
   - [Authentication](#authentication)
   - [Profile Management](#profile-management)
   - [Subscription Management](#subscription-management)
   - [Payment Processing](#payment-processing)
   - [User Progress](#user-progress)
   - [Webhooks](#webhooks)
   - [Video Content](#video-content)
6. [Security Considerations](#security-considerations)
7. [Development Guidelines](#development-guidelines)

## Introduction

Dawn Sign Press Backend is a TypeScript-based API server that powers the Dawn Sign Press application. It provides authentication, subscription management, user progress tracking, and integration with external services like Square for payments and Mailchimp for email marketing.

The backend serves as the central hub for all data operations, ensuring proper authentication, authorization, and data validation before performing any actions on the database or external services.

## System Architecture

The backend follows a modular architecture with clear separation of concerns:

- **Express.js Server**: Handles HTTP requests and responses
- **Controllers**: Implement business logic for each API endpoint
- **Services**: Provide reusable functionality and abstract external service interactions
- **Middleware**: Handle cross-cutting concerns like authentication and error handling
- **Routes**: Define API endpoints and connect them to controllers
- **Types**: Define TypeScript interfaces for data structures

The application uses Supabase for data storage and authentication, Square for payment processing and subscriptions, and Mailchimp for email marketing.

## Configuration

The application is configured through environment variables loaded from a `.env` file. The main configuration is defined in `src/config/config.ts` and includes:

- Server port and environment settings
- Supabase connection details (URL, API key, service key)
- Square API credentials and environment
- Mailchimp API settings

Example configuration structure:

```typescript
interface IConfig {
  port: number;
  nodeEnv: string;
  clientUrl?: string;
  supabase: {
    url: string;
    key: string;
    serviceKey?: string;
  };
  square: {
    accessToken: string;
    applicationId: string;
    environment: 'sandbox' | 'production';
    webhookSignatureKey?: string;
  };
  mailchimp: {
    apiKey: string;
    serverPrefix: string;
    audienceId: string;
  };
}
```

## Core Services

### Supabase Service

The Supabase service (`src/services/supabase.service.ts`) provides an interface to interact with Supabase for authentication and data storage. It handles:

- User authentication (signup, signin, signout)
- User profile management
- Email change with confirmation
- Password reset
- Multi-factor authentication
- Database operations with Row Level Security (RLS) bypass when needed

Key features:
- Support for both regular client and service client (admin) operations
- Proper error handling and validation
- Secure session management

Important note: When accessing the database in webhook controllers or background processes, always use the service client with fallback to the regular client:

```typescript
const client = supabaseService.serviceClient || supabaseService.client;
```

### Square Service

The Square service (`src/services/square.service.ts`) manages all interactions with the Square API for payment processing and subscription management. It handles:

- Customer creation and management
- Payment method storage and processing
- Subscription plan management
- Subscription creation, updating, and cancellation
- Invoice retrieval

Key features:
- Support for both sandbox and production environments
- Idempotent operations with unique keys
- Proper error handling and formatting
- Subscription plan variation management

### Mailchimp Service

The Mailchimp service (`src/services/mailchimp.service.ts`) provides integration with Mailchimp for email marketing. It handles:

- Adding new contacts to mailing lists
- Updating user tags based on notification preferences
- Managing email subscriptions

Key features:
- Proper initialization with API credentials
- Tag management for user preferences
- Error handling and validation

### Progress Service

The Progress service (`src/services/progress.service.ts`) manages user learning progress tracking. It handles:

- Retrieving user progress data
- Validating progress data structure
- Saving complete progress records

The progress data structure includes:
- Total attempts and time spent
- Active days tracking
- Hierarchical progress through levels, units, and lessons

## API Endpoints

### Authentication

Authentication endpoints (`/api/auth`) handle user authentication and account management:

#### `POST /api/auth/login`
Authenticate a user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response (200 OK) - Successful login:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "created_at": "2023-01-01T00:00:00.000Z"
    },
    "session": {
      "access_token": "jwt-token",
      "refresh_token": "refresh-token",
      "expires_at": 1672531200
    }
  }
}
```

**Response (200 OK) - MFA required:**
```json
{
  "success": false,
  "mfaRequired": true,
  "factors": [
    {
      "id": "factor-uuid",
      "created_at": "2023-01-01T00:00:00.000Z",
      "updated_at": "2023-01-01T00:00:00.000Z",
      "status": "verified",
      "factor_type": "totp",
      "phone": "",
      "last_challenged_at": "2023-01-01T00:00:00.000Z"
    }
  ],
  "userId": "user-uuid",
  "accessToken": "jwt-token"
}
```

**Error Responses:**
- 400 Bad Request: Invalid email or password format
- 401 Unauthorized: Invalid credentials
- 500 Internal Server Error: Server error

#### `POST /api/auth/logout`
End a user session.

**Request:** No body required, uses session cookie

**Response (200 OK):**
```json
{
  "success": true
}
```

#### `POST /api/auth/signup`
Register a new user.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "name": "John Doe",
  "consent": true,
  "university": "Example University" // Optional
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully. Please check your email to confirm your account before logging in.",
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "newuser@example.com",
      "created_at": "2023-01-01T00:00:00.000Z"
    },
    "session": {
      "access_token": "jwt-token",
      "refresh_token": "refresh-token",
      "expires_at": 1672531200
    }
  }
}
```

**Error Responses:**
- 400 Bad Request: Invalid input or email already in use
- 500 Internal Server Error: Server error

#### `POST /api/auth/verify`
Verify a user's authentication token.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- 401 Unauthorized: Invalid or expired token
- 500 Internal Server Error: Server error

#### `POST /api/auth/reset-password`
Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset email sent successfully"
}
```

**Error Responses:**
- 400 Bad Request: Invalid email format
```json
{
  "success": false,
  "message": "Invalid request format",
  "error": "Error message details"
}
```
- 429 Too Many Requests: Rate limit exceeded
```json
{
  "success": false,
  "message": "Failed to send password reset email",
  "error": "Rate limit exceeded"
}
```
- 500 Internal Server Error: Server error
```json
{
  "success": false,
  "message": "An unexpected error occurred while processing your request",
  "error": "Error message details"
}
```

**Note:** Returns success with a generic message for security reasons when email doesn't exist in the system.

#### `POST /api/auth/update-password`
Update password after reset.

**Request Body:**
```json
{
  "password": "newpassword"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 400 Bad Request: Invalid password format
- 401 Unauthorized: Invalid or expired reset token
- 500 Internal Server Error: Server error

#### `POST /api/auth/update-email`
Request email address change with confirmation.

**Request Body:**
```json
{
  "email": "newemail@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 400 Bad Request: Invalid email format or email already in use
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/auth/complete-email-change`
Complete email change after verification.

**Request:** Uses token from email link

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 401 Unauthorized: Invalid or expired token
- 500 Internal Server Error: Server error

#### `POST /api/auth/sync-email`
Sync user's email in database with auth record.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/auth/check-email`
Check if email needs to be synced.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "needsSync": true|false
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### MFA (Multi-Factor Authentication) endpoints:

#### `GET /api/auth/mfa`
Get MFA status for the current user.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "enrolled": true|false,
  "verified": true|false
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/auth/mfa/enroll`
Begin MFA enrollment.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "id": "factor-id",
  "type": "totp",
  "totp": {
    "qr_code": "data:image/png;base64,...",
    "secret": "TOTPSECRET"
  }
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/auth/mfa/verify`
Complete MFA enrollment.

**Request Body:**
```json
{
  "factorId": "factor-id",
  "code": "123456"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 400 Bad Request: Invalid code
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/auth/mfa/disable`
Disable MFA.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/auth/mfa/challenge`
Initiate MFA verification.

**Request Body:**
```json
{
  "factorId": "factor-id",
  "accessToken": "jwt-token" // Required during login flow, optional if using session cookie
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "challengeId": "challenge-id"
  }
}
```

**Error Responses:**
- 400 Bad Request: Missing access token or invalid factor ID
- 401 Unauthorized: Invalid access token
- 500 Internal Server Error: Server error

#### `POST /api/auth/mfa/verify-challenge`
Complete MFA verification.

**Request Body:**
```json
{
  "factorId": "factor-id",
  "challengeId": "challenge-id",
  "code": "123456",
  "accessToken": "jwt-token" // Required during login flow, optional if using session cookie
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "new-jwt-token",
    "refresh_token": "new-refresh-token",
    "expires_at": 1672531200
  }
}
```

**Error Responses:**
- 400 Bad Request: Invalid code or missing access token
- 401 Unauthorized: Invalid access token
- 500 Internal Server Error: Server error

### Profile Management

#### `POST /api/profiles/create`
Create a new user profile.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "securepassword",
  "consent": true,
  "university": "Example University" // Optional
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Profile created successfully"
}
```

**Error Responses:**
- 400 Bad Request: Missing required fields or user already exists
- 500 Internal Server Error: Server error

#### `GET /api/profiles/me`
Get the current user's profile.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "notificationPreferences": {
    "tipsAndGuidance": true,
    "productUpdates": false
  },
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `PUT /api/profiles/me`
Update the current user's profile.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith"
}
```

**Response (200 OK):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Smith",
  "notificationPreferences": {
    "tipsAndGuidance": true,
    "productUpdates": false
  },
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- 400 Bad Request: Invalid input
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `PUT /api/profiles/notification-preferences`
Update notification preferences.

**Request Body:**
```json
{
  "tipsAndGuidance": true,
  "productUpdates": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Notification preferences updated successfully"
}
```

**Error Responses:**
- 400 Bad Request: Invalid input
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/profiles/mailchimp/contacts`
Add a contact to Mailchimp.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe", // Optional
  "tipsAndGuidance": true, // Optional
  "productUpdates": false // Optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Contact added to Mailchimp successfully",
  "data": {
    "id": "mailchimp-contact-id"
  }
}
```

**Error Responses:**
- 400 Bad Request: Missing required fields or Mailchimp API error
- 503 Service Unavailable: Mailchimp service not available
- 500 Internal Server Error: Server error

#### `POST /api/profiles/mailchimp/current-user`
Add the current user to Mailchimp.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User added to Mailchimp successfully",
  "data": {
    "id": "mailchimp-contact-id"
  }
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 404 Not Found: User profile not found
- 400 Bad Request: Mailchimp API error
- 503 Service Unavailable: Mailchimp service not available
- 500 Internal Server Error: Server error

### Subscription Management

Subscription endpoints (`/api/subscriptions`) handle subscription creation and management:

#### `GET /api/subscriptions/plans`
Get available subscription plans.

**Request:** No authentication required

**Response (200 OK):**
```json
{
  "success": true,
  "objects": [
    {
      "id": "plan-id",
      "name": "Monthly Plan",
      "description": "Access to all content",
      "variations": [
        {
          "variationId": "variation-id",
          "price": 9.99,
          "basePrice": 9.99,
          "monthlyPrice": 9.99,
          "totalPrice": 9.99,
          "discountPercent": 0,
          "hasDiscount": false,
          "currency": "USD",
          "formattedPrice": "$9.99",
          "formattedMonthlyPrice": "$9.99/mo",
          "formattedTotalPrice": "$9.99",
          "formattedBasePrice": "$9.99",
          "interval": "MONTHLY",
          "formattedInterval": "Monthly"
        }
      ]
    }
  ],
  "environment": "sandbox"
}
```

**Error Responses:**
- 500 Internal Server Error: Server error

#### `GET /api/subscriptions`
Get the current user's subscriptions.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "has_active_subscription": true,
    "square_subscription_id": "subscription-id",
    "square_subscription_variation_id": "variation-id",
    "square_customer_id": "customer-id",
    "square_subscription_status": "ACTIVE",
    "square_subscription_canceled_date": null,
    "is_in_grace_period": false,
    "grace_period_ends_at": null,
    "pending_plan_change": null,
    "is_canceled": false,
    "cancel_date": null,
    "end_date": "2024-01-01T00:00:00.000Z",
    "next_billing_date": "2023-02-01T00:00:00.000Z",
    "plan_name": "Monthly Plan",
    "plan_interval": "MONTHLY",
    "formatted_interval": "Monthly",
    "price": 9.99,
    "formatted_price": "$9.99",
    "monthly_price": 9.99,
    "formatted_monthly_price": "$9.99/mo"
  }
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/subscriptions`
Create a new subscription.

**Request Body:**
```json
{
  "planId": "plan-id",
  "sourceId": "payment-source-id",
  "userId": "user-id",
  "variationId": "variation-id"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "subscription_id": "subscription-id",
    "customer_id": "customer-id",
    "status": "ACTIVE",
    "start_date": "2023-01-01",
    "plan_id": "plan-id"
  }
}
```

**Error Responses:**
- 400 Bad Request: Invalid input or payment failure
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `PATCH /api/subscriptions/:id/swap-plan`
Swap subscription plan to a new plan variation.

**Request Parameters:**
- id: Subscription ID

**Request Body:**
```json
{
  "newPlanVariationId": "new-variation-id",
  "squareCustomerId": "customer-id"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "subscription_id": "subscription-id",
    "new_plan_variation_id": "new-variation-id",
    "status": "ACTIVE"
  }
}
```

**Error Responses:**
- 400 Bad Request: Invalid input
- 401 Unauthorized: Not authenticated
- 404 Not Found: Subscription not found
- 500 Internal Server Error: Server error

#### `PATCH /api/subscriptions/:id/payment-method`
Update subscription payment method.

**Request Parameters:**
- id: Subscription ID

**Request Body:**
```json
{
  "sourceId": "payment-source-id"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "subscription_id": "subscription-id",
    "card_id": "card-id"
  }
}
```

**Error Responses:**
- 400 Bad Request: Invalid input
- 401 Unauthorized: Not authenticated
- 404 Not Found: Subscription not found
- 500 Internal Server Error: Server error

#### `DELETE /api/subscriptions/:id`
Cancel a subscription.

**Request Parameters:**
- id: Subscription ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "subscription_id": "subscription-id",
    "status": "CANCELED",
    "canceled_date": "2023-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 404 Not Found: Subscription not found
- 500 Internal Server Error: Server error

#### `GET /api/subscriptions/invoices`
Get user's invoices from Square.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "invoice-id",
      "subscriptionId": "subscription-id",
      "amount": 9.99,
      "currency": "USD",
      "status": "PAID",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "paidAt": "2023-01-01T00:00:00.000Z",
      "url": "https://example.com/invoice/xxx"
    }
  ]
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `GET /api/subscriptions/payment-method/:customerId`
Get payment method for a customer.

**Request Parameters:**
- customerId: Square Customer ID

**Response (200 OK):**
```json
{
  "success": true,
  "card": {
    "id": "card-id",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2025
  }
}
```

**Error Responses:**
- 400 Bad Request: Missing customer ID
- 401 Unauthorized: Not authenticated
- 403 Forbidden: Unauthorized to access this customer's payment methods
- 500 Internal Server Error: Server error

### Payment Processing

Payment endpoints (`/api/payments`) handle payment methods and transactions:

#### `POST /api/payments/methods`
Add a payment method.

**Request Body:**
```json
{
  "sourceId": "cnon:card-nonce-xxx",
  "cardholderName": "John Doe"
}
```

**Response (201 Created):**
```json
{
  "id": "payment-method-id",
  "brand": "visa",
  "last4": "4242",
  "expMonth": 12,
  "expYear": 2025,
  "cardholderName": "John Doe",
  "isDefault": true
}
```

**Error Responses:**
- 400 Bad Request: Invalid input
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `GET /api/payments/methods`
Get user's payment methods.

**Request:** Uses session cookie

**Response (200 OK):**
```json
[
  {
    "id": "payment-method-id",
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2025,
    "cardholderName": "John Doe",
    "isDefault": true
  },
  {
    "id": "payment-method-id-2",
    "brand": "mastercard",
    "last4": "5555",
    "expMonth": 10,
    "expYear": 2024,
    "cardholderName": "John Doe",
    "isDefault": false
  }
]
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `DELETE /api/payments/methods/:id`
Disable a payment method.

**Request Parameters:**
- id: Payment method ID

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Payment method disabled successfully"
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 403 Forbidden: Not authorized to delete this payment method
- 404 Not Found: Payment method not found
- 500 Internal Server Error: Server error

#### `GET /api/payments/locations`
Get Square application ID and location ID for client-side payment processing.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "success": true,
  "applicationId": "square-application-id",
  "locationId": "square-location-id",
  "environment": "sandbox"
}
```

**Error Responses:**
- 500 Internal Server Error: Server error

#### `GET /api/payments/invoices`
Get user's invoices.

**Request:** Uses session cookie

**Response (200 OK):**
```json
[
  {
    "id": "invoice-id",
    "subscriptionId": "subscription-id",
    "amount": 9.99,
    "currency": "USD",
    "status": "PAID",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "paidAt": "2023-01-01T00:00:00.000Z",
    "url": "https://example.com/invoice/xxx"
  }
]
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

### User Progress

Progress endpoints (`/api/progress`) handle user learning progress:

#### `GET /api/progress`
Get the current user's progress.

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "totalAttempts": 42,
  "totalTimeSpent": 3600,
  "activeDays": ["2023-01-01", "2023-01-02"],
  "levels": [
    {
      "id": 1,
      "name": "Level 1",
      "completed": false,
      "units": [
        {
          "id": 1,
          "name": "Unit 1",
          "completed": true,
          "lessons": [
            {
              "id": "lesson-1",
              "completed": true,
              "attempts": 5,
              "timeSpent": 300
            }
          ]
        }
      ]
    }
  ]
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `POST /api/progress/update`
Update user progress.

**Request Body - Specific Lesson Update:**
```json
{
  "levelId": "1",
  "unitId": "1",
  "lessonId": "lesson-1",
  "attempt": true,
  "complete": true,
  "timeSpent": 60
}
```

**Request Body - Full Progress Update:**
```json
{
  "progress": {
    "totalAttempts": 43,
    "totalTimeSpent": 3660,
    "activeDays": ["2023-01-01", "2023-01-02", "2023-01-03"],
    "levels": [
      {
        "id": "1",
        "name": "Level 1",
        "completed": false,
        "units": [
          {
            "id": "1",
            "name": "Unit 1",
            "completed": true,
            "lessons": [
              {
                "id": "lesson-1",
                "completed": true,
                "attempts": 6,
                "timeSpent": 360
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Request Body - Reset Progress:**
```json
{
  "reset": true,
  "progress": {
    "totalAttempts": 0,
    "totalTimeSpent": 0,
    "activeDays": [],
    "levels": []
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Progress updated successfully"
}
```

**Error Responses:**
- 400 Bad Request: Invalid input or progress data
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

### Webhooks

Webhook endpoints (`/api/webhooks`) handle external service notifications:

#### `POST /api/webhooks/square`
Handles Square subscription events.

**Request Headers:**
- `x-square-hmacsha256-signature`: Signature for verifying webhook authenticity

**Request Body:**
```json
{
  "type": "subscription.created",
  "data": {
    "object": {
      "subscription": {
        "id": "subscription_id",
        "customer_id": "customer_id",
        "status": "ACTIVE",
        "plan_variation_id": "plan_variation_id",
        "start_date": "2023-01-01",
        "canceled_date": null
      }
    }
  }
}
```

**Supported Event Types:**
- `subscription.created`: When a new subscription is created
- `subscription.updated`: When an existing subscription is updated (including cancellations)

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- 401 Unauthorized: Signature verification failed
- 500 Internal Server Error: Server error

### Video Content

Video endpoints (`/api/videos`) handle video content management:

#### `GET /api/videos`
Get available videos.

**Request:** Uses session cookie

**Query Parameters:**
- `level` (optional): Filter by level
- `unit` (optional): Filter by unit
- `lesson` (optional): Filter by lesson

**Response (200 OK):**
```json
[
  {
    "id": "video-id",
    "title": "Introduction to ASL",
    "description": "Learn the basics of American Sign Language",
    "url": "https://example.com/videos/intro.mp4",
    "thumbnailUrl": "https://example.com/thumbnails/intro.jpg",
    "duration": 300,
    "level": 1,
    "unit": 1,
    "lesson": "lesson-1"
  }
]
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 500 Internal Server Error: Server error

#### `GET /api/videos/:id`
Get a specific video.

**Request Parameters:**
- id: Video ID

**Request:** Uses session cookie

**Response (200 OK):**
```json
{
  "id": "video-id",
  "title": "Introduction to ASL",
  "description": "Learn the basics of American Sign Language",
  "url": "https://example.com/videos/intro.mp4",
  "thumbnailUrl": "https://example.com/thumbnails/intro.jpg",
  "duration": 300,
  "level": 1,
  "unit": 1,
  "lesson": "lesson-1",
  "transcripts": [
    {
      "startTime": 0,
      "endTime": 5,
      "text": "Welcome to American Sign Language"
    }
  ],
  "relatedVideos": [
    {
      "id": "related-video-id",
      "title": "ASL Alphabet"
    }
  ]
}
```

**Error Responses:**
- 401 Unauthorized: Not authenticated
- 404 Not Found: Video not found
- 500 Internal Server Error: Server error

#### `POST /api/videos/upload`
Upload a video file.

**Request:** Multipart form data with video file

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video sent to external service successfully",
  "data": {
    "filename": "video.mp4",
    "mimetype": "video/mp4",
    "size": 1048576,
    "externalResponse": {
      "id": "processed-video-id",
      "url": "https://example.com/videos/processed-video.mp4"
    }
  }
}
```

**Error Responses:**
- 400 Bad Request: No video file provided
- 500 Internal Server Error: Server error

#### `POST /api/videos/proxy-upload`
Upload a video file through a proxy to an external service.

**Request:** Multipart form data with video file

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video sent to external service successfully",
  "data": {
    "filename": "video.mp4",
    "mimetype": "video/mp4",
    "size": 1048576,
    "externalResponse": {
      "id": "processed-video-id",
      "url": "https://example.com/videos/processed-video.mp4"
    }
  }
}
```

**Alternative Response (200 OK) - When external service is unavailable:**
```json
{
  "success": true,
  "message": "External service unavailable. Video saved locally as fallback.",
  "data": {
    "filename": "video.mp4",
    "mimetype": "video/mp4",
    "size": 1048576,
    "localPath": "/path/to/uploaded/video.mp4",
    "externalError": {
      "status": 500,
      "message": "External service error",
      "details": null
    }
  }
}
```

**Error Responses:**
- 400 Bad Request: No video file provided
- 500 Internal Server Error: Server error

## Security Considerations

The backend implements several security measures:

1. **Authentication**: All sensitive endpoints require authentication via JWT tokens stored in HTTP-only cookies.

2. **Row Level Security (RLS)**: Supabase RLS ensures users can only access their own data. The service client is used to bypass RLS for admin operations when needed.

3. **CORS Configuration**: CORS is configured to only allow requests from the frontend application in production.

4. **API Key Protection**: All external service API keys are stored server-side and never exposed to the frontend.

5. **Webhook Signature Verification**: Square webhook payloads are verified using signature validation.

6. **Input Validation**: All user inputs are validated before processing.

7. **Error Handling**: Proper error handling prevents leaking sensitive information.

8. **Multi-Factor Authentication**: Support for MFA enhances account security.

## Development Guidelines

1. **Never expose environment variables or sensitive values in the frontend code.**

2. **Never interact directly with Supabase from the frontend** - all Supabase interactions must go through the backend API.

3. **Maintain strict separation between frontend and backend responsibilities.**

4. **Use proper authentication and authorization for all API endpoints.**

5. **Keep sensitive operations (like admin functions) in the backend only.**

6. **Use TypeScript for type safety and better code organization.**

7. **Follow consistent code formatting and naming conventions:**
   - Private variables in classes should be prefixed with an underscore.
   - Use descriptive variable and function names.

8. **Handle errors properly and provide meaningful error messages.**

9. **Document all functions, classes, and complex logic.**

10. **When working with Supabase in webhook controllers or background processes, always use the service client with fallback to the regular client:**
    ```typescript
    const client = supabaseService.serviceClient || supabaseService.client;
    

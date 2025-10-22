import express, { Express, Request, Response } from 'express';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import subscriptionRoutes from './routes/subscription.routes';
import webhookRoutes from './routes/webhook.routes';
import paymentRoutes from './routes/payment.routes';
import progressRoutes from './routes/progress.routes';
import videoRoutes from './routes/video.routes';
import config from './config/config';
import { errorHandler } from './middleware/error.middleware';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Add custom serialization for BigInt
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

class App {
  private _app: Express;

  constructor() {
    this._app = express();
    this._initializeMiddlewares();
    this._initializeSwagger();
    this._initializeRoutes();
    this._initializeErrorHandling();
  }

  /**
   * Initialize middleware
   */
  private _initializeMiddlewares(): void {
    // Get allowed origins from environment variable or fallback to clientUrl
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : [config.clientUrl];
    
    // Enable CORS with credentials - dynamically configured based on environment
    this._app.use(cors({
      origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl requests)
        if (!origin) return callback(null, true);
        
        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        
        // In production, check against allowed origins
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.some(allowed => allowed && origin && origin.endsWith(allowed))) {
          return callback(null, true);
        } else {
          console.warn(`Origin ${origin} not allowed by CORS policy`);
          return callback(null, true); // Still allow but log warning
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With', 
        'Cookie',
        'Accept',
        'Origin',
        'User-Agent',
        'DNT',
        'Cache-Control',
        'X-Mx-ReqToken',
        'Keep-Alive',
        'X-Requested-With',
        'If-Modified-Since'
      ],
      exposedHeaders: ['Set-Cookie'],
      preflightContinue: false,
      optionsSuccessStatus: 200 // For legacy browser support
    }));
    
        // Additional Safari-specific CORS handling
    this._app.use((req, res, next) => {
      // Safari-specific headers
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
      res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.status(200).send();
        return;
      }
      
      next();
    });

    // Capture raw body for webhook signature verification
    // Capture raw body for webhook signature verification
    this._app.use('/api/webhooks/square', express.raw({ type: 'application/json' }));
    
    // Parse cookies
    this._app.use(cookieParser());
    // Parse JSON bodies
    this._app.use(express.json());
    // Parse URL-encoded bodies
    this._app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Initialize Swagger documentation
   */
  private _initializeSwagger(): void {
    const isVercel = process.env.VERCEL === '1';
    
    if (isVercel) {
      // For Vercel deployment, we'll generate a static HTML file
      // This approach works better in serverless environments
      
      // Create a custom HTML file with the Swagger UI
      const swaggerHtml = this._generateSwaggerHtml();
      
      // Serve the static HTML file
      this._app.get('/api-docs', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/html');
        res.send(swaggerHtml);
      });
    } else {
      // For local development, use the standard swagger-ui-express
      // Remove servers section for consistency with Vercel version
      const localSpec = JSON.parse(JSON.stringify(swaggerSpec));
      delete localSpec.servers;
      
      this._app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(localSpec, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Dawn Sign Press API Documentation'
      }));
    }
  }
  
  /**
   * Generate a static HTML file with Swagger UI
   * This is used for Vercel deployment
   */
  private _generateSwaggerHtml(): string {
    // Get a copy of the Swagger spec that we can modify
    const modifiedSpec = JSON.parse(JSON.stringify(swaggerSpec));
    
    // Explicitly remove the servers section
    delete modifiedSpec.servers;
    
    // Ensure paths object exists
    if (!modifiedSpec.paths || Object.keys(modifiedSpec.paths).length === 0) {
      // If paths are empty, we'll add hardcoded paths based on our routes
      modifiedSpec.paths = this._generateHardcodedPaths();
    }
    
    // Convert the modified Swagger spec to a JSON string
    const specString = JSON.stringify(modifiedSpec);
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dawn Sign Press API Documentation</title>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui.css" />
        <style>
          html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
          *, *:before, *:after { box-sizing: inherit; }
          body { margin: 0; background: #fafafa; }
          .swagger-ui .topbar { display: none; }
        </style>
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui-bundle.js"></script>
        <script src="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui-standalone-preset.js"></script>
        <script>
          window.onload = function() {
            // Parse the spec directly from the embedded JSON
            const spec = ${specString};
            
            const ui = SwaggerUIBundle({
              spec: spec,
              dom_id: '#swagger-ui',
              deepLinking: true,
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
              ],
              plugins: [
                SwaggerUIBundle.plugins.DownloadUrl
              ],
              layout: "StandaloneLayout"
            });
            window.ui = ui;
          };
        </script>
      </body>
      </html>
    `;
  }
  
  /**
   * Generate hardcoded paths for Swagger documentation
   * This is a fallback for Vercel deployment when automatic path detection fails
   */
  private _generateHardcodedPaths(): any {
    // Return a minimal set of paths to ensure the documentation works
    return {
      // Authentication endpoints
      '/api/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'Authenticate a user',
          description: 'Authenticate a user with email and password and return user data',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: {
                      type: 'string',
                      format: 'email'
                    },
                    password: {
                      type: 'string',
                      format: 'password'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Login successful'
            },
            '401': {
              description: 'Invalid credentials'
            }
          }
        }
      },
      '/api/auth/signup': {
        post: {
          tags: ['Authentication'],
          summary: 'Register a new user',
          description: 'Create a new user account with email, password, and profile information',
          responses: {
            '201': {
              description: 'User created successfully'
            }
          }
        }
      },
      
      // Profile endpoints
      '/api/profiles': {
        get: {
          tags: ['Profile'],
          summary: 'Get current user\'s profile',
          description: 'Retrieve the profile of the currently authenticated user',
          security: [{ cookieAuth: [] }],
          responses: {
            '200': {
              description: 'Profile retrieved successfully'
            }
          }
        }
      },
      
      // Subscription endpoints
      '/api/subscriptions/plans': {
        get: {
          tags: ['Subscription'],
          summary: 'Get all subscription plans',
          description: 'Retrieve all available subscription plans',
          responses: {
            '200': {
              description: 'Subscription plans retrieved successfully'
            }
          }
        }
      },
      
      // Progress endpoints
      '/api/progress': {
        get: {
          tags: ['Progress'],
          summary: 'Get user progress',
          description: 'Retrieve the current user\'s learning progress data',
          security: [{ cookieAuth: [] }],
          responses: {
            '200': {
              description: 'Progress data retrieved successfully'
            }
          }
        }
      },
      
      // Video endpoints
      '/api/videos/upload': {
        post: {
          tags: ['Video'],
          summary: 'Upload a video',
          description: 'Upload a new video file',
          responses: {
            '201': {
              description: 'Video uploaded successfully'
            }
          }
        }
      },
      
      // Webhook endpoints
      '/api/webhooks/square': {
        post: {
          tags: ['Webhook'],
          summary: 'Handle Square webhook events',
          description: 'Process webhook notifications from Square for subscription events',
          responses: {
            '200': {
              description: 'Webhook processed successfully'
            }
          }
        }
      }
    };
  }

  /**
   * Initialize application routes
   */
  private _initializeRoutes(): void {
    // Health check route
    this._app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        message: 'Server is running',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString()
      });
    });

    // API routes
    this._app.use('/api/auth', authRoutes);
    this._app.use('/api/profiles', profileRoutes);
    this._app.use('/api/subscriptions', subscriptionRoutes);
    this._app.use('/api/webhooks', webhookRoutes);
    this._app.use('/api/payments', paymentRoutes);
    this._app.use('/api/progress', progressRoutes);
    this._app.use('/api/videos', videoRoutes);

    // 404 Handler
    this._app.use((_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });
  }

  /**
   * Initialize error handling
   */
  private _initializeErrorHandling(): void {
    this._app.use(errorHandler);
  }

  /**
   * Get the Express app
   * @returns Express app
   */
  get app(): Express {
    return this._app;
  }
}

export default new App().app;

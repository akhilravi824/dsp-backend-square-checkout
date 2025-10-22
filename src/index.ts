import express from 'express';
import app from './app';
import config from './config/config';
import supabaseService from './services/supabase.service';
import mailchimpService from './services/mailchimp.service';
import squareService from './services/square.service';

// Initialize Supabase service
(async () => {
  await supabaseService.initialize();
})();

if (config.mailchimp.apiKey && config.mailchimp.serverPrefix && config.mailchimp.audienceId) {
  try {
    mailchimpService.initialize(
      config.mailchimp.apiKey,
      config.mailchimp.serverPrefix,
      config.mailchimp.audienceId
    );
    console.log('Mailchimp service initialized successfully');
  } catch (error) {
    console.error('Error initializing Mailchimp service:', error);
  }
}

const startServer = () => {
  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (err: Error) => {
    console.log('UNHANDLED REJECTION! Shutting down...');
    console.log(err.name, err.message);
    server.close(() => {
      process.exit(1);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err: Error) => {
    console.log('UNCAUGHT EXCEPTION! Shutting down...');
    console.log(err.name, err.message);
    process.exit(1);
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('SIGTERM RECEIVED. Shutting down gracefully');
    
    server.close(() => {
      console.log('Process terminated!');
    });
  });
};

startServer();

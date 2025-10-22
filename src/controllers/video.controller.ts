import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

// External service URL
const EXTERNAL_VIDEO_SERVICE_URL = 'https://aaaa.ngrok.app/upload';

// Timeout settings (in milliseconds)
const EXTERNAL_SERVICE_TIMEOUT = 300000; // 5 minutes

// Extend the Express Request type to include Multer's file property
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Check if we're running in a serverless environment (like Vercel)
const isServerlessEnvironment = process.env.VERCEL === '1';

// Determine uploads directory based on environment
let uploadsDir: string;

if (isServerlessEnvironment) {
  // Use the OS temp directory for serverless environments
  uploadsDir = os.tmpdir();
  console.log(`[VIDEO] Using temporary directory for serverless environment: ${uploadsDir}`);
} else {
  // Use local uploads directory for non-serverless environments
  uploadsDir = path.join(process.cwd(), 'uploads');
  // Only create the directory if we're not in a serverless environment
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(`[VIDEO] Created uploads directory at ${uploadsDir}`);
    } catch (error) {
      console.error(`[VIDEO] Failed to create uploads directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Fallback to temp directory if we can't create the uploads directory
      uploadsDir = os.tmpdir();
      console.log(`[VIDEO] Falling back to temporary directory: ${uploadsDir}`);
    }
  }
}

/**
 * Handle video upload to local server
 */
export const uploadVideo = async (req: MulterRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
      return;
    }

    console.log(`[VIDEO UPLOAD] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes, type: ${req.file.mimetype}`);

    // Generate filename
    const filename = `${uuidv4()}-${req.file.originalname}`;
    const filePath = path.join(uploadsDir, filename);
    
    try {
      // Create form data to send to external service
      const formData = new FormData();
      formData.append('video', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      // Send to external service
      const externalUrl = EXTERNAL_VIDEO_SERVICE_URL;
      console.log(`[VIDEO UPLOAD] Attempting to send to external service: ${externalUrl}`);
      
      try {
        console.log(`[VIDEO UPLOAD] Request headers:`, formData.getHeaders());
        
        const response = await axios.post(externalUrl, formData, {
          headers: {
            ...formData.getHeaders()
          },
          timeout: EXTERNAL_SERVICE_TIMEOUT // Use the new timeout constant
        });

        console.log(`[VIDEO UPLOAD] External service response status: ${response.status}`);
        console.log(`[VIDEO UPLOAD] External service response:`, response.data);

        // Return the external service response along with our own metadata
        res.status(200).json({
          success: true,
          message: 'Video sent to external service successfully',
          data: {
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            externalResponse: response.data
          }
        });
      } catch (axiosError: any) {
        // Handle axios errors with detailed logging
        const status = axiosError.response?.status || 500;
        const message = axiosError.response?.data?.message || axiosError.message || 'External service error';
        
        console.error(`[VIDEO UPLOAD ERROR] Status: ${status}, Message: ${message}`);
        console.error(`[VIDEO UPLOAD ERROR] Request URL: ${externalUrl}`);
        
        if (axiosError.request) {
          console.error('[VIDEO UPLOAD ERROR] Request was made but no response received');
          console.error(`[VIDEO UPLOAD ERROR] Request details:`, {
            method: axiosError.config?.method,
            url: axiosError.config?.url,
            headers: axiosError.config?.headers
          });
        }
        
        if (axiosError.response) {
          console.error(`[VIDEO UPLOAD ERROR] Response status: ${axiosError.response.status}`);
          console.error(`[VIDEO UPLOAD ERROR] Response headers:`, axiosError.response.headers);
          console.error(`[VIDEO UPLOAD ERROR] Response data:`, axiosError.response.data);
        }
        
        // Fallback to local storage since external service is unavailable
        // Only attempt to write file if we're not in a serverless environment
        if (!isServerlessEnvironment) {
          try {
            console.log(`[VIDEO UPLOAD] External service unavailable. Saving file locally: ${filePath}`);
            fs.writeFileSync(filePath, req.file.buffer);
          } catch (fsError) {
            console.error(`[VIDEO UPLOAD] Failed to save file locally: ${fsError instanceof Error ? fsError.message : 'Unknown error'}`);
          }
        } else {
          console.log(`[VIDEO UPLOAD] External service unavailable. Skipping local save in serverless environment.`);
        }
        
        res.status(200).json({
          success: true,
          message: isServerlessEnvironment 
            ? 'External service unavailable. Cannot save locally in serverless environment.' 
            : 'External service unavailable. Video saved locally as fallback.',
          data: {
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            localPath: !isServerlessEnvironment ? filePath : undefined,
            externalError: {
              status,
              message,
              details: axiosError.response?.data || null
            }
          }
        });
      }
    } catch (error) {
      // If anything goes wrong with the external service attempt, save locally if possible
      console.error(`[VIDEO UPLOAD ERROR] Error during external upload attempt: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Only attempt to write file if we're not in a serverless environment
      if (!isServerlessEnvironment) {
        try {
          console.log(`[VIDEO UPLOAD] Saving file locally as fallback: ${filePath}`);
          fs.writeFileSync(filePath, req.file.buffer);
        } catch (fsError) {
          console.error(`[VIDEO UPLOAD] Failed to save file locally: ${fsError instanceof Error ? fsError.message : 'Unknown error'}`);
        }
      } else {
        console.log(`[VIDEO UPLOAD] Skipping local save in serverless environment.`);
      }
      
      res.status(200).json({
        success: true,
        message: isServerlessEnvironment 
          ? 'Cannot save video locally in serverless environment.' 
          : 'Video saved locally',
        data: {
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          localPath: !isServerlessEnvironment ? filePath : undefined
        }
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[VIDEO UPLOAD ERROR] Unexpected error:', error);
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

/**
 * Proxy video upload to external service
 */
export const proxyUpload = async (req: MulterRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
      return;
    }

    console.log(`[VIDEO PROXY] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes, type: ${req.file.mimetype}`);

    // Generate filename
    const filename = `${uuidv4()}-${req.file.originalname}`;
    const filePath = path.join(uploadsDir, filename);

    try {
      // Create form data to send to external service
      const formData = new FormData();
      formData.append('video', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      // Send to external service
      const externalUrl = EXTERNAL_VIDEO_SERVICE_URL;
      console.log(`[VIDEO PROXY] Attempting to send to external service: ${externalUrl}`);
      
      try {
        console.log(`[VIDEO PROXY] Request headers:`, formData.getHeaders());
        
        const response = await axios.post(externalUrl, formData, {
          headers: {
            ...formData.getHeaders()
          },
          timeout: EXTERNAL_SERVICE_TIMEOUT // Use the new timeout constant
        });

        console.log(`[VIDEO PROXY] External service response status: ${response.status}`);
        console.log(`[VIDEO PROXY] External service response:`, response.data);

        // Return the external service response
        res.status(response.status).json(response.data);
      } catch (axiosError: any) {
        // Handle axios errors with detailed logging
        const status = axiosError.response?.status || 500;
        const message = axiosError.response?.data?.message || axiosError.message || 'External service error';
        
        console.error(`[VIDEO PROXY ERROR] Status: ${status}, Message: ${message}`);
        console.error(`[VIDEO PROXY ERROR] Request URL: ${externalUrl}`);
        
        if (axiosError.request) {
          console.error('[VIDEO PROXY ERROR] Request was made but no response received');
          console.error(`[VIDEO PROXY ERROR] Request details:`, {
            method: axiosError.config?.method,
            url: axiosError.config?.url,
            headers: axiosError.config?.headers
          });
        }
        
        if (axiosError.response) {
          console.error(`[VIDEO PROXY ERROR] Response status: ${axiosError.response.status}`);
          console.error(`[VIDEO PROXY ERROR] Response headers:`, axiosError.response.headers);
          console.error(`[VIDEO PROXY ERROR] Response data:`, axiosError.response.data);
        }
        
        // Fallback to local storage since external service is unavailable
        // Only attempt to write file if we're not in a serverless environment
        if (!isServerlessEnvironment) {
          try {
            console.log(`[VIDEO PROXY] External service unavailable. Saving file locally: ${filePath}`);
            fs.writeFileSync(filePath, req.file.buffer);
          } catch (fsError) {
            console.error(`[VIDEO PROXY] Failed to save file locally: ${fsError instanceof Error ? fsError.message : 'Unknown error'}`);
          }
        } else {
          console.log(`[VIDEO PROXY] External service unavailable. Skipping local save in serverless environment.`);
        }
        
        res.status(200).json({
          success: true,
          message: isServerlessEnvironment 
            ? 'External service unavailable. Cannot save locally in serverless environment.' 
            : 'External service unavailable. Video saved locally as fallback.',
          data: {
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            localPath: !isServerlessEnvironment ? filePath : undefined,
            externalError: {
              status,
              message,
              details: axiosError.response?.data || null
            }
          }
        });
      }
    } catch (error) {
      // If anything goes wrong with the external service attempt, save locally if possible
      console.error(`[VIDEO PROXY ERROR] Error during external upload attempt: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Only attempt to write file if we're not in a serverless environment
      if (!isServerlessEnvironment) {
        try {
          console.log(`[VIDEO PROXY] Saving file locally as fallback: ${filePath}`);
          fs.writeFileSync(filePath, req.file.buffer);
        } catch (fsError) {
          console.error(`[VIDEO PROXY] Failed to save file locally: ${fsError instanceof Error ? fsError.message : 'Unknown error'}`);
        }
      } else {
        console.log(`[VIDEO PROXY] Skipping local save in serverless environment.`);
      }
      
      res.status(200).json({
        success: true,
        message: isServerlessEnvironment 
          ? 'Cannot save video locally in serverless environment.' 
          : 'Video saved locally',
        data: {
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          localPath: !isServerlessEnvironment ? filePath : undefined
        }
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[VIDEO PROXY ERROR] Unexpected error:', error);
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

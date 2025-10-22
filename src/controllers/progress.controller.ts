import { Request, Response, RequestHandler } from 'express';
import progressService from '../services/progress.service';
import { UserProgress } from '../types/progress';
import { User } from '@supabase/supabase-js';

// Define a type that includes user property
interface AuthenticatedRequest extends Request {
  user?: User;
}

export const getUserProgress: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get the authenticated user from the middleware
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const userId = user.id;
    
    // Get the user progress data
    const { data: progressData, error: progressError } = await progressService.getUserProgress(userId);
    
    if (progressError) {
      res.status(400).json({
        success: false,
        message: 'Failed to retrieve progress data',
        error: progressError.message
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: progressData
    });
    
  } catch (error) {
    console.error('Progress retrieval error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
};

export const updateProgress: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const userId = user.id;

    // Check if this is a reset request
    if (req.body.reset && req.body.progress) {
      const client = progressService.getSupabaseClient();

      const { error } = await client
        .from('users')
        .update({ progress: req.body.progress })
        .eq('id', userId);

      if (error) {
        res.status(400).json({
          success: false,
          message: 'Failed to reset progress',
          error: error.message
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Progress reset successfully'
      });
      return;
    }

    // Check if this is a full progress update
    if (req.body.progress) {
      const progressData: UserProgress = req.body.progress;

      if (!progressData) {
        res.status(400).json({
          success: false,
          message: 'Progress data is required'
        });
        return;
      }

      // 🛠 CLEAN activeDays immediately
      if (Array.isArray(progressData.activeDays)) {
        progressData.activeDays = progressData.activeDays
          .map(date => date.split('T')[0])
          .filter(Boolean);
        progressData.activeDays = Array.from(new Set(progressData.activeDays)).sort();
      } else {
        progressData.activeDays = [];
      }

      // Validate the cleaned progress data
      const validation = progressService.validateProgressData(progressData);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          message: 'Invalid progress data',
          errors: validation.errors
        });
        return;
      }

      // 🛠 Make sure today's date is added
      const today = new Date().toISOString().split('T')[0];
      if (!progressData.activeDays.includes(today)) {
        progressData.activeDays.push(today);
      }

      // Save the full progress object
      const { success, error } = await progressService.saveFullProgress(userId, progressData);

      if (!success) {
        res.status(400).json({
          success: false,
          message: 'Failed to save progress',
          error: error?.message
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Progress updated successfully'
      });
      return;
    }

    // For backward compatibility (no progress passed)
    const { data: currentProgress, error: fetchError } = await progressService.getUserProgress(userId);

    if (fetchError || !currentProgress) {
      res.status(400).json({
        success: false,
        message: 'Failed to fetch current progress',
        error: fetchError?.message || 'Progress data not found'
      });
      return;
    }

    const { success, error } = await progressService.saveFullProgress(userId, currentProgress);

    if (!success) {
      res.status(400).json({
        success: false,
        message: 'Failed to update progress',
        error: error?.message
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Progress updated successfully'
    });
  } catch (error) {
    console.error('Progress update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};


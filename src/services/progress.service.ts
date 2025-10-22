import { UserProgress, UpdateProgressRequest, LessonProgress } from '../types/progress';
import supabaseService from './supabase.service';
import { defaultProgress } from '../utils/defaultProgress';

class ProgressService {
  /**
   * Get the Supabase client with service role if available
   * @returns The Supabase client
   */
  getSupabaseClient() {
    // Use the service client to bypass RLS if available
    return supabaseService.serviceClient || supabaseService.client;
  }

  /**
   * Validates the progress data structure
   * @param progress The progress data to validate
   * @returns Validation result with isValid flag and any errors
   */
  validateProgressData(progress: UserProgress): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate totalAttempts is a number
    if (typeof progress.totalAttempts !== 'number' || progress.totalAttempts < 0) {
      errors.push('totalAttempts must be a non-negative number');
    }

    // Validate totalTimeSpent is a number
    if (typeof progress.totalTimeSpent !== 'number' || progress.totalTimeSpent < 0) {
      errors.push('totalTimeSpent must be a non-negative number');
    }

    // Validate activeDays is an array of timestamps
    if (!Array.isArray(progress.activeDays)) {
      errors.push('activeDays must be an array');
    } else {
      for (const day of progress.activeDays) {
        if (typeof day !== 'string' || isNaN(Date.parse(day))) {
          errors.push(`Invalid timestamp in activeDays: ${day}`);
        }
      }
    }

    // Validate levels structure
    if (typeof progress.levels !== 'object' || progress.levels === null) {
      errors.push('levels must be an object');
    } else {
      // Check each level
      for (const levelId in progress.levels) {
        const level = progress.levels[levelId];
        
        if (typeof level.units !== 'object' || level.units === null) {
          errors.push(`Level ${levelId}: units must be an object`);
          continue;
        }

        // Check each unit
        for (const unitId in level.units) {
          const unit = level.units[unitId];
          
          if (typeof unit.lessons !== 'object' || unit.lessons === null) {
            errors.push(`Level ${levelId}, Unit ${unitId}: lessons must be an object`);
            continue;
          }

          // Check each lesson
          for (const lessonId in unit.lessons) {
            const lesson = unit.lessons[lessonId];
            
            if (typeof lesson.attempts !== 'number' || lesson.attempts < 0) {
              errors.push(`Level ${levelId}, Unit ${unitId}, Lesson ${lessonId}: attempts must be a non-negative number`);
            }
            
            if (typeof lesson.complete !== 'boolean') {
              errors.push(`Level ${levelId}, Unit ${unitId}, Lesson ${lessonId}: complete must be a boolean`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async getUserProgress(userId: string): Promise<{ data: UserProgress | null; error: Error | null }> {
    try {
      // Use the service client to bypass RLS if available
      const client = this.getSupabaseClient();
      
      const { data, error } = await client
        .from('users')
        .select('progress')
        .eq('id', userId)
        .single();
      
      if (error) {
        return { data: null, error: new Error(error.message) };
      }
      
      // If no progress data exists yet, return the default structure
      if (!data || !data.progress) {
        return { data: defaultProgress, error: null };
      }
      
      return { data: data.progress as UserProgress, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Failed to get user progress') 
      };
    }
  }

  /**
   * Saves the full progress object for a user
   * @param userId The user ID
   * @param progressData The complete progress data to save
   * @returns Result with success flag and any error
   */
  async saveFullProgress(userId: string, progressData: UserProgress): Promise<{ success: boolean; error: Error | null }> {
    try {
      const client = this.getSupabaseClient();
      
      // Validate the progress data
      const validation = this.validateProgressData(progressData);
      if (!validation.isValid) {
        return { 
          success: false, 
          error: new Error(`Invalid progress data: ${validation.errors.join(', ')}`) 
        };
      }
  
      // 🛠 Clean activeDays completely before saving
      if (Array.isArray(progressData.activeDays)) {
        progressData.activeDays = progressData.activeDays
          .map((date) => date.split('T')[0]) // take only YYYY-MM-DD
          .filter(Boolean);
        progressData.activeDays = Array.from(new Set(progressData.activeDays)).sort();
      }
      
      const { error } = await client
        .from('users')
        .update({ progress: progressData })
        .eq('id', userId);
      
      if (error) {
        return { success: false, error: new Error(error.message) };
      }
      
      return { success: true, error: null };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err : new Error('Failed to save user progress') 
      };
    }
  }
}

export default new ProgressService();

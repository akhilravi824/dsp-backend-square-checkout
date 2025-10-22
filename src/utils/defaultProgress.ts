import { UserProgress } from '../types/progress';

/**
 * Default progress structure for new users
 * Contains initial values for all progress metrics and pre-initialized levels and units
 * 5 levels with 4 units each (units labeled 1-20)
 */
export const defaultProgress: UserProgress = {
  totalAttempts: 0,
  totalTimeSpent: 0,
  activeDays: [],
  freeTries: 3, // All users get 3 free tries with their trial when they sign up
  levels: {
    "1": { 
      units: {
        "1": { lessons: {} },
        "2": { lessons: {} },
        "3": { lessons: {} },
        "4": { lessons: {} }
      },
      locked: false
    },
    "2": { 
      units: {
        "5": { lessons: {} },
        "6": { lessons: {} },
        "7": { lessons: {} },
        "8": { lessons: {} }
      },
      locked: true
    },
    "3": { 
      units: {
        "9": { lessons: {} },
        "10": { lessons: {} },
        "11": { lessons: {} },
        "12": { lessons: {} }
      },
      locked: true
    },
    "4": { 
      units: {
        "13": { lessons: {} },
        "14": { lessons: {} },
        "15": { lessons: {} },
        "16": { lessons: {} }
      },
      locked: true
    },
    "5": { 
      units: {
        "17": { lessons: {} },
        "18": { lessons: {} },
        "19": { lessons: {} },
        "20": { lessons: {} }
      },
      locked: true
    }
  }
};

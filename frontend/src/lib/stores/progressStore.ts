import { writable } from 'svelte/store';
import type { UserProgress } from '../types/progress';

export const progressStore = writable<UserProgress | null>(null);

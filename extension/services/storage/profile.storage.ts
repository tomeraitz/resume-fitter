import { storage } from 'wxt/storage';
import type { UserProfile } from '../../types/storage';

export const userProfile = storage.defineItem<UserProfile>('local:userProfile', {
  fallback: {
    cvTemplate: '',
    professionalHistory: '',
  },
});

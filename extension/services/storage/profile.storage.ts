import { storage } from 'wxt/utils/storage';
import type { UserProfile } from '../../types/storage';

export const userProfile = storage.defineItem<UserProfile>('local:userProfile', {
  fallback: {
    cvTemplate: '',
    professionalHistory: '',
    cvFileName: undefined,
    cvFileSize: undefined,
  },
});

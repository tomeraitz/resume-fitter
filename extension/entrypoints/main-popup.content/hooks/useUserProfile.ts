import { useEffect, useState } from 'react';
import { userProfile } from '../../../services/storage';
import type { UserProfile } from '../../../types/storage';

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let initialized = false;
    let cancelled = false;

    const unwatchPromise = userProfile.watch((newVal) => {
      initialized = true;
      if (!cancelled) {
        setProfile(newVal);
        setIsLoading(false);
      }
    });

    userProfile.getValue().then((val) => {
      if (!initialized && !cancelled) {
        setProfile(val);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unwatchPromise.then((unwatch) => unwatch()).catch(() => {});
    };
  }, []);

  return { profile, isLoading };
}

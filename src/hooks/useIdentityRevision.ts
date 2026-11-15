import { useEffect, useState } from 'react';
import { eventBus } from '@/services/event-bus';

/** Refresh REST-backed identity labels when another device saves a profile. */
export function useIdentityRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => eventBus.on('profileChanged', () => setRevision((value) => value + 1)), []);
  return revision;
}

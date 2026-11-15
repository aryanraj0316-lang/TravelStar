import { countUnseenOrganizerRequests } from './organizer-badge';
import type { IncomingJoinRequest } from '@/types/api';

it('counts only unseen requests needing organizer action', () => {
  const requests = [
    { id: 'seen', status: 'PENDING' },
    { id: 'new', status: 'PENDING' },
    { id: 'allocate', status: 'ALLOCATION_PENDING' },
    { id: 'paid', status: 'PAYMENT_COMPLETED' },
    { id: 'done', status: 'CONFIRMED' },
    { id: 'rejected', status: 'REJECTED' },
  ] as IncomingJoinRequest[];
  expect(countUnseenOrganizerRequests(requests, new Set(['seen']))).toBe(3);
  expect(countUnseenOrganizerRequests(requests, new Set(['seen', 'new', 'allocate', 'paid']))).toBe(0);
});

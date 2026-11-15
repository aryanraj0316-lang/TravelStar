import type { IncomingJoinRequest } from '@/types/api';

export const SEEN_APPROVALS_KEY = '@seen_approval_request_ids';

export const needsOrganizerAction = (status: string) =>
  status === 'PENDING' || status === 'PAYMENT_COMPLETED' || status === 'ALLOCATION_PENDING';

export function countUnseenOrganizerRequests(requests: IncomingJoinRequest[], seenIds: Set<string>) {
  return requests.filter((request) => needsOrganizerAction(request.status) && !seenIds.has(request.id.trim())).length;
}

import { isStoryOwner } from './story-identity';

it('keeps another account with the same display name separate', () => {
  expect(isStoryOwner({ userId: 'other', authorName: 'Traveller' }, { id: 'me', name: 'Traveller' })).toBe(false);
});
it('uses account identity despite a stale display name', () => {
  expect(isStoryOwner({ userId: 'me', authorName: 'Before' }, { id: 'me', name: 'After' })).toBe(true);
});
it('only falls back to names for legacy stories without an account id', () => {
  expect(isStoryOwner({ authorName: ' Traveller ' }, { id: 'me', name: 'traveller' })).toBe(true);
  expect(isStoryOwner({ authorName: 'Guest Traveler' }, { name: 'Guest Traveler' })).toBe(false);
});

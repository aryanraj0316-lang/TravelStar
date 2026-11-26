export function isStoryOwner(
  story: { userId?: string | null; authorName?: string | null },
  profile: { id?: string; name?: string },
): boolean {
  if (story.userId) return !!profile.id && story.userId === profile.id;
  return !!story.authorName && !!profile.name && profile.name !== 'Guest Traveler'
    && story.authorName.trim().toLowerCase() === profile.name.trim().toLowerCase();
}

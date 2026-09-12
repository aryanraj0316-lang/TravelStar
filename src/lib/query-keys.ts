// Single source of truth for TanStack Query keys (REMEDIATION.md §6.3 —
// "One queryKey factory module so keys are consistent across the app").
// Every screen/hook that reads or invalidates a query imports from here
// instead of hand-writing array literals, so a rename can't silently
// desync a `useQuery` from the `invalidateQueries` call meant to refresh it.
export const queryKeys = {
  profile: () => ['profile'] as const,

  trips: () => ['trips'] as const,
  trip: (tripId: string) => ['trips', tripId] as const,
  tripMembers: (tripId: string) => ['trips', tripId, 'members'] as const,
  nearbyPlaces: () => ['trips', 'nearby'] as const,
  tripsSearch: (filters: {
    search?: string;
    category?: string;
    maxBudget?: number;
    guideRequired?: boolean;
    verifiedOnly?: boolean;
  }) => ['trips', 'search', filters] as const,
  likedTrips: () => ['trips', 'liked'] as const,
  myTrips: () => ['trips', 'mine'] as const,
  tripExpenses: (tripId: string) => ['trips', tripId, 'expenses'] as const,

  joinRequests: () => ['join-requests'] as const,
  incomingRequests: () => ['join-requests', 'incoming'] as const,

  guides: () => ['guides'] as const,
  guideProfile: () => ['guides', 'me'] as const,
  guideEarnings: (guideId: string) => ['guides', guideId, 'earnings'] as const,
  guidePackages: (guideId: string) => ['guides', guideId, 'packages'] as const,
  guideReels: (guideId: string) => ['guides', guideId, 'reels'] as const,
  guideLiveStatus: (guideId: string) => ['guides', guideId, 'live-status'] as const,
  guideLeads: (guideId: string) => ['guides', guideId, 'leads'] as const,
  guideQuotes: (guideId: string) => ['guides', guideId, 'quotes'] as const,
  tripQuotes: (tripId: string) => ['trips', tripId, 'quotes'] as const,

  myBookings: () => ['bookings', 'mine'] as const,
  incomingBookings: () => ['bookings', 'incoming'] as const,

  stories: () => ['stories'] as const,
  feed: () => ['feed'] as const,

  sosAlerts: () => ['sos-alerts'] as const,
  emergencyContacts: () => ['emergency-contacts'] as const,
  emergencyContactsForCity: (city: string) => ['emergency-contacts', 'city', city] as const,
  monsoonAdvisories: () => ['monsoon-advisories'] as const,

  notifications: () => ['notifications'] as const,
  unreadNotificationCount: () => ['notifications', 'unread-count'] as const,

  destinations: () => ['destinations'] as const,
  destination: (id: string) => ['destinations', id] as const,
  savedDestinations: () => ['destinations', 'saved'] as const,
  weatherLocations: () => ['weather-locations'] as const,
  liveWeather: (lat: number, lon: number) => ['weather-locations', 'live', lat, lon] as const,
  trendingWeather: () => ['weather-locations', 'trending'] as const,
  alerts: () => ['alerts'] as const,

  chats: () => ['chats'] as const,
  chatDetails: (roomId: string) => ['chats', roomId] as const,
  chatMessages: (roomId: string) => ['chats', roomId, 'messages'] as const,
} as const;

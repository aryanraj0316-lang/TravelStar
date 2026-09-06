// Every route in src/app, with how it should be reached and what proves it
// rendered. `needsAuth` routes are visited with a real logged-in session.
//
// `expect` is a case-insensitive substring that must appear in the rendered
// text — chosen to be copy that only that screen shows, so a screen that
// silently falls back to a blank/error state fails instead of passing on an
// empty page.
module.exports = [
  { path: '/', name: 'home (tabs index)', needsAuth: false, expect: null },
  { path: '/auth', name: 'auth / sign-in', needsAuth: false, expect: null },
  { path: '/forgot-password', name: 'forgot password', needsAuth: false, expect: null },
  { path: '/reset-password', name: 'reset password', needsAuth: false, expect: null },
  { path: '/search', name: 'search tab', needsAuth: false, expect: null },
  { path: '/map', name: 'map tab', needsAuth: true, expect: null },
  { path: '/create', name: 'create trip tab', needsAuth: true, expect: null },
  { path: '/chat', name: 'chat tab', needsAuth: true, expect: null },
  { path: '/profile', name: 'profile tab', needsAuth: true, expect: null },
  { path: '/notifications', name: 'notifications', needsAuth: true, expect: null },
  { path: '/stories', name: 'stories', needsAuth: false, expect: null },
  { path: '/nearby-trips', name: 'nearby trips', needsAuth: true, expect: null },
  { path: '/travel-guide', name: 'travel guide', needsAuth: false, expect: null },
  { path: '/monsoon-advisory', name: 'monsoon advisory', needsAuth: false, expect: null },
  { path: '/destination-details', name: 'destination details', needsAuth: false, expect: null },
  { path: '/budget-trips', name: 'budget trips', needsAuth: false, expect: null },
  { path: '/budget-tracker', name: 'budget tracker', needsAuth: true, expect: null },
  { path: '/group-organizer', name: 'group organizer', needsAuth: true, expect: null },
  { path: '/bookings', name: 'bookings', needsAuth: true, expect: null },
  { path: '/about', name: 'about', needsAuth: false, expect: null },
  { path: '/support', name: 'support', needsAuth: false, expect: null },
  { path: '/licenses', name: 'licenses', needsAuth: false, expect: null },
  { path: '/legal/terms', name: 'legal terms', needsAuth: false, expect: null },
  { path: '/legal/privacy', name: 'legal privacy', needsAuth: false, expect: null },
];

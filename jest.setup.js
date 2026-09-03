// The AsyncStorage package ships a mock object but doesn't wire it up
// itself — this is the integration step its own docs ask for
// (https://react-native-async-storage.github.io/async-storage/docs/advanced/jest).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Same story for NetInfo: the package ships a mock but a plain require()
// doesn't intercept the real module's own native import.
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock'));

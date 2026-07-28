import React, { useCallback, useState, useEffect } from 'react';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useApp } from '@/store/AppContext';
import { eventBus } from '@/services/event-bus';

import HomeScreen from '../screens/home-screen';
import SearchScreen from '../app/search';
import CreateTripScreen from '../app/create';
import MapScreen from '../app/map';
import ChatScreen from '../app/chat';
import ProfileScreen from '../app/profile';

const TabContext = React.createContext<{
  activeTabName: string;
  setActiveTabName: (name: string) => void;
}>({ activeTabName: 'index', setActiveTabName: () => {} });

export default function AppTabs() {
  const [activeTabName, setActiveTabName] = useState('index');

  const handleTabPress = useCallback((name: string) => {
    setActiveTabName(name);
  }, []);

  useEffect(() => {
    eventBus.emit('tabChanged', activeTabName);
  }, [activeTabName]);

  useEffect(() => {
    const unsub = eventBus.on('switchTab', (routeName: string) => {
      handleTabPress(routeName);
    });
    return unsub;
  }, [handleTabPress]);

  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <TabContext.Provider value={{ activeTabName, setActiveTabName }}>
      <View style={{ flex: 1, backgroundColor: '#060814' }}>
        <View style={[styles.screenContainer, { display: activeTabName === 'index' ? 'flex' : 'none' }]}>
          <HomeScreen />
        </View>
        <View style={[styles.screenContainer, { display: activeTabName === 'search' ? 'flex' : 'none' }]}>
          <SearchScreen />
        </View>
        <View style={[styles.screenContainer, { display: activeTabName === 'create' ? 'flex' : 'none' }]}>
          <CreateTripScreen />
        </View>
        <View style={[styles.screenContainer, { display: activeTabName === 'map' ? 'flex' : 'none' }]}>
          <MapScreen />
        </View>
        <View style={[styles.screenContainer, { display: activeTabName === 'chat' ? 'flex' : 'none' }]}>
          <ChatScreen />
        </View>
        <View style={[styles.screenContainer, { display: activeTabName === 'profile' ? 'flex' : 'none' }]}>
          <ProfileScreen />
        </View>

        <View style={styles.tabListContainer}>
          <ThemedView type="backgroundElement" style={styles.innerContainer}>
            <ThemedText type="smallBold" style={styles.brandText}>
              TravelConnect India
            </ThemedText>

            <Pressable onPress={() => handleTabPress('index')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={activeTabName === 'index' ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.tabButtonView}>
                <ThemedText type="small" themeColor={activeTabName === 'index' ? 'text' : 'textSecondary'}>
                  Home
                </ThemedText>
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => handleTabPress('search')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={activeTabName === 'search' ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.tabButtonView}>
                <ThemedText type="small" themeColor={activeTabName === 'search' ? 'text' : 'textSecondary'}>
                  Search
                </ThemedText>
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => handleTabPress('create')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={activeTabName === 'create' ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.tabButtonView}>
                <ThemedText type="small" themeColor={activeTabName === 'create' ? 'text' : 'textSecondary'}>
                  Create
                </ThemedText>
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => handleTabPress('map')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={activeTabName === 'map' ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.tabButtonView}>
                <ThemedText type="small" themeColor={activeTabName === 'map' ? 'text' : 'textSecondary'}>
                  Map
                </ThemedText>
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => handleTabPress('chat')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={activeTabName === 'chat' ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.tabButtonView}>
                <ThemedText type="small" themeColor={activeTabName === 'chat' ? 'text' : 'textSecondary'}>
                  Chat
                </ThemedText>
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => handleTabPress('profile')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={activeTabName === 'profile' ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.tabButtonView}>
                <ThemedText type="small" themeColor={activeTabName === 'profile' ? 'text' : 'textSecondary'}>
                  Profile
                </ThemedText>
              </ThemedView>
            </Pressable>

            <ExternalLink href="https://docs.expo.dev" asChild>
              <Pressable style={styles.externalPressable}>
                <ThemedText type="link">Docs</ThemedText>
                <SymbolView
                  tintColor={colors.text}
                  name={{ ios: 'arrow.up.right.square', web: 'link' }}
                  size={12}
                />
              </Pressable>
            </ExternalLink>
          </ThemedView>
        </View>
      </View>
    </TabContext.Provider>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
  },
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});

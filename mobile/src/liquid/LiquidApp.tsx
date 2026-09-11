/**
 * The liquid app shell: six destinations, one dock, one assistant entry.
 *
 * Providers wrap the navigator so any screen — and the dock itself — can open a sheet or a
 * toast. Navigation carries no headers; each destination renders its own top line.
 */

import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RefreshProvider } from './refresh';
import { LiquidThemeProvider, useTheme } from './theme';
import { SheetProvider } from './ui/Sheet';
import { ToastProvider } from './ui/Toast';
import { LiquidTabBar } from './ui/TabBar';
import ErrorBoundary from '../components/ErrorBoundary';
import DailyScreen from './screens/DailyScreen';
import NorthStarScreen from './screens/NorthStarScreen';
import TrainScreen from './screens/TrainScreen';
import SessionScreen from './screens/SessionScreen';
import SpeakScreen from './screens/SpeakScreen';
import FoodScreen from './screens/FoodScreen';
import MeScreen from './screens/MeScreen';
import CoachVoiceScreen from '../screens/CoachVoiceScreen';

const Tab = createBottomTabNavigator();
const TrainStack = createStackNavigator();

function TrainStackScreen() {
  return (
    <ErrorBoundary name="Train">
      <TrainStack.Navigator screenOptions={{ headerShown: false }}>
        <TrainStack.Screen name="TrainHome" component={TrainScreen} />
        <TrainStack.Screen name="Session" component={SessionScreen} />
        <TrainStack.Screen name="CoachVoice" component={CoachVoiceScreen} />
      </TrainStack.Navigator>
    </ErrorBoundary>
  );
}

function Shell({ navigationRef }: { navigationRef?: any }) {
  const { c, look } = useTheme();
  const navTheme = {
    ...(look === 'ink' ? DarkTheme : DefaultTheme),
    colors: {
      ...(look === 'ink' ? DarkTheme : DefaultTheme).colors,
      background: c.bg,
      card: c.panel,
      text: c.fg,
      border: c.line,
      primary: c.accent,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Tab.Navigator
        tabBar={props => <LiquidTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } } as never}
      >
        <Tab.Screen name="Daily" component={DailyScreen} />
        <Tab.Screen name="NorthStar" component={NorthStarScreen} />
        <Tab.Screen name="Train" component={TrainStackScreen} />
        <Tab.Screen name="Speak" component={SpeakScreen} />
        <Tab.Screen name="Food" component={FoodScreen} />
        <Tab.Screen name="Me" component={MeScreen} />
      </Tab.Navigator>
      <StatusBar style={look === 'ink' ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function LiquidApp({ navigationRef }: { navigationRef?: any }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LiquidThemeProvider>
        {/* Toast outside Sheet: sheet content raises toasts, so it must see the provider. */}
        <ToastProvider>
          <RefreshProvider>
            <SheetProvider>
              <View style={{ flex: 1 }}>
                <Shell navigationRef={navigationRef} />
              </View>
            </SheetProvider>
          </RefreshProvider>
        </ToastProvider>
      </LiquidThemeProvider>
    </GestureHandlerRootView>
  );
}

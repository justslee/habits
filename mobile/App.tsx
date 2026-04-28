import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { View, Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRef, useCallback, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications, scheduleDailyReview } from './src/services/notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import DailyScreen from './src/screens/DailyScreen';
import TrainHomeScreen from './src/screens/TrainHomeScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import WorkoutHistoryScreen from './src/screens/WorkoutHistoryScreen';
import RunScreen from './src/screens/RunScreen';
import RunHistoryScreen from './src/screens/RunHistoryScreen';
import TrainingCalendarScreen from './src/screens/TrainingCalendarScreen';
import RouteLibraryScreen from './src/screens/RouteLibraryScreen';
import WorkoutDetailScreen from './src/screens/WorkoutDetailScreen';
import RouteMapScreen from './src/screens/RouteMapScreen';
import RouteSuggestionsScreen from './src/screens/RouteSuggestionsScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import NorthStarScreen from './src/screens/NorthStarScreen';
import PillarDetailScreen from './src/screens/PillarDetailScreen';
import WeeklyReviewScreen from './src/screens/WeeklyReviewScreen';
import SpeakingScreen from './src/screens/SpeakingScreen';
import MeScreen from './src/screens/MeScreen';
import CustomTabBar from './src/components/CustomTabBar';
import ErrorBoundary from './src/components/ErrorBoundary';
import { colors } from './src/theme';
import { haptic } from './src/utils/haptics';

const Tab = createBottomTabNavigator();
const TrainStack = createStackNavigator();
const NorthStarStack = createStackNavigator();

const navigationRef = createNavigationContainerRef<any>();

const HEADER_STYLE = {
  backgroundColor: colors.bg,
  shadowColor: 'transparent',
  elevation: 0,
};
const HEADER_TITLE_STYLE = {
  color: colors.text,
  fontFamily: 'Inter_600SemiBold',
  fontWeight: '600' as const,
  fontSize: 18,
};

function TrainStackScreen() {
  return (
    <ErrorBoundary name="TrainStack">
      <TrainStack.Navigator
        screenOptions={{
          headerShown: true,
          headerBackTitle: ' ',
          headerStyle: HEADER_STYLE,
          headerTintColor: colors.accent,
          headerTitleStyle: HEADER_TITLE_STYLE,
        }}
      >
        <TrainStack.Screen name="TrainHome" component={TrainHomeScreen} options={{ headerShown: false }} />
        <TrainStack.Screen name="TodayWorkout" component={WorkoutScreen} options={{ title: '' }} />
        <TrainStack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} options={{ title: 'History' }} />
        <TrainStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: 'Workout Summary' }} />
        <TrainStack.Screen name="RunGPS" component={RunScreen} options={{ title: 'Run' }} />
        <TrainStack.Screen name="RunHistory" component={RunHistoryScreen} options={{ title: 'Run History' }} />
        <TrainStack.Screen name="TrainingCalendar" component={TrainingCalendarScreen} options={{ title: 'Calendar' }} />
        <TrainStack.Screen name="RouteLibrary" component={RouteLibraryScreen} options={{ title: 'Routes' }} />
        <TrainStack.Screen name="RouteSuggestions" component={RouteSuggestionsScreen} options={{ title: 'Discover Routes' }} />
        <TrainStack.Screen name="RouteMap" component={RouteMapScreen} options={{ title: '', headerTransparent: true }} />
      </TrainStack.Navigator>
    </ErrorBoundary>
  );
}

function NorthStarStackScreen() {
  return (
    <ErrorBoundary name="NorthStarStack">
      <NorthStarStack.Navigator
        screenOptions={{
          headerShown: true,
          headerBackTitle: ' ',
          headerStyle: HEADER_STYLE,
          headerTintColor: colors.accent,
          headerTitleStyle: HEADER_TITLE_STYLE,
        }}
      >
        <NorthStarStack.Screen name="NorthStarMain" component={NorthStarScreen} options={{ headerShown: false }} />
        <NorthStarStack.Screen name="NorthStarLegacy" component={ProgressScreen} options={{ title: 'Mastery (legacy)' }} />
        <NorthStarStack.Screen name="PillarDetail" component={PillarDetailScreen} options={{ title: '' }} />
        <NorthStarStack.Screen name="WeeklyReview" component={WeeklyReviewScreen} options={{ title: '' }} />
      </NorthStarStack.Navigator>
    </ErrorBoundary>
  );
}

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Daily: { active: 'today', inactive: 'today-outline' },
  Train: { active: 'fitness', inactive: 'fitness-outline' },
  Speak: { active: 'mic', inactive: 'mic-outline' },
  NorthStar: { active: 'star', inactive: 'star-outline' },
  Me: { active: 'person', inactive: 'person-outline' },
};

/** Animated tab icon with spring scale on focus change. */
function AnimatedTabIcon({ focused, color, iconName }: { focused: boolean; color: string; iconName: keyof typeof Ionicons.glyphMap }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onLayout = useCallback(() => {
    if (focused) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, damping: 15, stiffness: 150, mass: 0.5 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 150, mass: 0.5 }),
      ]).start();
      haptic.light();
    }
  }, [focused, scale]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        { transform: [{ scale }] },
        focused ? {
          backgroundColor: 'rgba(155,138,232,0.18)',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(155,138,232,0.22)',
          paddingHorizontal: 14,
          paddingVertical: 4,
        } : undefined,
      ]}
    >
      <Ionicons name={iconName} size={22} color={color} />
    </Animated.View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    InstrumentSerif_400Regular_Italic,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    // Request permissions and schedule daily review notification
    registerForPushNotifications().then((token) => {
      if (token !== null) {
        scheduleDailyReview();
      }
    });

    // Handle notification tap — navigate to Daily tab
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Daily');
      }
    });

    return () => subscription.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          tabBar={props => <CustomTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tab.Screen name="Daily" component={DailyScreen} options={{ tabBarLabel: 'Daily' }} />
          <Tab.Screen name="Train" component={TrainStackScreen} options={{ tabBarLabel: 'Train' }} />
          <Tab.Screen name="Speak" component={SpeakingScreen} options={{ tabBarLabel: 'Speak' }} />
          <Tab.Screen name="NorthStar" component={NorthStarStackScreen} options={{ tabBarLabel: 'North Star' }} />
          <Tab.Screen name="Me" component={MeScreen} options={{ tabBarLabel: 'Me' }} />
        </Tab.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

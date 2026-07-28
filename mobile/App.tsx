import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications, scheduleDailyReview } from './src/services/notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import DailyScreen from './src/screens/DailyScreen';
import TrainHomeScreen from './src/screens/TrainHomeScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import WorkoutHistoryScreen from './src/screens/WorkoutHistoryScreen';
import LogRunScreen from './src/screens/LogRunScreen';
import RunHistoryScreen from './src/screens/RunHistoryScreen';
import TrainingCalendarScreen from './src/screens/TrainingCalendarScreen';
import WorkoutDetailScreen from './src/screens/WorkoutDetailScreen';
import NorthStarScreen from './src/screens/NorthStarScreen';
import PillarDetailScreen from './src/screens/PillarDetailScreen';
import WeeklyReviewScreen from './src/screens/WeeklyReviewScreen';
import SpeakingScreen from './src/screens/SpeakingScreen';
import MeScreen from './src/screens/MeScreen';
import CustomTabBar from './src/components/CustomTabBar';
import ErrorBoundary from './src/components/ErrorBoundary';
import { colors } from './src/theme';

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
        <TrainStack.Screen name="LogRun" component={LogRunScreen} options={{ title: 'Log a Run' }} />
        <TrainStack.Screen name="RunHistory" component={RunHistoryScreen} options={{ title: 'Run History' }} />
        <TrainStack.Screen name="TrainingCalendar" component={TrainingCalendarScreen} options={{ title: 'Calendar' }} />
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
        <NorthStarStack.Screen name="PillarDetail" component={PillarDetailScreen} options={{ title: '' }} />
        <NorthStarStack.Screen name="WeeklyReview" component={WeeklyReviewScreen} options={{ title: '' }} />
      </NorthStarStack.Navigator>
    </ErrorBoundary>
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

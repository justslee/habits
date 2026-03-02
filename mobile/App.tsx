import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import PillarDetailScreen from './src/screens/PillarDetailScreen';
import WeeklyReviewScreen from './src/screens/WeeklyReviewScreen';
import SpeakingScreen from './src/screens/SpeakingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const TrainStack = createStackNavigator();
const ProgressStack = createStackNavigator();

function TrainStackScreen() {
  return (
    <ErrorBoundary name="TrainStack">
      <TrainStack.Navigator
        screenOptions={{
          headerShown: true,
          headerBackTitle: ' ',
          headerStyle: { backgroundColor: '#09090F', shadowColor: 'transparent', elevation: 0 },
          headerTintColor: '#6366F1',
          headerTitleStyle: { color: '#F0F0F5', fontFamily: 'Inter', fontWeight: '600', fontSize: 18 },
          
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

function ProgressStackScreen() {
  return (
    <ErrorBoundary name="ProgressStack">
      <ProgressStack.Navigator
        screenOptions={{
          headerShown: true,
          headerBackTitle: ' ',
          headerStyle: { backgroundColor: '#09090F', shadowColor: 'transparent', elevation: 0 },
          headerTintColor: '#6366F1',
          headerTitleStyle: { color: '#F0F0F5', fontFamily: 'Inter', fontWeight: '600', fontSize: 18 },
          
        }}
      >
        <ProgressStack.Screen name="ProgressMain" component={ProgressScreen} options={{ headerShown: false }} />
        <ProgressStack.Screen name="PillarDetail" component={PillarDetailScreen} options={{ title: '' }} />
        <ProgressStack.Screen name="WeeklyReview" component={WeeklyReviewScreen} options={{ title: '' }} />
      </ProgressStack.Navigator>
    </ErrorBoundary>
  );
}

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Daily: { active: 'today', inactive: 'today-outline' },
  Train: { active: 'fitness', inactive: 'fitness-outline' },
  Speak: { active: 'mic', inactive: 'mic-outline' },
  Progress: { active: 'stats-chart', inactive: 'stats-chart-outline' },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.bg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              elevation: 0,
              paddingTop: 8,
            },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textTertiary,
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '600',
              marginTop: 2,
              letterSpacing: 0.3,
            },
            tabBarIcon: ({ focused, color }) => {
              const icons = TAB_ICONS[route.name];
              const iconName = focused ? icons.active : icons.inactive;
              return (
                <View style={focused ? {
                  backgroundColor: colors.accentMuted,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                } : undefined}>
                  <Ionicons name={iconName} size={22} color={color} />
                </View>
              );
            },
          })}
        >
          <Tab.Screen name="Daily" component={DailyScreen} options={{ tabBarLabel: 'Daily' }} />
          <Tab.Screen name="Train" component={TrainStackScreen} options={{ tabBarLabel: 'Train' }} />
          <Tab.Screen name="Speak" component={SpeakingScreen} options={{ tabBarLabel: 'Speak' }} />
          <Tab.Screen name="Progress" component={ProgressStackScreen} options={{ tabBarLabel: 'Progress' }} />
        </Tab.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import CheckInScreen from './src/screens/CheckInScreen';
import DailyScreen from './src/screens/DailyScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import RunScreen from './src/screens/RunScreen';
import RunHistoryScreen from './src/screens/RunHistoryScreen';
import TrainingCalendarScreen from './src/screens/TrainingCalendarScreen';
import RouteLibraryScreen from './src/screens/RouteLibraryScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const RunStack = createStackNavigator();

function RunStackScreen() {
  return (
    <RunStack.Navigator screenOptions={{ headerShown: false }}>
      <RunStack.Screen name="RunMain" component={RunScreen} />
      <RunStack.Screen name="RunHistory" component={RunHistoryScreen} />
      <RunStack.Screen name="TrainingCalendar" component={TrainingCalendarScreen} />
      <RunStack.Screen name="RouteLibrary" component={RouteLibraryScreen} />
    </RunStack.Navigator>
  );
}

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Daily: { active: 'today', inactive: 'today-outline' },
  CheckIn: { active: 'add-circle', inactive: 'add-circle-outline' },
  Train: { active: 'barbell', inactive: 'barbell-outline' },
  Run: { active: 'footsteps', inactive: 'footsteps-outline' },
  Progress: { active: 'stats-chart', inactive: 'stats-chart-outline' },
};

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            height: Platform.OS === 'ios' ? 88 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 8,
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
        <Tab.Screen name="Train" component={WorkoutScreen} options={{ tabBarLabel: 'Train' }} />
        <Tab.Screen name="Run" component={RunStackScreen} options={{ tabBarLabel: 'Run' }} />
        <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarLabel: 'Progress' }} />
      </Tab.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import CheckInScreen from './src/screens/CheckInScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import RunScreen from './src/screens/RunScreen';
import RunHistoryScreen from './src/screens/RunHistoryScreen';
import TrainingCalendarScreen from './src/screens/TrainingCalendarScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const RunStack = createNativeStackNavigator();

function RunStackScreen() {
  return (
    <RunStack.Navigator screenOptions={{ headerShown: false }}>
      <RunStack.Screen name="RunMain" component={RunScreen} />
      <RunStack.Screen name="RunHistory" component={RunHistoryScreen} />
      <RunStack.Screen name="TrainingCalendar" component={TrainingCalendarScreen} />
    </RunStack.Navigator>
  );
}

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
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
        <Tab.Screen name="CheckIn" component={CheckInScreen} options={{ tabBarLabel: 'Log' }} />
        <Tab.Screen name="Train" component={WorkoutScreen} options={{ tabBarLabel: 'Train' }} />
        <Tab.Screen name="Run" component={RunStackScreen} options={{ tabBarLabel: 'Run' }} />
        <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarLabel: 'Progress' }} />
      </Tab.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

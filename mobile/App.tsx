import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import CheckInScreen from './src/screens/CheckInScreen';
import DashboardScreen from './src/screens/DashboardScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#111',
            borderTopColor: '#333',
          },
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#666',
        }}
      >
        <Tab.Screen
          name="CheckIn"
          component={CheckInScreen}
          options={{
            tabBarLabel: 'Log',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>✏️</Text>,
          }}
        />
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📊</Text>,
          }}
        />
      </Tab.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

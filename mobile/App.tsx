import { StatusBar } from 'expo-status-bar';
import CheckInScreen from './src/screens/CheckInScreen';

export default function App() {
  return (
    <>
      <CheckInScreen />
      <StatusBar style="light" />
    </>
  );
}

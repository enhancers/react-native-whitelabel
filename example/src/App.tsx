import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RNWLProvider } from 'react-native-whitelabel';
import HomeScreen from './screens/HomeScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <RNWLProvider>
        <HomeScreen />
      </RNWLProvider>
    </SafeAreaProvider>
  );
}

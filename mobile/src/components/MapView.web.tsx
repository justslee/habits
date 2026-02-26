import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MapView(props: any) {
  return (
    <View style={[styles.container, props.style]}>
      <Text style={styles.text}>Map (native only)</Text>
    </View>
  );
}

export const Marker = (_props: any) => null;
export const Polyline = (_props: any) => null;

const styles = StyleSheet.create({
  container: { backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#666', fontSize: 14 },
});

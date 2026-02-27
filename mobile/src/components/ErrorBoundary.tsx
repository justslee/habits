import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props { children: React.ReactNode; name?: string; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.message}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity style={s.btn} onPress={() => this.setState({ hasError: false, error: null })}>
            <Text style={s.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  title: { ...typography.title2, color: colors.text, marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  btn: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 12 },
  btnText: { ...typography.callout, color: '#fff', fontWeight: '600' },
});

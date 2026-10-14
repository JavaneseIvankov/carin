import { useAppRead } from '@/lib/api/query';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as React from 'react';

export function useDashboard() {
  const query = useAppRead('getDashboard', {});
  const refetchRef = React.useRef(query.refetch);
  const hasFocused = React.useRef(false);

  React.useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  useFocusEffect(
    React.useCallback(() => {
      if (hasFocused.current) void refetchRef.current();
      hasFocused.current = true;
    }, [])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchRef.current();
    });
    return () => subscription.remove();
  }, []);

  return query;
}

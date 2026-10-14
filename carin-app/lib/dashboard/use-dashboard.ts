import { useAppRead } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import { shouldRefetchDashboardOnReconnect } from './reconnect';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as React from 'react';

export function useDashboard() {
  const query = useAppRead('getDashboard', {}, { refetchOnReconnect: false });
  const { connectivity } = useAppData();
  const refetchRef = React.useRef(query.refetch);
  const hasFocused = React.useRef(false);
  const homeIsFocused = React.useRef(false);
  const previousConnectivity = React.useRef(connectivity);

  React.useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  useFocusEffect(
    React.useCallback(() => {
      homeIsFocused.current = true;
      if (hasFocused.current) void refetchRef.current();
      hasFocused.current = true;
      return () => {
        homeIsFocused.current = false;
      };
    }, [])
  );

  React.useEffect(() => {
    const previous = previousConnectivity.current;
    previousConnectivity.current = connectivity;
    if (shouldRefetchDashboardOnReconnect(previous, connectivity, homeIsFocused.current)) {
      void refetchRef.current();
    }
  }, [connectivity]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchRef.current();
    });
    return () => subscription.remove();
  }, []);

  return query;
}

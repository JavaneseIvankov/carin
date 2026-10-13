import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useAppData } from '@/lib/data/provider';
import { scopeKey } from '@/lib/data/scope';
import type { AppRequestInput } from './contracts';
import { createAppRepository, type ReadOperation, type WriteOperation } from './repository';

export function useAppRepository() {
  const { scope, connectivity, clearSession, isCurrentScope } = useAppData();
  return React.useMemo(
    () =>
      scope
        ? createAppRepository({
            scope,
            storage: AsyncStorage,
            connectivity: () => connectivity,
            onUnauthorized: clearSession,
            isCurrentScope: () => isCurrentScope(scope),
          })
        : null,
    [scope, connectivity, clearSession, isCurrentScope]
  );
}

export function useAppRead<O extends ReadOperation>(name: O, input: AppRequestInput<O>) {
  const { scope } = useAppData();
  const repository = useAppRepository();
  return useQuery({
    queryKey: scope ? scopeKey(scope, name, input) : ['carin', 'no-session', name],
    queryFn: () => repository!.read(name, input),
    enabled: !!repository,
    networkMode: 'always',
  });
}

export function useAppWrite<O extends WriteOperation>(name: O) {
  const { scope } = useAppData();
  const repository = useAppRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AppRequestInput<O>) => {
      if (!repository) throw new Error('Sesi diperlukan untuk menyimpan.');
      return repository.write(name, input);
    },
    onSuccess: () => {
      if (scope) void queryClient.invalidateQueries({ queryKey: scopeKey(scope) });
    },
    networkMode: 'always',
    retry: false,
  });
}

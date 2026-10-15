import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { View } from 'react-native';
import { serviceErrorMessage } from './presentation';
import { errorLogDetails, logAppEvent } from '@/lib/logging';

export function ServiceError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  React.useEffect(() => {
    logAppEvent('error', 'ui.service_error.displayed', errorLogDetails(error));
  }, [error]);

  return (
    <View
      className="gap-3 rounded-lg border border-destructive/40 bg-background p-4"
      accessibilityRole="alert">
      <Text className="text-destructive">{serviceErrorMessage(error)}</Text>
      {onRetry && (
        <Button variant="outline" onPress={onRetry} accessibilityLabel="Coba lagi">
          <Text>Coba lagi</Text>
        </Button>
      )}
    </View>
  );
}

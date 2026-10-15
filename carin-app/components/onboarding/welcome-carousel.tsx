import { HeaderPattern } from '@/components/app/header-pattern';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  WELCOME_SLIDES,
  getNextWelcomeAction,
  getPreviousWelcomeIndex,
  type WelcomeSlideId,
} from '@/lib/onboarding/welcome-slides';
import * as React from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MASCOTS = {
  companion: require('../../assets/images/carin-mascot.png'),
  'food-paths': require('../../assets/images/carin-mascot-camera.png'),
  'health-profile': require('../../assets/images/carin-mascot-doctor.png'),
} satisfies Record<WelcomeSlideId, number>;

export function WelcomeCarousel({ onStartProfile }: { onStartProfile: () => void }) {
  const [index, setIndex] = React.useState(0);
  const slide = WELCOME_SLIDES[index] ?? WELCOME_SLIDES[0];
  const isFirst = index === 0;
  const isLast = index === WELCOME_SLIDES.length - 1;

  const advance = () => {
    const action = getNextWelcomeAction(index);
    if (action.type === 'profile') onStartProfile();
    else setIndex(action.index);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-5">
        <View className="flex-row items-center justify-between gap-3 py-3">
          <Text variant="label" className="text-muted-foreground">
            Kenalan dengan Carin
          </Text>
          <Text
            variant="label"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Halaman ${index + 1} dari ${WELCOME_SLIDES.length}`}>
            {index + 1} dari {WELCOME_SLIDES.length}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center gap-5 pb-4"
          showsVerticalScrollIndicator={false}>
          <View className="relative items-center justify-center overflow-hidden rounded-summary bg-carin-butter px-5 py-4">
            <HeaderPattern />
            <Image
              key={slide.id}
              source={MASCOTS[slide.id]}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={slide.illustrationLabel}
              style={{ width: 200, height: 200 }}
            />
          </View>

          <View className="gap-3">
            <Text variant="h1" className="text-center">
              {slide.title}
            </Text>
            <Text variant="lead" className="text-center text-muted-foreground">
              {slide.body}
            </Text>
          </View>

          <View
            className="flex-row items-center justify-center gap-2 py-1"
            accessibilityRole="progressbar"
            accessibilityLabel={`Halaman ${index + 1} dari ${WELCOME_SLIDES.length}`}
            accessibilityValue={{
              min: 1,
              max: WELCOME_SLIDES.length,
              now: index + 1,
            }}>
            {WELCOME_SLIDES.map((item, slideIndex) => (
              <View
                key={item.id}
                className={
                  slideIndex === index
                    ? 'h-2.5 w-7 rounded-full bg-primary'
                    : 'h-2.5 w-2.5 rounded-full bg-muted'
                }
                accessible={false}
              />
            ))}
          </View>
        </ScrollView>

        <View className="gap-3 pb-4 pt-3">
          <Button
            variant="ghost"
            size="sm"
            accessibilityRole="button"
            accessibilityLabel="Lewati pengantar dan lanjut ke profil kesehatan"
            onPress={onStartProfile}
            className="self-end px-2">
            <Text className="text-sm font-semibold text-primary">Lewati pengantar</Text>
          </Button>

          <View className="flex-row items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              accessibilityRole="button"
              accessibilityLabel="Kembali ke halaman sebelumnya"
              disabled={isFirst}
              onPress={() => setIndex(getPreviousWelcomeIndex(index))}>
              <Text>Kembali</Text>
            </Button>
            <Button
              variant="tactile"
              accessibilityRole="button"
              accessibilityLabel={
                isLast ? 'Lanjut ke profil kesehatan' : 'Lanjut ke halaman berikutnya'
              }
              onPress={advance}
              className="min-w-36">
              <Text>{isLast ? 'Lanjut ke Profil' : 'Lanjut'}</Text>
            </Button>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

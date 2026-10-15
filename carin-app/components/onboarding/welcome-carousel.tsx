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
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MASCOTS = {
  companion: require('../../assets/images/carin-mascot.png'),
  'food-paths': require('../../assets/images/carin-mascot-camera.png'),
  'health-profile': require('../../assets/images/carin-mascot-doctor.png'),
} satisfies Record<WelcomeSlideId, number>;

function MascotLayer({
  slide,
  active,
  onLoad,
  onError,
}: {
  slide: (typeof WELCOME_SLIDES)[number];
  active: boolean;
  onLoad: () => void;
  onError: () => void;
}) {
  const opacity = useSharedValue(active ? 1 : 0);
  React.useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: 220,
      reduceMotion: ReduceMotion.System,
    });
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Image
      source={MASCOTS[slide.id]}
      resizeMode="contain"
      fadeDuration={0}
      accessible={active}
      accessibilityRole="image"
      accessibilityLabel={slide.illustrationLabel}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      onLoad={onLoad}
      onError={onError}
      style={[{ position: 'absolute', width: 200, height: 200 }, style]}
    />
  );
}

export function WelcomeCarousel({ onStartProfile }: { onStartProfile: () => void }) {
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState<'next' | 'previous' | null>(null);
  const [loaded, setLoaded] = React.useState<Partial<Record<WelcomeSlideId, boolean>>>({});
  const [failed, setFailed] = React.useState<Partial<Record<WelcomeSlideId, boolean>>>({});
  const [attempts, setAttempts] = React.useState<Partial<Record<WelcomeSlideId, number>>>({});
  const slide = WELCOME_SLIDES[index] ?? WELCOME_SLIDES[0];
  const isFirst = index === 0;
  const isLast = index === WELCOME_SLIDES.length - 1;
  const nextSlide = WELCOME_SLIDES[index + 1];
  const waitingForNextImage = Boolean(nextSlide && !loaded[nextSlide.id]);

  const advance = () => {
    if (waitingForNextImage) return;
    const action = getNextWelcomeAction(index);
    if (action.type === 'profile') onStartProfile();
    else {
      setDirection('next');
      setIndex(action.index);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-5">
        <View className="flex-row items-center justify-between gap-3 py-3">
          <Text
            variant="label"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Halaman ${index + 1} dari ${WELCOME_SLIDES.length}`}>
            {index + 1} dari {WELCOME_SLIDES.length}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            accessibilityRole="button"
            accessibilityLabel="Lewati pengantar dan lanjut ke profil kesehatan"
            onPress={onStartProfile}
            className="min-h-11 px-3">
            <Text className="text-sm font-semibold text-primary">Lewati</Text>
          </Button>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center gap-5 pb-4"
          showsVerticalScrollIndicator={false}>
          <View className="relative items-center justify-center overflow-hidden rounded-summary bg-carin-butter px-5 py-4">
            <HeaderPattern />
            <View style={{ width: 200, height: 200 }}>
              {WELCOME_SLIDES.map((item) => (
                <MascotLayer
                  key={`${item.id}-${attempts[item.id] ?? 0}`}
                  slide={item}
                  active={item.id === slide.id}
                  onLoad={() => setLoaded((current) => ({ ...current, [item.id]: true }))}
                  onError={() => setFailed((current) => ({ ...current, [item.id]: true }))}
                />
              ))}
              {!loaded[slide.id] && !failed[slide.id] ? (
                <View className="absolute inset-0 items-center justify-center">
                  <ActivityIndicator accessibilityLabel="Memuat ilustrasi Carin" />
                </View>
              ) : null}
            </View>
          </View>
          {Object.values(failed).some(Boolean) ? (
            <View className="gap-2" accessibilityRole="alert">
              <Text variant="muted" className="text-center">
                Ilustrasi belum dapat dimuat. Coba lagi atau lewati pengantar.
              </Text>
              <Button
                variant="outline"
                onPress={() => {
                  setAttempts((current) => {
                    const next = { ...current };
                    for (const item of WELCOME_SLIDES) {
                      if (failed[item.id]) next[item.id] = (current[item.id] ?? 0) + 1;
                    }
                    return next;
                  });
                  setFailed({});
                }}>
                <Text>Muat ulang ilustrasi</Text>
              </Button>
            </View>
          ) : null}
          <Animated.View
            key={slide.id}
            entering={
              direction
                ? (direction === 'next' ? FadeInRight : FadeInLeft)
                    .duration(220)
                    .reduceMotion(ReduceMotion.System)
                : undefined
            }
            style={{ gap: 20 }}>
            <View className="gap-3">
              <Text variant="h1" className="text-center">
                {slide.title}
              </Text>
              <Text variant="lead" className="text-center text-muted-foreground">
                {slide.body}
              </Text>
            </View>
          </Animated.View>

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
          <View className="flex-row items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              accessibilityRole="button"
              accessibilityLabel="Kembali ke halaman sebelumnya"
              disabled={isFirst}
              onPress={() => {
                setDirection('previous');
                setIndex(getPreviousWelcomeIndex(index));
              }}>
              <Text>Kembali</Text>
            </Button>
            {!isLast ? (
              <Button
                variant="tactile"
                accessibilityRole="button"
                accessibilityLabel="Lanjut ke halaman berikutnya"
                onPress={advance}
                disabled={waitingForNextImage}
                className="min-w-36">
                <Text>Lanjut</Text>
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

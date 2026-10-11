import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { color, radius, shadow, space } from '@/theme/tokens';

type ToastFn = (message: string) => void;
const ToastContext = createContext<ToastFn>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback<ToastFn>((m) => {
    setMessage(m);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
    }, 2800);
  }, [opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + space[2], opacity }]}>
          <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Txt variant="bodySm" color="onPrimary">{message}</Txt>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space[4], right: space[4], zIndex: 100 },
  toast: { backgroundColor: color.primary, borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[3], boxShadow: shadow.lg },
});

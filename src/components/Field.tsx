import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Txt } from './Txt';
import { color, font, radius, space } from '@/theme/tokens';

type Props = TextInputProps & { label: string; optional?: boolean; hint?: string; error?: string; prefix?: string; right?: ReactNode };

export const Field = forwardRef<TextInput, Props>(function Field({ label, optional, hint, error, prefix, right, style, ...rest }, ref) {
  return (
    <View style={styles.wrap}>
      <Txt variant="label">
        {label}
        {optional ? <Txt variant="bodySm" color="inkMuted"> (isteğe bağlı)</Txt> : null}
      </Txt>
      <View style={[styles.box, error ? styles.boxError : null]}>
        {prefix ? <View style={styles.prefix}><Txt variant="body">{prefix}</Txt></View> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={color.inkMuted}
          style={[styles.input, style]}
          maxFontSizeMultiplier={1.6}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <View style={styles.msg}>
          <AlertCircle size={16} color={color.error} strokeWidth={1.75} style={{ marginTop: 2 }} />
          <Txt variant="bodySm" color="error" style={{ flex: 1 }}>{error}</Txt>
        </View>
      ) : hint ? <Txt variant="bodySm" color="inkMuted">{hint}</Txt> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius.sm, backgroundColor: color.surface, overflow: 'hidden' },
  boxError: { borderColor: color.error },
  prefix: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: space[3], backgroundColor: color.surfaceMuted, borderRightWidth: 1, borderRightColor: color.line },
  input: { flex: 1, minHeight: 46, paddingHorizontal: space[3], fontFamily: font.regular, fontSize: 16, color: color.ink },
  msg: { flexDirection: 'row', gap: 6 },
});

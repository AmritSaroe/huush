import type { PropsWithChildren } from "react";
import { View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";

type HuushScreenProps = PropsWithChildren<{
  edges?: Edge[];
  style?: ViewStyle;
}>;

export function HuushScreen({ children, edges = ["top", "left", "right"], style }: HuushScreenProps) {
  const { settings } = useHuush();
  const palette = useHuushPalette(settings.theme);
  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>{children}</SafeAreaView>
    </View>
  );
}

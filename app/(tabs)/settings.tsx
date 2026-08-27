import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HuushScreen } from "@/components/huush-screen";
import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";
import type { ReaderFont, ReaderTheme } from "@/lib/huush/models";

const themes: { id: ReaderTheme; label: string }[] = [{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "sepia", label: "Sepia" }];

export default function SettingsScreen() {
  const { settings, updateSettings } = useHuush();
  const palette = useHuushPalette(settings.theme);
  const setTheme = (theme: ReaderTheme) => void updateSettings({ theme });
  const setFont = (font: ReaderFont) => void updateSettings({ font });
  const changeSize = (delta: number) => void updateSettings({ fontSize: Math.max(16, Math.min(26, settings.fontSize + delta)) });
  return (
    <HuushScreen edges={["top", "left", "right"]}>
      <ScrollView style={{ backgroundColor: palette.canvas }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: palette.ink, fontFamily: "serif" }]}>Settings</Text>
        <Text style={[styles.copy, { color: palette.muted }]}>Tune the page, not your attention.</Text>
        <Text style={[styles.sectionLabel, { color: palette.muted }]}>APPEARANCE</Text>
        <View style={[styles.group, { backgroundColor: palette.surface, borderColor: palette.divider }]}>
          <Text style={[styles.rowTitle, { color: palette.ink }]}>Reading theme</Text>
          <View style={styles.options}>{themes.map((theme) => <Pressable key={theme.id} onPress={() => setTheme(theme.id)} style={({ pressed }) => [styles.option, { borderColor: settings.theme === theme.id ? palette.accent : palette.divider, backgroundColor: settings.theme === theme.id ? palette.accentSoft : palette.surfaceRaised }, pressed && styles.pressed]}><Text style={[styles.optionText, { color: settings.theme === theme.id ? palette.accent : palette.muted }]}>{theme.label}</Text></Pressable>)}</View>
        </View>
        <Text style={[styles.sectionLabel, { color: palette.muted }]}>READER</Text>
        <View style={[styles.group, { backgroundColor: palette.surface, borderColor: palette.divider }]}>
          <View style={styles.row}><View><Text style={[styles.rowTitle, { color: palette.ink }]}>Reading font</Text><Text style={[styles.rowSub, { color: palette.muted }]}>Choose a quiet page voice</Text></View><View style={styles.fontSwitch}>{(["serif", "system"] as ReaderFont[]).map((font) => <Pressable key={font} onPress={() => setFont(font)} style={({ pressed }) => [styles.fontOption, settings.font === font && { backgroundColor: palette.accentSoft }, pressed && styles.pressed]}><Text style={[styles.fontOptionText, { color: settings.font === font ? palette.accent : palette.muted, fontFamily: font === "serif" ? "serif" : undefined }]}>{font === "serif" ? "Serif" : "Sans"}</Text></Pressable>)}</View></View>
          <View style={[styles.rule, { backgroundColor: palette.divider }]} />
          <View style={styles.row}><View><Text style={[styles.rowTitle, { color: palette.ink }]}>Text size</Text><Text style={[styles.rowSub, { color: palette.muted }]}>{settings.fontSize} pt</Text></View><View style={styles.sizeControl}><Pressable onPress={() => changeSize(-1)} accessibilityLabel="Decrease text size" style={({ pressed }) => [styles.sizeButton, { borderColor: palette.divider }, pressed && styles.pressed]}><MaterialCommunityIcons name="minus" size={18} color={palette.ink} /></Pressable><Pressable onPress={() => changeSize(1)} accessibilityLabel="Increase text size" style={({ pressed }) => [styles.sizeButton, { borderColor: palette.divider }, pressed && styles.pressed]}><MaterialCommunityIcons name="plus" size={18} color={palette.ink} /></Pressable></View></View>
        </View>
        <Text style={[styles.sectionLabel, { color: palette.muted }]}>ABOUT</Text>
        <View style={[styles.group, { backgroundColor: palette.surface, borderColor: palette.divider }]}><View style={styles.row}><View><Text style={[styles.rowTitle, { color: palette.ink }]}>Huush Expo</Text><Text style={[styles.rowSub, { color: palette.muted }]}>Native reader test build · 0.1.0</Text></View><MaterialCommunityIcons name="information-outline" size={22} color={palette.faint} /></View></View>
      </ScrollView>
    </HuushScreen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 40, paddingHorizontal: 20, paddingTop: 10 }, title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8 }, copy: { fontSize: 15, marginTop: 7 }, sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 9, marginTop: 27 }, group: { borderRadius: 17, borderWidth: 1, overflow: "hidden", padding: 16 }, row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 48 }, rowTitle: { fontSize: 16, fontWeight: "700" }, rowSub: { fontSize: 13, marginTop: 3 }, options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }, option: { borderRadius: 14, borderWidth: 1, minHeight: 39, paddingHorizontal: 13, justifyContent: "center" }, optionText: { fontSize: 13, fontWeight: "700" }, fontSwitch: { flexDirection: "row" }, fontOption: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 }, fontOptionText: { fontSize: 13, fontWeight: "700" }, rule: { height: 1, marginVertical: 15 }, sizeControl: { flexDirection: "row", gap: 8 }, sizeButton: { alignItems: "center", borderRadius: 11, borderWidth: 1, height: 38, justifyContent: "center", width: 38 }, pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] } });

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";

export default function TabLayout() {
  const { settings } = useHuush();
  const palette = useHuushPalette(settings.theme);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomPadding = Platform.OS === "web" ? 14 : Math.max(insets.bottom, 10);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.faint,
        headerShown: false,
        tabBarStyle: {
          display: width >= 1024 ? "none" : "flex",
          paddingTop: 9,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: palette.surface,
          borderTopColor: palette.divider,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons size={24} color={color} name={focused ? "bookshelf" : "bookshelf"} />,
        }}
      />
      <Tabs.Screen name="tags" options={{ title: "Tags", tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons size={23} color={color} name={focused ? "tag" : "tag-outline"} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, focused }) => <MaterialCommunityIcons size={23} color={color} name={focused ? "cog" : "cog-outline"} /> }} />
    </Tabs>
  );
}

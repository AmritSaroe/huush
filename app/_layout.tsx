import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { HuushProvider, useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";
import { initManusRuntime } from "@/lib/_core/manus-runtime";
import { createTRPCClient, trpc } from "@/lib/trpc";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootNavigator() {
  const { settings } = useHuush();
  const palette = useHuushPalette(settings.theme);
  return (
    <>
      <StatusBar style={palette.isDark ? "light" : "dark"} translucent backgroundColor="transparent" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="capture" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="reader/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="oauth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initManusRuntime();
  }, []);

  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const [trpcClient] = useState(() => createTRPCClient());
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <HuushProvider>
              <RootNavigator />
            </HuushProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

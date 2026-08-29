import type { JSX } from "react"
import { useEffect } from "react"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { createSyncManager } from "@/lib/syncManager";
import { handleOutboxOperation } from "@/lib/fieldActions";
import { startLiveStream } from "@/lib/liveStream";
import { createDurableShiftActor } from "@/lib/shiftPersistence";
import { attachOutboxMirror, bindShiftActor, hydrateJobsFromDb, refreshJobs } from "@/state/store";

import "../global.css";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash keep-alive is best effort */
});

/**
 * FieldLoop field agent — root shell. The Hardware Chassis (dark) is the
 * default colourway: outdoor glare, battery, and the instrument-panel
 * aesthetic per the FSM design spec. Fonts: Lato (UI) + JetBrains Mono
 * (labels, tabular timer digits). The live stream and the outbox sync
 * manager run for the whole app life — data arrives on its own and queued
 * writes drain themselves; no screen ever owns that machinery.
 */
export default function RootLayout(): JSX.Element {
  const [fontsLoaded] = useFonts({
    "Big Shoulders": require("../../assets/fonts/BigShoulders-700.ttf"),
    "Big Shoulders 600": require("../../assets/fonts/BigShoulders-600.ttf"),
    "Big Shoulders 800": require("../../assets/fonts/BigShoulders-800.ttf"),
    "IBM Plex Sans": require("../../assets/fonts/PlexSans-400.ttf"),
    "IBM Plex Sans 500": require("../../assets/fonts/PlexSans-500.ttf"),
    "IBM Plex Sans 600": require("../../assets/fonts/PlexSans-600.ttf"),
    "IBM Plex Mono": require("../../assets/fonts/PlexMono-400.ttf"),
    "IBM Plex Mono 500": require("../../assets/fonts/PlexMono-500.ttf")
  });

  useEffect(() => {
    const detachMirror = attachOutboxMirror()
    const sync = createSyncManager(handleOutboxOperation)
    const stopStream = startLiveStream()
    // Local-first boot: render the WatermelonDB cache, then pull.
    void hydrateJobsFromDb().then(() => void refreshJobs())
    // Durable shift actor: restores a mid-shift snapshot before the UI is
    // interactive (the fonts gate covers the async restore window).
    void createDurableShiftActor().then(actor => bindShiftActor(actor))
    return () => {
      stopStream()
      sync.stop()
      detachMirror()
    }
  }, [])

  if (!fontsLoaded) return <></>;
  SplashScreen.hideAsync().catch(() => {});

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="job/[id]" />
        </Stack>
        <StatusBar style="light" />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

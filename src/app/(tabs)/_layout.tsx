import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import type { ComponentProps, JSX } from "react";
import type { ColorValue } from "react-native";

import { ClockInGateway } from "@/components/ClockInGateway";
import { InstrumentHeader } from "@/components/InstrumentHeader";
import { useFieldState } from "@/state/store";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, color }: { name: IoniconName; color: ColorValue }): JSX.Element {
  // 26px glyphs — gloved-thumb visibility over the default 24.
  return <Ionicons name={name} size={26} color={color} />;
}

/**
 * App shell (mockup fusion): the instrument header persists across all
 * tabs; the clock-in gateway overlays everything until the shift starts
 * (and returns on log-off) — the shift is the gateway to the working app,
 * exactly like the mockup's screen layers, but backed by the durable XState
 * actor so a crash mid-shift re-enters straight past the ceremony.
 */
export default function TabsLayout(): JSX.Element {
  const shift = useFieldState(state => state.shift)

  return (
    <View className="flex-1">
      <InstrumentHeader />
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: "#131a21", borderTopColor: "#26323c" } }}>
        <Tabs.Screen
          name="index"
          options={{
            title: "Jobs",
            tabBarIcon: ({ color }) => <TabIcon name="briefcase-outline" color={color} />
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: "Map",
            tabBarIcon: ({ color }) => <TabIcon name="map-outline" color={color} />
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => <TabIcon name="person-outline" color={color} />
          }}
        />
      </Tabs>
      {!shift && <ClockInGateway />}
    </View>
  );
}

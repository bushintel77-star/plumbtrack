import type { JSX } from "react"
import { useEffect } from "react"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  cancelAnimation
} from "react-native-reanimated"

/**
 * State-to-worklet binding (the directive's final link): when the XState
 * shift machine commits, `commitTick` advances and the panel springs in /
 * pulses on the native UI thread — Reanimated worklets, zero JS-thread
 * involvement. Paired with the haptic patterns in lib/haptics so the
 * worker feels AND sees each transition land.
 */
export function CommitSpringPanel({
  commitTick,
  children
}: {
  /** Changes on every statechart commit (log-on, break toggles, log-off). */
  commitTick: number
  children: React.ReactNode
}): JSX.Element {
  const scale = useSharedValue(0.96)
  const opacity = useSharedValue(0)

  useEffect(() => {
    // Spring entrance + a single settle pulse per commit.
    opacity.value = withSpring(1, { damping: 18, stiffness: 160 })
    scale.value = withSequence(
      withSpring(1.015, { damping: 12, stiffness: 180 }),
      withSpring(1, { damping: 16, stiffness: 170 })
    )
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [commitTick, opacity, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value
  }))

  return <Animated.View style={animatedStyle}>{children}</Animated.View>
}

/** Continuous LIVE pulse for the streaming indicator (UI thread). */
export function LivePulseDot({ active }: { active: boolean }): JSX.Element {
  const scale = useSharedValue(1)

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withSpring(1.35, { damping: 10, stiffness: 150 }),
          withSpring(1, { damping: 14, stiffness: 150 })
        ),
        -1, // infinite
        true
      )
    } else {
      cancelAnimation(scale)
      scale.value = withSpring(1)
    }
  }, [active, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }))

  return (
    <Animated.View style={animatedStyle} className="h-2 w-2 rounded-full bg-active" />
  )
}

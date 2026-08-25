"use client";

import type { SVGProps } from "react";

/**
 * PlumbTrack field icon set — bespoke, domain-specific glyphs drawn on a
 * 24×24 grid in a consistent instrument style (1.9 stroke, round caps).
 * Deliberately NOT stock icon-library glyphs: status and capture actions on
 * working screens get plumbing-native imagery (valve wheel, hex nut, tap,
 * droplet, hard hat) so the interface reads like a field tool.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Svg({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

/** Log-on / shift control — valve wheel with pipe stubs. */
export function IconValve(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.6 12h3.4M19 12h3.4" />
      <circle cx="12" cy="12" r="6" />
      <path d="M12 6v12M6 12h12M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4" />
    </Svg>
  );
}

/** Log-off — valve wheel with the flow barred shut. */
export function IconValveShut(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.6 12h3.4M19 12h3.4" />
      <circle cx="12" cy="12" r="6" />
      <path d="M12 6v12M6 12h12" />
      <path d="M5.2 5.2l13.6 13.6" />
    </Svg>
  );
}

/** Live tracking — instrument crosshair with center fix. */
export function IconGpsFix(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Unpaid meal break — mug with steam. */
export function IconMugBreak(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9.5h9v6.2a2.8 2.8 0 0 1-2.8 2.8H8.8A2.8 2.8 0 0 1 6 15.7Z" />
      <path d="M15 11h1.3a2.6 2.6 0 0 1 0 5.2H15" />
      <path d="M8.8 3.4c-.8 1-.8 2 0 3M12.2 3.4c-.8 1-.8 2 0 3" />
    </Svg>
  );
}

/** Photo capture — field camera with lens and flash. */
export function IconCameraField(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.6 7.5V5.9a1.4 1.4 0 0 1 1.4-1.4h4a1.4 1.4 0 0 1 1.4 1.4v1.6" />
      <rect x="3" y="7.5" width="18" height="13" rx="2.6" />
      <circle cx="12" cy="14" r="3.6" />
      <circle cx="18.4" cy="10.8" r="0.55" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Site note — sheet, folded corner, pen overlay. */
export function IconNotePen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2.9h7.4L19 8.5v12.6H6Z" />
      <path d="M13.4 2.9v5.6H19" />
      <path d="M9 12.2h3.6M9 15.6h2.8" />
      <path d="m13.4 17.6 6-6 1.5 1.5-6 6-2.1.6Z" />
    </Svg>
  );
}

/** Part / fitting — hex nut with bore. */
export function IconHexNut(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.3 19.4 7.6v8.8L12 20.7 4.6 16.4V7.6Z" />
      <circle cx="12" cy="12" r="3.1" />
    </Svg>
  );
}

/** Safety checks — hard hat. */
export function IconHat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.4 15.7a7.6 7.6 0 0 1 15.2 0" />
      <path d="M2.6 15.7h18.8" />
      <path d="M12 8.1v7.6" />
      <path d="M9.6 8.5a6 6 0 0 1 4.8 0" />
    </Svg>
  );
}

/** On the way — van with motion lines. */
export function IconVanRoute(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.6 16V8h10.8v8" />
      <path d="M13.4 10.2h3.4L20 13.3v2.7h-6.6" />
      <path d="M13.4 13.3H20" />
      <circle cx="7" cy="17.9" r="1.7" />
      <circle cx="16.7" cy="17.9" r="1.7" />
      <path d="M2 6.4h4.8M1.2 9.4h3.4" />
    </Svg>
  );
}

/** Scheduled — instrument clock with quadrant ticks. */
export function IconClockWait(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.5v1.7M18.5 12h1.7M12 18.8v1.7M3.8 12h1.7" />
      <path d="M12 7.6V12l3.2 1.8" />
    </Svg>
  );
}

/** Work in progress — running tap with falling droplet. */
export function IconTapFlow(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.6 3.6V8h8.3a2.3 2.3 0 0 1 2.3 2.3v2.1" />
      <path d="M6.6 3.6h3.9M8.55 3.6V1.9M6.8 1.9h3.5" />
      <path d="M17.15 15.1s-2 2.3-2 3.6a2 2 0 0 0 4 0c0-1.3-2-3.6-2-3.6Z" />
    </Svg>
  );
}

/** Completed — seal ring with check. */
export function IconSealCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" strokeDasharray="1.5 2.5" />
      <circle cx="12" cy="12" r="6.5" />
      <path d="m8.8 12.2 2.2 2.2 4.2-4.6" />
    </Svg>
  );
}

/** Emergency — alerting droplet. */
export function IconDropAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.9S5.9 9.9 5.9 14.5a6.1 6.1 0 0 0 12.2 0C18.1 9.9 12 2.9 12 2.9Z" />
      <path d="M12 10.7v3.6" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Queued for upload — cloud with up arrow. */
export function IconCloudQueue(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.2 18.4h9.5a4 4 0 0 0 .9-7.9 6 6 0 0 0-11.5-1.5 4.3 4.3 0 0 0 1.1 9.4Z" />
      <path d="M12 16.3v-4.4M10.1 13.5l1.9-1.9 1.9 1.9" />
    </Svg>
  );
}

/** Syncing — cloud with circulating arcs. */
export function IconCloudSync(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.2 18.4h9.5a4 4 0 0 0 .9-7.9 6 6 0 0 0-11.5-1.5 4.3 4.3 0 0 0 1.1 9.4Z" />
      <path d="M10.1 15.3a2.7 2.7 0 0 1 4.4-1.4M13.9 13.6a2.7 2.7 0 0 1-4.4 1.4" />
    </Svg>
  );
}

/** Sync failed — cloud with cross. */
export function IconCloudFail(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.2 18.4h9.5a4 4 0 0 0 .9-7.9 6 6 0 0 0-11.5-1.5 4.3 4.3 0 0 0 1.1 9.4Z" />
      <path d="m10.3 12.4 3.4 3.4M13.7 12.4l-3.4 3.4" />
    </Svg>
  );
}

/** Site access — key. */
export function IconKeyAccess(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="12" r="2.9" />
      <path d="M10.4 12h10.1M17.3 12v2.6M20.3 12v3" />
    </Svg>
  );
}

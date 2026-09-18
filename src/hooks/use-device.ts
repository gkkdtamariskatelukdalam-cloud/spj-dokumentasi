"use client";

import * as React from "react";

export type DeviceKind = "android" | "ios" | "mobile" | "laptop";

/**
 * Detect device kind from user agent. Runs only client-side.
 * Returns "laptop" during SSR (safe default) then updates on mount.
 */
export function useDevice(): {
  device: DeviceKind;
  isMobile: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  hasCamera: boolean; // heuristic: mobile => true; laptop => !!(navigator.mediaDevices)
  mounted: boolean;
} {
  const [device, setDevice] = React.useState<DeviceKind>("laptop");
  const [hasCamera, setHasCamera] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const ua = navigator.userAgent.toLowerCase();
    let d: DeviceKind = "laptop";
    if (/android/.test(ua)) d = "android";
    else if (/iphone|ipad|ipod/.test(ua)) d = "ios";
    else if (/mobile|tablet/.test(ua)) d = "mobile";
    setDevice(d);

    // camera heuristic
    if (d === "android" || d === "ios" || d === "mobile") {
      setHasCamera(true);
    } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // we don't actually request permission here, just feature-detect
      setHasCamera(true);
    }
  }, []);

  return {
    device,
    isMobile: device === "android" || device === "ios" || device === "mobile",
    isAndroid: device === "android",
    isIOS: device === "ios",
    hasCamera,
    mounted,
  };
}

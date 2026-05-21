import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

export type DeviceClass = "mobile" | "tablet" | "desktop"

function getDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "desktop"
  if (window.innerWidth < MOBILE_BREAKPOINT) return "mobile"
  if (window.innerWidth < TABLET_BREAKPOINT) return "tablet"
  return "desktop"
}

export function useDeviceClass() {
  const [deviceClass, setDeviceClass] = React.useState<DeviceClass>(() => getDeviceClass())

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`)
    const onChange = () => setDeviceClass(getDeviceClass())
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    onChange()
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return deviceClass
}

export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)")
    const onChange = () => setIsTouch(mql.matches)
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isTouch
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

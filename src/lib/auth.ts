import * as SecureStore from "expo-secure-store"

import { config } from "./config"
import type { DeviceSession } from "./types"

/**
 * Device-session auth — the RN mirror of apps/web's enrolment: one stable
 * device identity, POST /api/auth/device, signed bearer session held in the
 * device keychain (never localStorage-grade storage). Offline-tolerant: a
 * failed enrolment returns null and is retried on next boot.
 */

const SESSION_KEY = "plumbtrack-auth-session"
const DEVICE_KEY = "plumbtrack-device-id"

export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY)
  if (existing) return existing
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  await SecureStore.setItemAsync(DEVICE_KEY, id)
  return id
}

export async function getSession(): Promise<DeviceSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as DeviceSession
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await clearSession()
      return null
    }
    return session
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY)
}

/** Enrol (or re-enrol) a technician-scoped session. Returns null offline. */
export async function enrollDeviceSession(): Promise<DeviceSession | null> {
  const deviceId = await getDeviceId()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.apiTimeoutMs)
    const res = await fetch(`${config.apiUrl}/api/auth/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": config.orgId },
      body: JSON.stringify({ deviceId }),
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const session = (await res.json()) as DeviceSession
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
    return session
  } catch {
    return null
  }
}

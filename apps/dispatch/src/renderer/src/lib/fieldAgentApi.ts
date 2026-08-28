const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const ORG_ID = import.meta.env.VITE_ORGANIZATION_ID ?? 'demo-org'

export interface Customer {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  notes?: string | null
  properties?: Property[]
}

export interface Property {
  id: string
  customerId: string
  address: string
  accessCode?: string | null
  notes?: string | null
}

export interface Appointment {
  id: string
  jobId: string
  assignedStaffId?: string | null
  scheduledStart: string
  scheduledEnd?: string | null
  status: string
}

export interface IntegrationHealth {
  provider: string
  configured: boolean
  healthy: boolean
  detail?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-organization-id': ORG_ID,
      ...(init?.headers ?? {})
    }
  })
  if (!response.ok) throw new Error(`Field Agent API request failed (${response.status})`)
  return (await response.json()) as T
}

export const fieldAgentApi = {
  listCustomers: () => request<Customer[]>('/api/customers'),
  listAppointments: () => request<Appointment[]>('/api/appointments'),
  integrationHealth: () => request<IntegrationHealth[]>('/api/integrations/health'),
  slackStatus: () => request<{ slackConnected: boolean }>('/api/notifications/status'),
  createPaymentLink: (jobId: string, amount: number) => request<{ url: string; mode: 'live' | 'test'; configured: boolean }>(`/api/jobs/${jobId}/payment-link`, {
    method: 'POST',
    body: JSON.stringify({ amount })
  })
}

import { useEffect, useMemo, useState } from 'react'
import { Building2, FileSpreadsheet, FileText, MessageSquare, RefreshCw, Users, Wallet } from 'lucide-react'
import { fieldAgentApi, type Appointment, type Customer, type IntegrationHealth } from '@/lib/fieldAgentApi'
import { useDispatchStore } from '@/store/dispatchStore'
import { formatMoney, quoteTotal } from '@/lib/format'

export function OperationsHub(): JSX.Element {
  const jobs = useDispatchStore((state) => state.jobs)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([])
  const [activeView, setActiveView] = useState<'crm' | 'finance' | 'slack' | 'documents'>('crm')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [nextCustomers, nextAppointments, nextIntegrations] = await Promise.all([
        fieldAgentApi.listCustomers(),
        fieldAgentApi.listAppointments(),
        fieldAgentApi.integrationHealth()
      ])
      setCustomers(nextCustomers)
      setAppointments(nextAppointments)
      setIntegrations(nextIntegrations)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Field Agent API unavailable — showing local records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const revenue = useMemo(() => jobs.reduce((sum, job) => sum + quoteTotal(job.quote.lineItems), 0), [jobs])
  const connected = integrations.filter((item) => item.healthy || item.configured).length

  return (
    <section className="dispatch-surface flex h-full min-h-0 flex-col rounded-xl p-4" aria-label="Operations hub">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400">Field Agent systems</p>
          <h2 className="text-lg font-bold tracking-tight">Operations hub</h2>
          <p className="text-xs text-muted-foreground">CRM, finance, Slack and the document vault in one desktop workspace.</p>
        </div>
        <button type="button" onClick={() => void load()} className="dispatch-control rounded-lg border border-white/10 bg-white/5 p-2 text-muted-foreground hover:text-foreground" aria-label="Refresh operations data">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Metric icon={Users} label="Customers" value={String(customers.length)} />
        <Metric icon={Building2} label="Appointments" value={String(appointments.length)} />
        <Metric icon={Wallet} label="Quote pipeline" value={formatMoney(revenue)} />
        <Metric icon={MessageSquare} label="Integrations" value={`${connected}/${integrations.length || 3}`} />
      </div>

      <nav className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Operations areas">
        <HubTab icon={Users} label="CRM" active={activeView === 'crm'} onClick={() => setActiveView('crm')} />
        <HubTab icon={Wallet} label="Accounting" active={activeView === 'finance'} onClick={() => setActiveView('finance')} />
        <HubTab icon={MessageSquare} label="Slack" active={activeView === 'slack'} onClick={() => setActiveView('slack')} />
        <HubTab icon={FileText} label="Documents" active={activeView === 'documents'} onClick={() => setActiveView('documents')} />
      </nav>

      <div className="scrollbar-thin mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
        {loading && <p className="text-sm text-muted-foreground">Connecting to Field Agent systems…</p>}
        {error && !loading && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{error}</p>}
        {!loading && activeView === 'crm' && <CrmView customers={customers} jobs={jobs.length} />}
        {!loading && activeView === 'finance' && <FinanceView jobs={jobs} />}
        {!loading && activeView === 'slack' && <SlackView connected={integrations.some((item) => item.provider.toLowerCase() === 'slack' && item.configured)} />}
        {!loading && activeView === 'documents' && <DocumentsView />}
      </div>
    </section>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }): JSX.Element {
  return <div className="rounded-lg border border-white/10 bg-white/5 p-2.5"><Icon className="h-4 w-4 text-blue-300" /><p className="tnum mt-2 text-lg font-semibold">{value}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p></div>
}

function HubTab({ icon: Icon, label, active, onClick }: { icon: typeof Users; label: string; active: boolean; onClick: () => void }): JSX.Element {
  return <button type="button" onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold ${active ? 'border-primary/50 bg-primary/15 text-blue-300' : 'border-white/10 bg-white/5 text-muted-foreground'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
}

function CrmView({ customers, jobs }: { customers: Customer[]; jobs: number }): JSX.Element {
  return <div><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Customers and properties</h3><span className="text-xs text-muted-foreground">{jobs} linked jobs</span></div><div className="space-y-2">{customers.length === 0 ? <p className="text-sm text-muted-foreground">No CRM records returned. The Field Agent customer API is ready for connection.</p> : customers.map((customer) => <div key={customer.id} className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="flex justify-between"><span className="font-medium">{customer.name}</span><span className="text-xs text-muted-foreground">{customer.properties?.length ?? 0} properties</span></div><p className="mt-1 text-xs text-muted-foreground">{customer.email ?? customer.phone ?? 'No contact details recorded'}</p></div>)}</div></div>
}

function FinanceView({ jobs }: { jobs: ReturnType<typeof useDispatchStore.getState>['jobs'] }): JSX.Element {
  return <div><h3 className="font-semibold">Accounting and payments</h3><p className="mt-1 text-xs text-muted-foreground">Quote totals, Xero invoice handoff, and Stripe payment links stay attached to each job in the inspector.</p><div className="mt-3 space-y-2">{jobs.map((job) => <div key={job.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"><span><span className="block text-sm font-medium">{job.title}</span><span className="text-xs text-muted-foreground">{job.quote.status.toUpperCase()}</span></span><span className="tnum text-sm font-semibold">{formatMoney(quoteTotal(job.quote.lineItems))}</span></div>)}</div></div>
}

function SlackView({ connected }: { connected: boolean }): JSX.Element {
  const channels = useDispatchStore((state) => state.channels)
  return <div><h3 className="font-semibold">Slack messenger</h3><p className="mt-1 text-xs text-muted-foreground">Field Agent updates relay through the same channel model used by the mobile crew.</p><div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${connected ? 'bg-blue-500/15 text-blue-300' : 'bg-amber-500/15 text-amber-300'}`}>{connected ? 'Connected' : 'Demo / relay pending'}</span><p className="mt-2 text-sm">{channels.length} synced channels available in Dispatch.</p></div></div>
}

function DocumentsView(): JSX.Element {
  const jobs = useDispatchStore((state) => state.jobs)
  const extensions = ['PDF', 'DOCX', 'XLSX']
  return <div><h3 className="font-semibold">Document management</h3><p className="mt-1 text-xs text-muted-foreground">Attach, version, search and open operational files from the Field Agent vault.</p><div className="mt-3 grid grid-cols-3 gap-2">{extensions.map((extension) => <div key={extension} className="rounded-lg border border-white/10 bg-white/5 p-3"><FileSpreadsheet className="h-5 w-5 text-blue-300" /><p className="mt-2 text-sm font-semibold">{extension}</p><p className="text-[10px] text-muted-foreground">Supported file type</p></div>)}</div><div className="mt-3 space-y-2">{jobs.flatMap((job) => job.documents.map((document) => <div key={document.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3"><FileText className="h-4 w-4 text-blue-300" /><span className="flex-1 text-sm">{document.name}</span><span className="text-[10px] text-muted-foreground">{document.ref}</span></div>))}</div></div>
}

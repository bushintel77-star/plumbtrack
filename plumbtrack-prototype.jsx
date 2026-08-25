import React, { useState, useRef, useEffect } from "react";
import {
  Clock, MapPin, Camera, Check, ArrowLeft, FileText, Droplet, X, Send,
  Plus, Trash2, ClipboardList, Wrench
} from "lucide-react";

const RATE_STANDARD = 145;
const CALLOUT_FEE = 85;

const ENTITY = "Caulfield South Plumbing";
const TRADE = "plumbing";

const seedJobs = [
  {
    id: "J-1042",
    entity: ENTITY,
    trade: TRADE,
    client: "Marlene Cho",
    address: "9 Booran Rd, Caulfield South VIC",
    scope: "Kitchen mixer tap leaking, possible cartridge replacement",
    status: "scheduled",
    timeEntries: [],
    photos: [],
    signature: null,
  },
  {
    id: "J-1043",
    entity: ENTITY,
    trade: TRADE,
    client: "OC 4021 (Body Corporate) — c/- Whitton Property",
    address: "212 Glen Eira Rd, Caulfield VIC",
    scope: "Common-area riser leak, unit 6 — insurer ref CL-88213",
    status: "in progress",
    timeEntries: [],
    photos: [],
    signature: null,
  },
];

const seedQuotes = [
  {
    id: "Q-2091",
    entity: ENTITY,
    trade: TRADE,
    client: "Danny Petrakis",
    address: "22 Kambrook Rd, Caulfield South VIC",
    description: "Reroute stormwater drain around new deck footing",
    lines: [
      { id: 1, desc: "Labour — excavation & pipe relay", qty: 6, unit: "hr", rate: 145 },
      { id: 2, desc: "100mm PVC stormwater pipe", qty: 8, unit: "m", rate: 18 },
      { id: 3, desc: "Site call-out", qty: 1, unit: "ea", rate: 85 },
    ],
    status: "draft",
    signature: null,
  },
];

function useTimer(running, startedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!running || !startedAt) return 0;
  return Math.floor((now - startedAt) / 1000);
}

function fmtDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function totalBilledSeconds(job) {
  return job.timeEntries.reduce((sum, e) => sum + (e.end ? (e.end - e.start) / 1000 : 0), 0);
}

function quoteSubtotal(quote) {
  return quote.lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
}

function SignaturePad({ onSave, confirmLabel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e) => {
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1C2B39";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawn(true);
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={140}
        className="w-full bg-white border-2 border-dashed border-slate-300 rounded-lg touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex gap-2 mt-2">
        <button onClick={clear} className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50">
          Clear
        </button>
        <button
          onClick={() => hasDrawn && onSave(canvasRef.current.toDataURL())}
          disabled={!hasDrawn}
          className="text-xs px-3 py-1.5 rounded-md bg-[#1C2B39] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0f1a24]"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export default function PlumbTrack() {
  const [jobs, setJobs] = useState(seedJobs);
  const [quotes, setQuotes] = useState(seedQuotes);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("jobs"); // jobs | quotes (only relevant on list view)
  const [view, setView] = useState("list"); // list | job | signoff | invoice | quote | quoteSignoff
  const [clientName, setClientName] = useState("");

  const job = jobs.find((j) => j.id === activeId);
  const quote = quotes.find((q) => q.id === activeId);

  const running = job?.timeEntries.some((e) => !e.end) || false;
  const startedAt = running ? job.timeEntries[job.timeEntries.length - 1].start : null;
  const liveSeconds = useTimer(running, startedAt);
  const billedSeconds = job ? totalBilledSeconds(job) + (running ? liveSeconds : 0) : 0;

  const updateJob = (id, fn) => setJobs((prev) => prev.map((j) => (j.id === id ? fn(j) : j)));
  const updateQuote = (id, fn) => setQuotes((prev) => prev.map((q) => (q.id === id ? fn(q) : q)));

  const openJob = (id) => {
    setActiveId(id);
    setView("job");
    updateJob(id, (j) => (j.status === "scheduled" ? { ...j, status: "in progress" } : j));
  };
  const openQuote = (id) => {
    setActiveId(id);
    setView("quote");
  };

  const toggleClock = () => {
    updateJob(activeId, (j) => {
      const entries = [...j.timeEntries];
      if (running) entries[entries.length - 1] = { ...entries[entries.length - 1], end: Date.now() };
      else entries.push({ start: Date.now(), end: null });
      return { ...j, timeEntries: entries };
    });
  };

  const addPhoto = (label) => {
    updateJob(activeId, (j) => ({
      ...j,
      photos: [...j.photos, { id: Date.now(), label, ts: new Date().toLocaleString("en-AU") }],
    }));
  };

  const saveSignature = (dataUrl) => {
    updateJob(activeId, (j) => ({ ...j, signature: dataUrl, status: "completed", client: clientName || j.client }));
    setView("invoice");
  };

  // --- Quote line editing ---
  const addLine = () => {
    updateQuote(activeId, (q) => ({
      ...q,
      lines: [...q.lines, { id: Date.now(), desc: "New item", qty: 1, unit: "ea", rate: 0 }],
    }));
  };
  const updateLine = (lineId, field, value) => {
    updateQuote(activeId, (q) => ({
      ...q,
      lines: q.lines.map((l) => (l.id === lineId ? { ...l, [field]: field === "desc" || field === "unit" ? value : Number(value) } : l)),
    }));
  };
  const removeLine = (lineId) => {
    updateQuote(activeId, (q) => ({ ...q, lines: q.lines.filter((l) => l.id !== lineId) }));
  };
  const sendQuote = () => {
    updateQuote(activeId, (q) => ({ ...q, status: "sent" }));
    setView("quoteSignoff");
  };
  const acceptQuote = (dataUrl) => {
    updateQuote(activeId, (q) => ({ ...q, status: "accepted", signature: dataUrl }));
    // Convert accepted quote into a scheduled job
    const newJobId = "J-" + Math.floor(1000 + Math.random() * 9000);
    setJobs((prev) => [
      ...prev,
      {
        id: newJobId,
        client: clientName || quote.client,
        address: quote.address,
        scope: quote.description,
        status: "scheduled",
        timeEntries: [],
        photos: [],
        signature: null,
      },
    ]);
    setActiveId(null);
    setTab("jobs");
    setView("list");
    setClientName("");
  };

  const laborTotal = job ? Math.max(1, billedSeconds / 3600) * RATE_STANDARD : 0;
  const invoiceTotal = laborTotal + CALLOUT_FEE;
  const quoteTotalExGst = quote ? quoteSubtotal(quote) : 0;

  const headerLabel = () => {
    if (view === "list") return tab === "jobs" ? "Today's jobs" : "Quotes";
    if (view === "job") return job?.id;
    if (view === "signoff") return "Work complete";
    if (view === "invoice") return "Invoice preview";
    if (view === "quote") return quote?.id;
    if (view === "quoteSignoff") return "Quote approval";
    return "";
  };

  return (
    <div className="max-w-md mx-auto bg-[#F7F5F1] min-h-[640px] rounded-2xl overflow-hidden shadow-xl border border-slate-200">
      <div className="bg-[#1C2B39] text-white px-4 py-3 flex items-center gap-2">
        {view !== "list" ? (
          <button
            onClick={() => setView(view === "job" || view === "quote" ? "list" : view === "quoteSignoff" ? "quote" : "job")}
            className="p-1 -ml-1 hover:bg-white/10 rounded"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Droplet size={18} className="text-[#E8871E]" />
        )}
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest text-[#E8871E] font-semibold leading-none mb-0.5">Caulfield South Plumbing</p>
          <p className="text-sm font-medium leading-none">{headerLabel()}</p>
        </div>
      </div>

      {view === "list" && (
        <>
          <div className="flex border-b border-slate-200 bg-white">
            <button
              onClick={() => setTab("jobs")}
              className={`flex-1 text-xs font-semibold uppercase tracking-wide py-3 flex items-center justify-center gap-1.5 ${
                tab === "jobs" ? "text-[#1C2B39] border-b-2 border-[#E8871E]" : "text-slate-400"
              }`}
            >
              <Wrench size={13} /> Jobs
            </button>
            <button
              onClick={() => setTab("quotes")}
              className={`flex-1 text-xs font-semibold uppercase tracking-wide py-3 flex items-center justify-center gap-1.5 ${
                tab === "quotes" ? "text-[#1C2B39] border-b-2 border-[#E8871E]" : "text-slate-400"
              }`}
            >
              <ClipboardList size={13} /> Quotes
            </button>
          </div>

          <div className="p-4 space-y-3">
            {tab === "jobs" &&
              jobs.map((j) => (
                <button key={j.id} onClick={() => openJob(j.id)} className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-[#E8871E] transition">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-mono text-slate-400">{j.id}</span>
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${
                      j.status === "completed" ? "bg-emerald-100 text-emerald-700" : j.status === "in progress" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {j.status}
                    </span>
                  </div>
                  <p className="font-semibold text-[#1C2B39]">{j.client}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {j.address}</p>
                  <p className="text-sm text-slate-600 mt-2">{j.scope}</p>
                </button>
              ))}

            {tab === "quotes" &&
              quotes.map((q) => (
                <button key={q.id} onClick={() => openQuote(q.id)} className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-[#E8871E] transition">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-mono text-slate-400">{q.id}</span>
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${
                      q.status === "accepted" ? "bg-emerald-100 text-emerald-700" : q.status === "sent" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {q.status}
                    </span>
                  </div>
                  <p className="font-semibold text-[#1C2B39]">{q.client}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {q.address}</p>
                  <p className="text-sm text-slate-600 mt-2">{q.description}</p>
                  <p className="text-sm font-semibold text-[#1C2B39] mt-2">${(quoteSubtotal(q) * 1.1).toFixed(2)} inc. GST</p>
                </button>
              ))}
          </div>
        </>
      )}

      {/* QUOTE BUILDER */}
      {view === "quote" && quote && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-[#1C2B39]">{quote.client}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 mb-2"><MapPin size={11} /> {quote.address}</p>
            <p className="text-sm text-slate-600">{quote.description}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Line items</p>
            <div className="space-y-2">
              {quote.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5">
                  <input
                    value={l.desc}
                    onChange={(e) => updateLine(l.id, "desc", e.target.value)}
                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5"
                  />
                  <input
                    type="number"
                    value={l.qty}
                    onChange={(e) => updateLine(l.id, "qty", e.target.value)}
                    className="w-12 text-xs border border-slate-200 rounded px-1.5 py-1.5 text-center"
                  />
                  <span className="text-[10px] text-slate-400 w-6">{l.unit}</span>
                  <span className="text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    value={l.rate}
                    onChange={(e) => updateLine(l.id, "rate", e.target.value)}
                    className="w-14 text-xs border border-slate-200 rounded px-1.5 py-1.5 text-center"
                  />
                  <button onClick={() => removeLine(l.id)} className="text-slate-300 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addLine} className="mt-3 text-xs flex items-center gap-1 text-[#0F6E56] font-medium">
              <Plus size={13} /> Add line item
            </button>

            <div className="border-t border-slate-200 mt-3 pt-3 text-sm space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (ex. GST)</span>
                <span>${quoteTotalExGst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs">
                <span>GST (10%)</span>
                <span>${(quoteTotalExGst * 0.1).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-[#1C2B39]">
                <span>Total</span>
                <span>${(quoteTotalExGst * 1.1).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={sendQuote}
            disabled={quote.lines.length === 0}
            className="w-full py-3 rounded-lg bg-[#0F6E56] text-white font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Send size={15} /> Send quote for client approval
          </button>
        </div>
      )}

      {/* QUOTE APPROVAL / SIGNOFF */}
      {view === "quoteSignoff" && quote && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Quote summary — {quote.id}</p>
            <p className="text-sm text-slate-700 mb-2">{quote.description}</p>
            <div className="text-sm space-y-1">
              {quote.lines.map((l) => (
                <div key={l.id} className="flex justify-between text-slate-600">
                  <span>{l.desc} × {l.qty}{l.unit}</span>
                  <span>${(l.qty * l.rate).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between font-semibold text-[#1C2B39] text-sm">
              <span>Total inc. GST</span>
              <span>${(quoteTotalExGst * 1.1).toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Client name (confirm)</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={quote.client}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#E8871E]"
            />
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Sign to approve this quote and schedule the job
            </label>
            <SignaturePad onSave={acceptQuote} confirmLabel="Approve quote" />
          </div>
        </div>
      )}

      {/* JOB / TIMER VIEW */}
      {view === "job" && job && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-[#1C2B39]">{job.client}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 mb-2"><MapPin size={11} /> {job.address}</p>
            <p className="text-sm text-slate-600">{job.scope}</p>
          </div>

          <div className="bg-[#1C2B39] rounded-xl p-5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Time on site (billable)</p>
            <p className="text-4xl font-mono text-white tabular-nums">{fmtDuration(Math.floor(billedSeconds))}</p>
            <button
              onClick={toggleClock}
              className={`mt-4 w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${running ? "bg-red-500 text-white" : "bg-[#E8871E] text-white"}`}
            >
              <Clock size={16} />
              {running ? "Clock off site" : "Clock on site"}
            </button>
            <p className="text-[10px] text-white/40 mt-2">GPS-verified at job address on clock-in</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Job photos ({job.photos.length})</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {job.photos.map((p) => (
                <div key={p.id} className="aspect-square bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400">
                  <Camera size={16} />
                  <span className="text-[9px] mt-1 px-1 text-center">{p.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => addPhoto("Before")} className="flex-1 text-xs py-2 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center gap-1">
                <Camera size={13} /> Add before
              </button>
              <button onClick={() => addPhoto("After")} className="flex-1 text-xs py-2 rounded-lg border border-slate-300 text-slate-600 flex items-center justify-center gap-1">
                <Camera size={13} /> Add after
              </button>
            </div>
          </div>

          <button
            onClick={() => setView("signoff")}
            disabled={job.photos.length === 0}
            className="w-full py-3 rounded-lg bg-[#0F6E56] text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check size={16} /> Proceed to client sign-off
          </button>
          {job.photos.length === 0 && (
            <p className="text-[11px] text-center text-slate-400 -mt-2">Add at least one photo to enable sign-off</p>
          )}
        </div>
      )}

      {/* JOB SIGNOFF VIEW */}
      {view === "signoff" && job && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Completion summary</p>
            <p className="text-sm text-slate-700 mb-2">{job.scope}</p>
            <div className="grid grid-cols-3 gap-2">
              {job.photos.map((p) => (
                <div key={p.id} className="aspect-square bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400">
                  <Camera size={14} />
                  <span className="text-[9px] mt-1">{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Client name (confirm)</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={job.client}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#E8871E]"
            />
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Sign to confirm work completed to satisfaction
            </label>
            <SignaturePad onSave={saveSignature} confirmLabel="Confirm client signature" />
          </div>
        </div>
      )}

      {/* INVOICE VIEW */}
      {view === "invoice" && job && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <Check size={20} />
            </div>
            <p className="font-semibold text-[#1C2B39]">Job signed off</p>
            <p className="text-xs text-slate-500">Completion report emailed to {job.client}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Invoice draft — {job.id}</p>
            <div className="text-sm space-y-2 text-slate-700">
              <div className="flex justify-between">
                <span>Callout fee</span>
                <span>${CALLOUT_FEE.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Labour · {fmtDuration(Math.floor(billedSeconds))} @ ${RATE_STANDARD}/hr</span>
                <span>${laborTotal.toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-200 my-2" />
              <div className="flex justify-between font-semibold text-[#1C2B39]">
                <span>Total (excl. GST)</span>
                <span>${invoiceTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>GST (10%)</span>
                <span>${(invoiceTotal * 0.1).toFixed(2)}</span>
              </div>
            </div>
            {job.signature && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-[10px] text-slate-400 mb-1">Client signature on file</p>
                <img src={job.signature} alt="Client signature" className="h-12 border border-slate-200 rounded bg-white" />
              </div>
            )}
          </div>

          <button
            onClick={() => { setActiveId(null); setView("list"); setClientName(""); }}
            className="w-full py-3 rounded-lg bg-[#1C2B39] text-white font-medium text-sm flex items-center justify-center gap-2"
          >
            <Send size={15} /> Sync to Xero and close job
          </button>
        </div>
      )}
    </div>
  );
}

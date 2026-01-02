import { useEffect, useState, useRef } from "react";
import Chat from "./components/Chat";
import ArrowRightIcon from "./components/icons/ArrowRightIcon";
import StopIcon from "./components/icons/StopIcon";
import Progress from "./components/Progress";

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;
const STICKY_SCROLL_THRESHOLD = 120;


const EXAMPLES = [
  "Triage: Patient with sudden chest pain and sweating.",
  "ABCDE assessment for an unconscious patient after a fall.",
  "Initial steps for a severe allergic reaction (Anaphylaxis).",
];

function App() {
  const worker = useRef(null);
  const textareaRef = useRef(null);
  const chatContainerRef = useRef(null);

  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [progressItems, setProgressItems] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [tps, setTps] = useState(null);
  const [numTokens, setNumTokens] = useState(null);
  const [extraPromptEnabled, setExtraPromptEnabled] = useState(false);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [extraPromptDraft, setExtraPromptDraft] = useState("");
  const [showExtraPromptModal, setShowExtraPromptModal] = useState(false);
  const [liveDashboardText, setLiveDashboardText] = useState("");
  const defaultInstruction = `You are PulseCopilot. Use ONLY the DASHBOARD STATE below.

Rules:
- No guessing. If missing, say "unknown".
- Staff assignments are authoritative ONLY from each bed's "Staff:" line.
- Ignore the staff roster for assignments; it is informational only.
- If the roster conflicts with the bed's Staff line, state: "Staff assignment conflict: bed says X, roster says Y."
- "occupied" means true; "not occupied" means false.
- Do not repeat the dashboard text.

Answer style:
- 1–3 short sentences max.
- Only add bullets if asked.
- Ask for missing data only if blocked.

If asked "most urgent":
- Only consider occupied beds.
- Abnormal vitals: SPO2 < 92, RR > 24, HR > 120, SBP < 90.
- Tie-breaker: triage rating (1 = most urgent), then longest time in bed.`;

  function getPulseDocument() {
    const iframe = document.getElementById("pulse");
    if (!iframe || !iframe.contentWindow) return null;
    return iframe.contentDocument || iframe.contentWindow.document;
  }

  function readWaitingArea(doc) {
    const cards = [...doc.querySelectorAll(".monitor-strip .card")];
    if (!cards.length) return [];
    return cards.map((card) => {
      const label = card.querySelector(".mon-tag")?.textContent?.trim() || "Unknown";
      const patientId = card.querySelector(".pid")?.textContent?.trim() || "—";
      const updated = card.querySelector(".updated")?.textContent?.trim() || "—";
      const metrics = {};
      card.querySelectorAll(".metric").forEach((metric) => {
        const labelNode = metric.querySelector(".k");
        const iconText = labelNode?.querySelector(".material-symbols-rounded")?.textContent || "";
        let labelText = labelNode?.textContent || "";
        labelText = labelText.replace(iconText, "").trim();
        const valueText = metric.querySelector(".v")?.textContent?.trim() || "—";
        if (labelText) metrics[labelText] = valueText;
      });
      const statusRow = card.querySelector(".status-row");
      const statusSpans = statusRow
        ? [...statusRow.querySelectorAll("span")]
            .filter((span) => !span.classList.contains("status-dot"))
            .map((span) => span.textContent?.trim())
            .filter(Boolean)
        : [];
      return {
        label,
        patientId,
        updated,
        metrics,
        status: statusSpans[0] || "—",
        note: statusSpans[1] || "—",
      };
    });
  }

  function readBedsSnapshot(doc) {
    const snapshotEl = doc.getElementById("bed-snapshot");
    if (!snapshotEl?.textContent) return [];
    try {
      const parsed = JSON.parse(snapshotEl.textContent);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readStaffRoster(doc) {
    const cards = [...doc.querySelectorAll("#doctorStrip .doctor-card")];
    return cards.map((card) => ({
      name: card.dataset.name || card.title || "Unknown",
      role: card.dataset.role || "Staff",
      status: card.dataset.status || "Unknown",
      bed: card.dataset.bed || "—",
    }));
  }

  function readConnectionStatus(doc) {
    const connText = doc.getElementById("connText")?.textContent?.trim();
    return connText || "Unknown";
  }

  function buildDashboardText() {
    const doc = getPulseDocument();
    if (!doc) return "Dashboard unavailable: Pulse iframe not ready.";

    const waiting = readWaitingArea(doc);
    const beds = readBedsSnapshot(doc);
    const staff = readStaffRoster(doc);
    const connection = readConnectionStatus(doc);
    const ts = new Date().toISOString();

    const waitingLines = waiting.length
      ? waiting.map((card) => {
          const metrics = Object.entries(card.metrics)
            .map(([key, val]) => `${key}: ${val}`)
            .join(", ");
          const note = card.note ? ` (${card.note})` : "";
          return `- ${card.label}: Patient ${card.patientId}; Updated ${card.updated}; ${metrics || "No vitals"}; Status ${card.status}${note}`;
        })
      : ["- No waiting area data."];

    const bedLines = beds.length
      ? beds.map((bed) => {
          const vitals = bed?.vitals || {};
          const vitalsText = [
            `HR ${vitals.hr ?? "—"}`,
            `SPO2 ${vitals.spo2 ?? "—"}`,
            `RR ${vitals.rr ?? "—"}`,
            `SBP ${vitals.sbp ?? "—"}`,
            `DBP ${vitals.dbp ?? "—"}`,
            `Temp ${vitals.temp ?? "—"}`,
          ].join(", ");
          const staffAssigned = Array.isArray(bed.staff_assigned) && bed.staff_assigned.length
            ? bed.staff_assigned.join(", ")
            : "No staff assigned";
          const occupiedText = bed.occupied ? "occupied" : "not occupied";
          return `- ${bed.label || bed.bed_id}: ${occupiedText}. Patient ${bed.patient_id || "—"}. Time in bed ${bed.time_in_bed_seconds ?? "—"}s. Vitals: ${vitalsText}. Triage ${bed.triage_rating_1_to_5 ?? "—"}. Prediction ${bed.prediction_text || "—"} at ${bed.prediction_ts_utc || "—"}. Staff: ${staffAssigned}.`;
        })
      : ["- No bed snapshot data."];

    const staffLines = staff.length
      ? staff.map((member) => {
          const rawName = member.name || "Unknown";
          const displayName = rawName.startsWith("Dr.") ? rawName : rawName;
          const assignment = member.bed && member.bed !== "—" ? `assigned to ${member.bed}` : "not assigned yet";
          const status = member.status === "Available" ? "available" : member.status.toLowerCase();
          return `- ${displayName} is ${status} and ${assignment}.`;
        })
      : ["- No staff roster data."];

    return [
      "DASHBOARD STATE (LIVE SNAPSHOT)",
      `Timestamp (UTC): ${ts}`,
      `Connection status: ${connection}`,
      "",
      "A) WAITING AREA — MONITORS",
      ...waitingLines,
      "",
      "B) BEDS — CURRENT STATUS",
      ...bedLines,
      "",
      "C) STAFF — ROSTER & ASSIGNMENTS",
      ...staffLines,
    ].join("\n");
  }

  function onEnter(message) {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setTps(null);
    setIsRunning(true);
    setInput("");
  }

  function onInterrupt() {
    worker.current.postMessage({ type: "interrupt" });
  }

  function onReset() {
    setMessages([]);
    setTps(null);
    setNumTokens(null);
    setIsRunning(false);
    setInput("");
    worker.current?.postMessage({ type: "reset" });
  }

  function onToggleExtraPrompt() {
    if (extraPromptEnabled) {
      setExtraPromptEnabled(false);
      return;
    }
    setExtraPromptDraft(extraPrompt);
    setShowExtraPromptModal(true);
  }

  useEffect(() => {
    resizeInput();
  }, [input]);

  useEffect(() => {
    if (!showExtraPromptModal) return;
    const update = () => setLiveDashboardText(buildDashboardText());
    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [showExtraPromptModal]);

  function resizeInput() {
    if (!textareaRef.current) return;
    const target = textareaRef.current;
    target.style.height = "auto";
    const newHeight = Math.min(Math.max(target.scrollHeight, 24), 200);
    target.style.height = `${newHeight}px`;
  }

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
      worker.current.postMessage({ type: "check" });
    }

    const onMessageReceived = (e) => {
      switch (e.data.status) {
        case "loading":
          setStatus("loading");
          setLoadingMessage(e.data.data);
          break;
        case "initiate":
          setProgressItems((prev) => [...prev, e.data]);
          break;
        case "progress":
          setProgressItems((prev) =>
            prev.map((item) => (item.file === e.data.file ? { ...item, ...e.data } : item))
          );
          break;
        case "done":
          setProgressItems((prev) => prev.filter((item) => item.file !== e.data.file));
          break;
        case "ready":
          setStatus("ready");
          break;
        case "start":
          setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
          break;
        case "update":
          const { output, tps, numTokens } = e.data;
          setTps(tps);
          setNumTokens(numTokens);
          setMessages((prev) => {
            const cloned = [...prev];
            const last = cloned.at(-1);
            cloned[cloned.length - 1] = { ...last, content: last.content + output };
            return cloned;
          });
          break;
        case "complete":
          setIsRunning(false);
          break;
        case "error":
          setError(e.data.data);
          break;
      }
    };

    worker.current.addEventListener("message", onMessageReceived);
    return () => worker.current.removeEventListener("message", onMessageReceived);
  }, []);

  useEffect(() => {
    if (messages.filter((x) => x.role === "user").length === 0) return;
    if (messages.at(-1).role === "assistant") return;
    const shouldAttach = extraPromptEnabled;
    const dashboardText = shouldAttach ? buildDashboardText() : "";
    const promptHead = extraPrompt.trim() || defaultInstruction;
    const promptPieces = [promptHead, dashboardText].filter(Boolean);
    const finalMessages = shouldAttach && promptPieces.length
      ? [{ role: "system", content: promptPieces.join("\n\n") }, ...messages]
      : messages;
    worker.current.postMessage({ type: "generate", data: finalMessages });
  }, [messages, isRunning]);

  useEffect(() => {
    if (!chatContainerRef.current || !isRunning) return;
    const element = chatContainerRef.current;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < STICKY_SCROLL_THRESHOLD) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, isRunning]);

  return IS_WEBGPU_AVAILABLE ? (
    <div className="flex flex-col h-screen mx-auto justify-end text-gray-800 bg-[#F3F1EC] shadow-[-18px_0_35px_rgba(255,255,255,0.7)]">
      {status === null && messages.length === 0 && (
        <div className="h-full overflow-auto flex justify-center items-center flex-col relative">
          <div className="flex flex-col items-center mb-1 max-w-[400px] text-center">
            {/* أيقونة طبية بسيطة أو لوجو */}
            <img
              src="/logo.png"
              alt="ER Assistant logo"
              className="w-40 h-40 mb-4"
            />
            <h1 className="text-4xl font-bold mb-1 text-[#4F8DF6]">ER Assistant</h1>
            <h2 className="font-semibold px-4 text-[#2F3C55] drop-shadow-[0_1px_6px_rgba(255,255,255,0.75)]">
              AI-Powered Support for Emergency Room Physicians.
              <br/><span className="text-sm font-normal text-[#4E5B74] drop-shadow-[0_1px_6px_rgba(255,255,255,0.75)]">Optimized for rapid triage and ABCDE protocols.</span>
            </h2>
          </div>
          <div className="flex flex-col items-center px-4">
            <p className="max-w-[480px] mb-4 text-sm text-center text-[#4E5B74] drop-shadow-[0_1px_6px_rgba(255,255,255,0.75)]">
              This tool runs <b>locally</b> on your device via WebGPU. 
              Patient data never leaves this browser.
            </p>
            <button
              className="border border-white/50 px-6 py-3 rounded-lg bg-[#4F8DF6]/85 text-white shadow-[0_8px_24px_rgba(79,141,246,0.35)] hover:bg-[#3A7AE6]/90 hover:shadow-[0_10px_28px_rgba(79,141,246,0.4)] disabled:bg-gray-300 select-none font-bold backdrop-blur-md"
              onClick={() => {
                worker.current.postMessage({ type: "load" });
                setStatus("loading");
              }}
              disabled={status !== null || error !== null}
            >
              Initialize ER Assistant
            </button>
          </div>
        </div>
      )}
      {status === "loading" && (
        <div className="w-full max-w-[500px] mx-auto p-4 mt-auto">
          <p className="text-center mb-2 font-medium">Preparing Clinical Database...</p>
          {progressItems.map(({ file, progress, total }, i) => (
            <Progress key={i} text={file} percentage={progress} total={total} />
          ))}
        </div>
      )}
      {status === "ready" && (
        <div ref={chatContainerRef} className="overflow-y-auto w-full flex flex-col items-center h-full pt-8">
          <Chat messages={messages} />
          {messages.length === 0 && (
            <div className="grid grid-cols-1 gap-2 max-w-[500px] w-full px-4">
              <p className="text-center text-gray-500 mb-2">Select a scenario to start:</p>
              {EXAMPLES.map((msg, i) => (
                <div
                  key={i}
                  className="border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  onClick={() => onEnter(msg)}
                >
                  {msg}
                </div>
              ))}
            </div>
          )}
          {/* إحصائيات الأداء */}
          <div className="p-4 text-xs text-gray-400">
             {tps && (
              <button
                type="button"
                onClick={onReset}
                className="text-gray-400 hover:text-[#3A7AE6] hover:underline transition"
              >
                {`Speed: ${tps.toFixed(2)} tokens/sec • click to reset`}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-2 border dark:bg-gray-800 rounded-lg w-[600px] max-w-[90%] mx-auto relative mb-3 flex shadow-lg">
        <textarea
          ref={textareaRef}
          className="w-full dark:bg-gray-800 px-4 py-4 rounded-lg bg-transparent border-none outline-none resize-none"
          placeholder="Describe patient symptoms (e.g., Male, 45y, chest pain)..."
          rows={1}
          value={input}
          disabled={status !== "ready"}
          onKeyDown={(e) => {
            if (input.length > 0 && !isRunning && e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onEnter(input);
            }
          }}
          onInput={(e) => setInput(e.target.value)}
        />
        <div className="flex items-center pr-3">
            <button
              type="button"
              onClick={onToggleExtraPrompt}
              disabled={status !== "ready" || isRunning}
              title="Extra prompt"
              className={`mr-2 h-8 w-8 rounded-md border border-white/70 grid place-items-center shadow-[inset_0_1px_6px_rgba(255,255,255,0.7)] transition ${
                extraPromptEnabled
                  ? "bg-[#dbe9ff]/80 text-[#2b4c78]"
                  : "bg-white/60 text-gray-400 hover:bg-[#e9f1ff]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px] leading-none">dashboard_2_gear</span>
            </button>
            {isRunning ? (
              <StopIcon className="h-8 w-8 cursor-pointer text-[#F6B36B]" onClick={onInterrupt} />
            ) : (
              <ArrowRightIcon 
                className={`h-8 w-8 p-1 rounded-md ${input.length > 0 ? 'bg-[#F6B36B] text-white' : 'bg-gray-200 text-gray-400'}`} 
                onClick={() => input.length > 0 && onEnter(input)} 
              />
            )}
        </div>
      </div>
      <p className="text-[10px] text-gray-400 text-center mb-3 px-4">
        NOTICE: This AI is a supportive tool for healthcare professionals. Final clinical decisions must be made by a qualified physician.
      </p>
      {showExtraPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-[640px] rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.25)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-[#2F3C55]">Extra system prompt</h3>
              <button
                type="button"
                onClick={() => setShowExtraPromptModal(false)}
                className="h-9 w-9 rounded-full border border-white/70 bg-white/70 text-gray-600 hover:bg-white"
                title="Close"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-[#4E5B74]">
              This text is prepended to every message while the toggle is on.
            </p>
            <textarea
              className="mt-3 h-40 w-full resize-none rounded-xl border border-white/60 bg-white/70 p-3 text-sm text-[#2F3C55] outline-none"
              placeholder="Paste the prompt you want to prepend."
              value={extraPromptDraft}
              onChange={(e) => setExtraPromptDraft(e.target.value)}
            />
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#4E5B74]">
                Live dashboard prompt
              </div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-white/60 bg-white/70 p-3 text-[11px] leading-relaxed text-[#2F3C55] whitespace-pre-wrap">
                {liveDashboardText || "Waiting for dashboard data..."}
              </pre>
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#4E5B74]">
                Full system prompt preview
              </div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-white/60 bg-white/70 p-3 text-[11px] leading-relaxed text-[#2F3C55] whitespace-pre-wrap">
                {[
                  extraPromptDraft.trim(),
                  liveDashboardText,
                ]
                  .filter(Boolean)
                  .join("\n\n") || "Add an extra prompt to see the full preview."}
              </pre>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExtraPromptModal(false)}
                className="rounded-lg border border-white/70 bg-white/70 px-4 py-2 text-sm font-semibold text-[#4E5B74]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setExtraPrompt(extraPromptDraft);
                  setExtraPromptEnabled(true);
                  setShowExtraPromptModal(false);
                }}
                className="rounded-lg bg-[#4F8DF6] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,141,246,0.35)]"
              >
                Save & Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="fixed w-screen h-screen bg-black text-white flex justify-center items-center text-center p-10">
      WebGPU is not supported by this browser. Please use Chrome or Edge.
    </div>
  );
}

export default App;

import React, { useMemo, useState, useEffect, useRef, memo, useCallback } from "react";

/**
 * 🎯 Sorteio Ao Vivo — App.tsx (TypeScript + React)
 * - Abas: Principal | Cadastro Participante | Cadastro Prêmio | Sorteio | Auditoria
 * - Palco dentro da aba Sorteio
 * - Visual responsivo via index.css
 * - Cadastro/importação de participantes (bloqueio de duplicados insensitive)
 * - Cadastro de prêmios e ordem
 * - Sorteio por cupom (quem ganha não volta)
 * - Contagem regressiva + roleta
 * - Confete
 * - Auditoria (CSV / Excel .xls)
 * - FIX foco: inputs não-controlados (refs) e edição por linha com onBlur
 */

type Participant = { name: string; qty: number };
type Prize = { name: string; order: number };
type Winner = { name: string; couponNumber: number; prize: string; ts: string };
type AuditRow = {
  Data: string;
  Hora: string;
  Participante: string;
  Cupom: number | string;
  "Qtde Cupons": number;
  Prêmio: string;
};

function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

function downloadCSV(filename: string, rows: Array<Record<string, any>>) {
  const headers = Object.keys(
    rows[0] || { Data: "", Hora: "", Cupom: "", Participante: "", "Qtde Cupons": "", Prêmio: "" }
  );
  const escape = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => escape((r as any)[h])).join(",")))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(filename: string, rows: Array<Record<string, any>>) {
  const headers = Object.keys(
    rows[0] || { Data: "", Hora: "", Cupom: "", Participante: "", "Qtde Cupons": "", Prêmio: "" }
  );
  const html =
    "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body><table border='1'>" +
    `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>` +
    rows
      .map(
        (r) =>
          `<tr>${headers
            .map((h) => `<td>${String((r as any)[h] ?? "")}</td>`)
            .join("")}</tr>`
      )
      .join("") +
    "</table></body></html>";
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

// 🎊 Confete simples
function launchConfetti() {
  const colors = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#22d3ee"];
  const count = 140;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    el.style.width = 6 + Math.random() * 8 + "px";
    el.style.height = 8 + Math.random() * 10 + "px";
    el.style.transform = `translateY(-100vh) rotate(${Math.random() * 360}deg)`;
    el.style.zIndex = "60";
    el.style.position = "fixed";
    el.style.top = "-10px";
    el.style.opacity = "0.95";
    // @ts-ignore
    el.style.animationName = "confetti-fall";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
}

const TABS = [
  { key: "principal", label: "Principal" },
  { key: "cad_part", label: "Cadastro Participante" },
  { key: "cad_premio", label: "Cadastro Prêmio" },
  { key: "sorteio", label: "Sorteio" },
  { key: "auditoria", label: "Auditoria" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ────────────────────────────────────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [participants, setParticipants] = useLocalStorage<Participant[]>("sv_participants", []);
  const [prizes, setPrizes] = useLocalStorage<Prize[]>("sv_prizes", []);
  const [winners, setWinners] = useLocalStorage<Winner[]>("sv_winners", []);
  const [audit, setAudit] = useLocalStorage<AuditRow[]>("sv_audit", []);
  const [presenterMode, setPresenterMode] = useLocalStorage<boolean>("sv_presenter", false);
  const [highlight, setHighlight] = useState<Winner | null>(null);
  const [tab, setTab] = useLocalStorage<TabKey>("sv_tab", "sorteio");

  // REFs (inputs não-controlados)
  const pNameRef = useRef<HTMLInputElement | null>(null);
  const pQtyRef = useRef<HTMLInputElement | null>(null);
  const bulkRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const prizeNameRef = useRef<HTMLInputElement | null>(null);

  // busca derivada do ref
  const [search, setSearch] = useState("");
  const applySearchFromRef = useCallback(
    () => setSearch((searchRef.current?.value || "").trim()),
    []
  );

  const [countdown, setCountdown] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [rollView, setRollView] = useState<{ name: string; couponNumber: number | string }>({
    name: "",
    couponNumber: "",
  });
  const rollTimerRef = useRef<number | null>(null);

  // Dados derivados
  const totalCoupons = useMemo(
    () => participants.reduce((sum, p) => sum + (p.qty || 0), 0),
    [participants]
  );
  const winnersSet = useMemo(
    () => new Set(winners.map((w) => (w.name || "").toLowerCase())),
    [winners]
  );
  const remainingPrizes = useMemo(
    () => prizes.filter((pr) => !winners.some((w) => w.prize === pr.name)),
    [prizes, winners]
  );
  const couponsPool = useMemo(() => {
    const pool: Array<{ name: string; couponNumber: number }> = [];
    for (const p of participants) {
      if (winnersSet.has((p.name || "").toLowerCase())) continue;
      const qty = Math.max(0, Number(p.qty) || 0);
      for (let i = 1; i <= qty; i++) pool.push({ name: p.name, couponNumber: i });
    }
    return pool;
  }, [participants, winnersSet]);

  // Limpeza do timer
  useEffect(() => {
    return () => {
      if (rollTimerRef.current) window.clearInterval(rollTimerRef.current);
    };
  }, []);

  // Utils
  const addParticipant = useCallback(() => {
    const name = (pNameRef.current?.value || "").trim();
    const qty = Number(pQtyRef.current?.value || "");
    if (!name || !Number.isFinite(qty) || qty <= 0) return;

    setParticipants((prev) => {
      const exists = prev.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
      if (exists) {
        alert("Este nome já está cadastrado (sem duplicados, independente de maiúsculas/minúsculas).");
        return prev;
      }
      return [...prev, { name, qty }];
    });
    if (pNameRef.current) pNameRef.current.value = "";
    if (pQtyRef.current) pQtyRef.current.value = "";
    pNameRef.current?.focus();
  }, [setParticipants]);

  const editParticipantQty = useCallback(
    (name: string, newQty: string) => {
      const qty = Math.max(0, Number(newQty) || 0);
      setParticipants((prev) => prev.map((p) => (p.name === name ? { ...p, qty } : p)));
    },
    [setParticipants]
  );

  const removeParticipant = useCallback(
    (name: string) => setParticipants((prev) => prev.filter((p) => p.name !== name)),
    [setParticipants]
  );

  const bulkImport = useCallback(() => {
    const raw = bulkRef.current?.value || "";
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const lowerExisting = new Set(participants.map((p) => (p.name || "").toLowerCase()));
    const toAdd: Participant[] = [];
    let skipped = 0;

    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
      const name = parts[0] || "";
      const qty = Number(parts[1] || "0");
      if (!name || !Number.isFinite(qty) || qty <= 0) {
        skipped++;
        continue;
      }
      const key = name.toLowerCase();
      if (lowerExisting.has(key) || toAdd.some((x) => x.name.toLowerCase() === key)) {
        skipped++;
        continue;
      }
      toAdd.push({ name, qty });
    }

    setParticipants((prev) => [...prev, ...toAdd]);
    if (bulkRef.current) bulkRef.current.value = "";
    if (skipped) alert(`${skipped} linha(s) ignorada(s) (inválidas ou nome duplicado).`);
  }, [participants, setParticipants]);

  const addPrize = useCallback(() => {
    const nm = (prizeNameRef.current?.value || "").trim();
    if (!nm) return;
    setPrizes((prev) => [...prev, { name: nm, order: prev.length + 1 }]);
    if (prizeNameRef.current) prizeNameRef.current.value = "";
    prizeNameRef.current?.focus();
  }, [setPrizes]);

  const removePrize = useCallback(
    (name: string) => {
      setPrizes((prev) => prev.filter((p) => p.name !== name).map((p, i) => ({ ...p, order: i + 1 })));
    },
    [setPrizes]
  );

  const resetWinners = useCallback(() => {
    setWinners([]);
    setHighlight(null);
  }, [setWinners]);

  const hardReset = useCallback(() => {
    if (!confirm("Zerar tudo? Participantes, prêmios e auditoria serão apagados.")) return;
    setParticipants([]);
    setPrizes([]);
    setWinners([]);
    setAudit([]);
    setHighlight(null);
  }, [setParticipants, setPrizes, setWinners, setAudit]);

  const drawCore = useCallback(() => {
    // leitura atual do pool e prêmios
    const currentPool = (() => {
      const pool: Array<{ name: string; couponNumber: number }> = [];
      for (const p of participants) {
        if (winnersSet.has((p.name || "").toLowerCase())) continue;
        const qty = Math.max(0, Number(p.qty) || 0);
        for (let i = 1; i <= qty; i++) pool.push({ name: p.name, couponNumber: i });
      }
      return pool;
    })();
    const currentRemaining = prizes.filter((pr) => !winners.some((w) => w.prize === pr.name));

    if (!currentPool.length) {
      alert("Sem cupons elegíveis (ou todos já ganharam).");
      return null;
    }
    if (!currentRemaining.length) {
      alert("Sem prêmios restantes.");
      return null;
    }

    const idx = Math.floor(Math.random() * currentPool.length);
    const pick = currentPool[idx];
    const prize = currentRemaining[0];
    const now = new Date();
    const win: Winner = {
      name: pick.name,
      couponNumber: pick.couponNumber,
      prize: prize.name,
      ts: now.toISOString(),
    };

    setWinners((prev) => [...prev, win]);
    setAudit((prev) => [
      ...prev,
      {
        Data: now.toLocaleDateString(),
        Hora: now.toLocaleTimeString(),
        Cupom: pick.couponNumber,
        Participante: pick.name,
        "Qtde Cupons": (participants.find((p) => p.name === pick.name)?.qty || 0) as number,
        Prêmio: prize.name,
      },
    ]);
    setHighlight(win);
    launchConfetti();
    return win;
  }, [participants, prizes, winners, winnersSet, setWinners, setAudit]);

  const draw = useCallback(() => {
    if (rolling || countdown) return;
    drawCore();
  }, [drawCore, rolling, countdown]);

  const drawWithCountdown = useCallback(async () => {
    if (rolling || countdown) return;
    const hasPool = couponsPool.length > 0;
    const hasPrize = remainingPrizes.length > 0;
    if (!hasPool || !hasPrize) return drawCore();

    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 700));
    }
    setCountdown(0);

    setRolling(true);
    if (rollTimerRef.current) window.clearInterval(rollTimerRef.current);
    rollTimerRef.current = window.setInterval(() => {
      const currentPool = (() => {
        const pool: Array<{ name: string; couponNumber: number }> = [];
        for (const p of participants) {
          if (winnersSet.has((p.name || "").toLowerCase())) continue;
          const qty = Math.max(0, Number(p.qty) || 0);
          for (let i = 1; i <= qty; i++) pool.push({ name: p.name, couponNumber: i });
        }
        return pool;
      })();
      if (!currentPool.length) return;
      const idx = Math.floor(Math.random() * currentPool.length);
      const pick = currentPool[idx];
      setRollView({ name: pick.name, couponNumber: pick.couponNumber });
    }, 80);

    await new Promise((r) => setTimeout(r, 1800));
    setRolling(false);
    if (rollTimerRef.current) window.clearInterval(rollTimerRef.current);
    rollTimerRef.current = null;
    drawCore();
  }, [participants, winnersSet, drawCore, couponsPool.length, remainingPrizes.length, rolling, countdown]);

  const exportAudit = useCallback(() => {
    if (!audit.length) return alert("Sem registros para exportar.");
    downloadCSV(`auditoria-${new Date().toISOString().slice(0, 10)}.csv`, audit as any);
  }, [audit]);
  const exportExcel = useCallback(() => {
    if (!audit.length) return alert("Sem registros para exportar.");
    downloadExcel(`auditoria-${new Date().toISOString().slice(0, 10)}.xls`, audit as any);
  }, [audit]);

  // KPIs
  const Stat = memo<{ label: string; value: React.ReactNode }>(({ label, value }) => (
    <div className="kpi" role="status" aria-live="polite">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ));
  Stat.displayName = "Stat";

  // Cabeçalho
  const Header = memo(() => (
    <div className="flex-col gap-2 header">
      <h1 className="h1">🎯 Sorteio Grupo Lukma</h1>
      <p className="muted"></p>
    </div>
  ));
  Header.displayName = "Header";

  // Strip de logos (entre o título e os KPIs)
const LogoStrip = memo(() => {
  const base = import.meta.env.BASE_URL || "/";
  return (
    <div className="logos-strip" aria-label="Logos">
      <span className="logo-badge">
        <img src={`${base}lukma.png`} alt="Lukma" />
      </span>
      <span className="logo-badge">
        <img src={`${base}lukbox.png`} alt="Lukbox" />
      </span>
    </div>
  );
});


  // Overlays
  const WinnerOverlay = () =>
    highlight ? (
      <div className="overlay" onClick={() => setHighlight(null)} role="dialog" aria-modal="true">
        <div className="winner-modal">
          <div className="muted small">Ganhador do prêmio</div>
          <div className="winner-prize">{highlight.prize}</div>
          <div className="muted">Clique para fechar</div>
          <div className="winner-name">{highlight.name}</div>
          <div className="winner-coupon">
            Cupom Nº <span>{String(highlight.couponNumber).padStart(2, "0")}</span>
          </div>
          <div className="muted small">* O vencedor não participa dos próximos sorteios.</div>
        </div>
      </div>
    ) : null;

  const Tabs = () => (
    <div className="tabs" role="tablist" aria-label="Abas do sistema">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`tab ${tab === t.key ? "active" : ""}`}
          role="tab"
          aria-selected={tab === t.key}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const CountdownOverlay = () =>
    countdown ? (
      <div className="countdown" aria-live="assertive">
        <div className="countdown-number">{countdown}</div>
      </div>
    ) : null;

  const RollingOverlay = () =>
    rolling ? (
      <div className="rolling">
        <div className="text-slate-300 mb-2">Sorteando...</div>
        <div className="rolling-name">{rollView.name || ""}</div>
        <div className="rolling-coupon">Cupom Nº {String(rollView.couponNumber || "").padStart(2, "0")}</div>
      </div>
    ) : null;

  // Linha de participante
  type RowProps = {
    p: Participant;
    onEdit: (name: string, value: string) => void;
    onRemove: (name: string) => void;
  };
  const ParticipantRow = memo<RowProps>(({ p, onEdit, onRemove }) => {
    const [localQty, setLocalQty] = useState<string>(String(p.qty));
    useEffect(() => {
      setLocalQty(String(p.qty));
    }, [p.qty, p.name]);

    return (
      <div className="card item row-between">
        <div className="min-w-0">
          <div className="font-medium truncate">{p.name}</div>
          <div className="muted small">Cupons: 1 — {p.qty}</div>
        </div>
        <div className="row gap">
          <input
            value={localQty}
            onChange={(e) => setLocalQty(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => onEdit(p.name, localQty)}
            className="input smallw"
            inputMode="numeric"
          />
          <button onClick={() => onRemove(p.name)} className="btn btn-danger">
            remover
          </button>
        </div>
      </div>
    );
  });
  ParticipantRow.displayName = "ParticipantRow";

  // Abas
  const AbaPrincipal = () => (
    <div className="grid-2">
      <div className="card">
        <h2 className="title">Concorrentes</h2>
        <div className="scroll-list">
          {participants
            .slice()
            .sort((a, b) => (b.qty || 0) - (a.qty || 0))
            .map((p) => (
              <div key={p.name} className="card item">
                <div className="row">
                  <div className="font-medium">{p.name}</div>
                  <div className="muted small">{p.qty} cupom(ns)</div>
                </div>
                <div className="progress">
                  <div
                    className="bar"
                    style={{ width: `${Math.min(100, (p.qty / Math.max(1, totalCoupons)) * 100)}%` }}
                  />
                </div>
                <div className="muted small">Cupons: 1 — {p.qty}</div>
              </div>
            ))}
          {!participants.length && <div className="muted small">Sem participantes cadastrados.</div>}
        </div>
      </div>

      <div className="card">
        <h2 className="title">Prêmios</h2>
        <ol className="scroll-list list">
          {prizes.map((pr) => (
            <li key={pr.order} className="small">
              {pr.order}º — {pr.name}
            </li>
          ))}
          {!prizes.length && <div className="muted small">Nenhum prêmio cadastrado.</div>}
        </ol>
      </div>
    </div>
  );

  const AbaCadParticipante = () => {
    const filtered = participants.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return (
      <div className="grid-2">
        <div className="card">
          <h2 className="title">Cadastro de participante</h2>
          <div className="form-grid">
            <input ref={pNameRef} placeholder="Nome" className="input" />
            <input ref={pQtyRef} placeholder="Qtde cupons" className="input" inputMode="numeric" />
            <button onClick={addParticipant} className="btn btn-primary">
              Adicionar
            </button>
          </div>

          <div className="mt-6">
            <h3 className="font-medium mb-2">Importar em massa</h3>
            <textarea
              ref={bulkRef}
              className="textarea"
              placeholder={"Cole linhas no formato:\nRafael,30\nJuliana,12"}
            />
            <div className="actions row gap">
              <button onClick={bulkImport} className="btn btn-primary alt">
                Importar
              </button>
              <button
                onClick={() => {
                  if (bulkRef.current) bulkRef.current.value = "";
                }}
                className="btn btn-ghost"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="row-between mb-3">
            <h2 className="title">Participantes cadastrados</h2>
          </div>
          <div className="scroll-list">
            {filtered.map((p) => (
              <ParticipantRow key={p.name} p={p} onEdit={editParticipantQty} onRemove={removeParticipant} />
            ))}
            {!participants.length && <div className="muted small">Sem participantes cadastrados.</div>}
          </div>
        </div>
      </div>
    );
  };

  const AbaCadPremio = () => (
    <div className="grid-2">
      <div className="card">
        <h2 className="title">Cadastro de prêmio</h2>
        <div className="row gap mb-3">
          <input ref={prizeNameRef} placeholder="Ex: Caixa JBL" className="input flex-1" />
          <button onClick={addPrize} className="btn btn-primary">
            Adicionar
          </button>
        </div>
      </div>
      <div className="card">
        <h2 className="title">Prêmios cadastrados (ordem do sorteio)</h2>
        <ul className="scroll-list">
          {prizes.map((pr) => (
            <li key={pr.order} className="card item row-between">
              <span className="small">
                {pr.order}º — {pr.name}
              </span>
              <button onClick={() => removePrize(pr.name)} className="btn btn-danger">
                remover
              </button>
            </li>
          ))}
          {!prizes.length && <div className="muted small">Nenhum prêmio cadastrado.</div>}
        </ul>
      </div>
    </div>
  );

  const SorteioControls = () => (
    <div className="row-between wrap gap">
      <div className="grid-4">
        <Stat label="Participantes" value={participants.length} />
        <Stat label="Total de cupons" value={totalCoupons} />
        <Stat label="Prêmios cadastrados" value={prizes.length} />
        <Stat label="Vencedores" value={winners.length} />
      </div>
      <div className="row gap">
        <button onClick={resetWinners} className="btn btn-warn" disabled={rolling || countdown > 0}>
          Resetar vencedores
        </button>
        <button onClick={hardReset} className="btn btn-danger" disabled={rolling || countdown > 0}>
          Zerar tudo
        </button>
      </div>
    </div>
  );

  const BlocSorteio = () => {
    const disabled = !couponsPool.length || !remainingPrizes.length || rolling || countdown > 0;
    return (
      <div className="card">
        <h2 className="title">Sorteio</h2>
        <div className="grid-2 mb-3">
          <Stat label="Cupons elegíveis" value={couponsPool.length} />
          <Stat label="Prêmios restantes" value={remainingPrizes.length} />
        </div>
        <div className="grid-2">
          <button className="btn btn-primary big" onClick={draw} disabled={disabled}>
            {disabled ? "Indisponível" : "🎉 Sortear agora"}
          </button>
          <button className="btn btn-primary big alt" onClick={drawWithCountdown} disabled={disabled}>
            {disabled ? "Indisponível" : "⏳ Sortear com contagem"}
          </button>
        </div>
        <div className="muted xs mt-2">* O vencedor é removido automaticamente dos próximos sorteios.</div>
      </div>
    );
  };

  // Palco dentro da aba
  const PalcoDentroDoSorteio = () => (
    <div className="card palco-card">
      <div className="palco-header">
        <div className="muted">
          <div className="xs">Próximo prêmio</div>
          <div className="h3">{remainingPrizes[0]?.name || "—"}</div>
        </div>
      </div>
      <div className="palco">
        {rolling ? (
          <>
            <div className="muted mb-2">Sorteando...</div>
            <div className="palco-name">{rollView.name}</div>
            <div className="palco-coupon">Cupom Nº {String(rollView.couponNumber || "").padStart(2, "0")}</div>
          </>
        ) : (
          <>
            <div className="grid-2 kpi-area">
              <Stat label="Participantes" value={participants.length} />
              <Stat label="Prêmios restantes" value={remainingPrizes.length} />
            </div>
          </>
        )}
      </div>
    </div>
  );

  const AbaSorteio = () => (
    <div className={`stack gap ${presenterMode ? "presenter" : ""}`}>
      <SorteioControls />
      <BlocSorteio />
      <PalcoDentroDoSorteio />
    </div>
  );

  const AbaAuditoria = () => (
    <div className="card">
      <div className="row-between mb-3">
        <h2 className="title">Auditoria</h2>
        <div className="row gap">
          <button onClick={exportAudit} className="btn btn-primary alt2">
            Exportar CSV
          </button>
          <button onClick={exportExcel} className="btn btn-primary">
            Exportar Excel
          </button>
          <button onClick={() => setAudit([])} className="btn btn-ghost" disabled={rolling || countdown > 0}>
            Limpar
          </button>
        </div>
      </div>
      <div className="scroll-list">
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Hora</th>
              <th>Participante</th>
              <th>Cupom</th>
              <th>Prêmio</th>
            </tr>
          </thead>
          <tbody>
            {[...audit].reverse().map((row, i) => (
              <tr key={i}>
                <td>{row["Data"]}</td>
                <td>{row["Hora"]}</td>
                <td>{row["Participante"]}</td>
                <td>{String(row["Cupom"]).padStart(2, "0")}</td>
                <td>{row["Prêmio"]}</td>
              </tr>
            ))}
            {!audit.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Sem registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className={`app ${presenterMode ? "presenter" : ""}`}>
      <div className="container">
        {/* Cabeçalho em 3 colunas: Título | Logos | KPIs */}
        <div className="mb-6 header-top header-3col">
          <Header />
          <LogoStrip />
          <div className="kpi-row">
            <Stat label="Participantes" value={participants.length} />
            <Stat label="Cupons" value={totalCoupons} />
            <Stat label="Prêmios" value={prizes.length} />
            <Stat label="Vencedores" value={winners.length} />
          </div>
        </div>

        <Tabs />

        <div className="content">
          {tab === "principal" && <AbaPrincipal />}
          {tab === "cad_part" && <AbaCadParticipante />}
          {tab === "cad_premio" && <AbaCadPremio />}
          {tab === "sorteio" && <AbaSorteio />}
          {tab === "auditoria" && <AbaAuditoria />}
        </div>
      </div>

      <CountdownOverlay />
      <RollingOverlay />
      <WinnerOverlay />
    </div>
  );
}

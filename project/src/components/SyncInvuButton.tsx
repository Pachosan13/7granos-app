// src/components/SyncInvuButton.tsx
import { useState } from "react";
import { fetchInvuOrders } from "../lib/invu";

type Branch = "sf" | "museo" | "cangrejo" | "costa" | "central";

const BRANCHES: { key: Branch; label: string }[] = [
  { key: "sf",       label: "San Francisco" },
  { key: "museo",    label: "Museo del Canal" },
  { key: "cangrejo", label: "El Cangrejo" },
  { key: "costa",    label: "Costa del Este" },
  { key: "central",  label: "Central" },
];

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** intenta obtener un total $ de una orden de INVU */
function extractOrderTotal(order: any): number {
  const maybe = [
    order?.totales?.total,
    order?.totales?.total_final,
    order?.totales?.totalVenta,
    order?.total,
    order?.total_final,
  ].find(v => typeof v === "number");
  if (typeof maybe === "number") return maybe;

  // último recurso: busca cualquier campo numérico llamado "total"
  try {
    const stack = [order];
    while (stack.length) {
      const obj = stack.pop();
      if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "number" && /^total(_|\b)/i.test(k)) return v;
          if (v && typeof v === "object") stack.push(v as any);
        }
      }
    }
  } catch {}
  return 0;
}

export function SyncInvuButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMsg(null);
    setErr(null);

    const ymd = todayYMD();
    try {
      const results = await Promise.allSettled(
        BRANCHES.map(async (b) => {
          const res = await fetchInvuOrders(b.key, ymd, ymd);
          const orders: any[] = Array.isArray(res?.data) ? res.data : [];
          const total = orders.reduce((acc, o) => acc + (extractOrderTotal(o) || 0), 0);
          return { branch: b.label, key: b.key, orders: orders.length, total };
        })
      );

      const byBranch = results.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : { branch: "ERROR", key: "error", orders: 0, total: 0, error: (r as any).reason?.message || "falló" }
      );

      const totalSales = byBranch.reduce((a, b) => a + (b.total || 0), 0);
      const transactions = byBranch.reduce((a, b) => a + (b.orders || 0), 0);

      const summary = { date: ymd, totalSales, transactions, byBranch };
      // guarda en localStorage para que el Dashboard lo lea si quieres
      localStorage.setItem("invu:summary:today", JSON.stringify(summary));
      // emite un evento por si tu Dashboard quiere escucharlo
      window.dispatchEvent(new CustomEvent("invu:sync:done", { detail: summary }));

      setMsg(`Listo. Ventas: $${totalSales.toFixed(2)} • Transacciones: ${transactions}`);
      // opcional: console para inspección
      // eslint-disable-next-line no-console
      console.log("INVU summary", summary);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-4 py-2 rounded bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium disabled:opacity-60"
      >
        {loading ? "Sincronizando…" : "Sincronizar Ahora"}
      </button>
      {msg && <span className="text-emerald-400 text-sm">{msg}</span>}
      {err && <span className="text-rose-400 text-sm">Error: {err}</span>}
    </div>
  );
}

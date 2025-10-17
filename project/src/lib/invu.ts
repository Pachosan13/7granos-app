// src/lib/invu.ts
type Branch = "sf" | "museo" | "cangrejo" | "costa" | "central";

/** Llama al Edge Function invu-orders */
export async function fetchInvuOrders(branch: Branch, fromYmd: string, toYmd: string) {
  const base = import.meta.env.VITE_SUPABASE_URL!.replace(/\/$/, "");
  const url  = `${base}/functions/v1/invu-orders?branch=${branch}&from=${fromYmd}&to=${toYmd}`;

  const res = await fetch(url, {
    headers: {
      // si tu función requiere JWT, deja esta línea:
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`INVU ${res.status}`);
  return await res.json(); // -> { data: [...] }
}

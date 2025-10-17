// src/pages/VentasInvu.tsx
import { useState } from "react";
import { fetchInvuOrders } from "../lib/invu";

export const VentasInvu = () => {
  const [branch, setBranch] = useState("sf");
  const [from, setFrom] = useState("2025-08-06");
  const [to, setTo] = useState("2025-08-06");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInvuOrders(branch as any, from, to);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Prueba INVU Orders</h1>

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="sf">San Francisco</option>
          <option value="museo">Museo del Canal</option>
          <option value="cangrejo">El Cangrejo</option>
          <option value="costa">Costa del Este</option>
          <option value="central">Central</option>
        </select>

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border p-2 rounded"
        />

        <button
          onClick={handleFetch}
          disabled={loading}
          className="bg-accent text-white px-4 py-2 rounded"
        >
          {loading ? "Cargando..." : "Consultar"}
        </button>
      </div>

      {error && (
        <div className="text-red-600 bg-red-100 p-2 rounded mb-3">
          Error: {error}
        </div>
      )}

      {data && (
        <div className="bg-gray-50 p-3 rounded border overflow-auto max-h-[70vh]">
          <p className="text-sm text-gray-600 mb-2">
            {Array.isArray(data?.data)
              ? `${data.data.length} órdenes encontradas`
              : "Sin datos"}
          </p>
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

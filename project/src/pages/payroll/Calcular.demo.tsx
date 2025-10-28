import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

// --------------------------------------------------
// Demo adapter (mock de planilla sin Supabase)
// --------------------------------------------------
interface PayrollRow {
  empleado: string;
  horas: number;
  ventas: number;
  salario: number;
}
interface PayrollData {
  periodo: string;
  totalEmpleados: number;
  totalSalarios: number;
  totalVentas: number;
  rows: PayrollRow[];
}

function getDemoPayroll(periodo: string): PayrollData {
  const empleados = [
    { empleado: "Juan Pérez", horas: 80, ventas: 1200, salario: 600 },
    { empleado: "María López", horas: 75, ventas: 900, salario: 550 },
    { empleado: "Carlos Díaz", horas: 85, ventas: 1500, salario: 700 },
  ];
  const totalSalarios = empleados.reduce((t, e) => t + e.salario, 0);
  const totalVentas = empleados.reduce((t, e) => t + e.ventas, 0);
  return {
    periodo,
    totalEmpleados: empleados.length,
    totalSalarios,
    totalVentas,
    rows: empleados,
  };
}

// --------------------------------------------------
// Componente principal
// --------------------------------------------------
export default function Calcular() {
  const [params] = useSearchParams();
  const periodo = params.get("periodo");

  const [data, setData] = useState<PayrollData | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!periodo) {
      setError("Falta el parámetro 'periodo'");
      setLoading(false);
      return;
    }

    try {
      const demo = getDemoPayroll(periodo);
      setData(demo);
      setLoading(false);
    } catch (err: any) {
      setError("Error al cargar los datos demo");
      setLoading(false);
    }
  }, [periodo]);

  // --------------------------------------------------
  // Render states
  // --------------------------------------------------
  if (isLoading) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Cargando datos de planilla...</h2>
        <p>Por favor espera unos segundos.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <h2>⚠️ Error</h2>
        <p>{error}</p>
        <Link to="/payroll">Volver a Planilla</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40 }}>
        <h2>No hay datos disponibles</h2>
        <p>Intenta recargar la página o verificar el periodo.</p>
      </div>
    );
  }

  // --------------------------------------------------
  // Render principal (demo visual)
  // --------------------------------------------------
  return (
    <div style={{ padding: 40 }}>
      <h1>🧾 Cálculo de Planilla</h1>
      <p><b>Periodo:</b> {data.periodo}</p>

      <div style={{ marginTop: 20, marginBottom: 30 }}>
        <div><b>Total Empleados:</b> {data.totalEmpleados}</div>
        <div><b>Total Ventas:</b> ${data.totalVentas.toFixed(2)}</div>
        <div><b>Total Salarios:</b> ${data.totalSalarios.toFixed(2)}</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={th}>Empleado</th>
            <th style={th}>Horas</th>
            <th style={th}>Ventas</th>
            <th style={th}>Salario</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.empleado}</td>
              <td style={td}>{r.horas}</td>
              <td style={td}>${r.ventas.toFixed(2)}</td>
              <td style={td}>${r.salario.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 40 }}>
        <Link to="/payroll" style={{ color: "#1e3a8a" }}>← Volver a Planilla</Link>
      </div>
    </div>
  );
}

// --------------------------------------------------
// Estilos inline simples
// --------------------------------------------------
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "2px solid #ddd",
};
const td: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #eee",
};

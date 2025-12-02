export type Marcacion = {
  fecha: string;
  horaEntrada?: string;
  horaSalida?: string;
  estado: "completa" | "sin_entrada" | "sin_salida" | "fuera_de_horario";
  horasTrabajadas?: number;
};

export type EmpleadoPlanilla = {
  empleadoId: string;
  nombre: string;
  sucursalId: string;
  sucursalNombre: string;
  marcaciones: Marcacion[];
};

export const empleadosPlanillaMock: EmpleadoPlanilla[] = [
  {
    empleadoId: "EMP-001",
    nombre: "Ana González",
    sucursalId: "SCL-01",
    sucursalNombre: "Santiago Centro",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "08:00", horaSalida: "16:30", estado: "completa", horasTrabajadas: 8.5 },
      { fecha: "2024-04-02", horaEntrada: "08:10", horaSalida: "17:00", estado: "fuera_de_horario", horasTrabajadas: 8.8 },
      { fecha: "2024-04-03", horaEntrada: "08:05", horaSalida: "16:20", estado: "completa", horasTrabajadas: 8.25 },
    ],
  },
  {
    empleadoId: "EMP-002",
    nombre: "Bruno Rojas",
    sucursalId: "SCL-02",
    sucursalNombre: "Las Condes",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "07:55", horaSalida: "18:10", estado: "completa", horasTrabajadas: 10.25 },
      { fecha: "2024-04-02", horaEntrada: "08:05", horaSalida: "12:00", estado: "sin_salida" },
      { fecha: "2024-04-03", horaEntrada: "08:15", horaSalida: "17:30", estado: "fuera_de_horario", horasTrabajadas: 9.25 },
    ],
  },
  {
    empleadoId: "EMP-003",
    nombre: "Carla Méndez",
    sucursalId: "VAP-01",
    sucursalNombre: "Valparaíso Puerto",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "09:00", horaSalida: "17:00", estado: "completa", horasTrabajadas: 8 },
      { fecha: "2024-04-02", horaEntrada: "09:10", estado: "sin_salida" },
      { fecha: "2024-04-03", horaSalida: "17:05", estado: "sin_entrada" },
    ],
  },
  {
    empleadoId: "EMP-004",
    nombre: "Diego Silva",
    sucursalId: "VAP-02",
    sucursalNombre: "Viña Mall",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "08:30", horaSalida: "14:30", estado: "completa", horasTrabajadas: 6 },
      { fecha: "2024-04-02", horaEntrada: "08:35", horaSalida: "18:50", estado: "fuera_de_horario", horasTrabajadas: 10.25 },
      { fecha: "2024-04-03", horaEntrada: "08:40", horaSalida: "17:00", estado: "completa", horasTrabajadas: 8.33 },
    ],
  },
  {
    empleadoId: "EMP-005",
    nombre: "Elisa Torres",
    sucursalId: "SCL-01",
    sucursalNombre: "Santiago Centro",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "07:50", horaSalida: "16:00", estado: "completa", horasTrabajadas: 8.17 },
      { fecha: "2024-04-02", horaEntrada: "07:55", horaSalida: "15:45", estado: "completa", horasTrabajadas: 7.83 },
      { fecha: "2024-04-03", horaEntrada: "08:05", horaSalida: "16:25", estado: "completa", horasTrabajadas: 8.33 },
    ],
  },
  {
    empleadoId: "EMP-006",
    nombre: "Felipe Vargas",
    sucursalId: "SCL-02",
    sucursalNombre: "Las Condes",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "10:00", horaSalida: "18:30", estado: "fuera_de_horario", horasTrabajadas: 8.5 },
      { fecha: "2024-04-02", estado: "sin_entrada", horaSalida: "18:00" },
      { fecha: "2024-04-03", horaEntrada: "09:50", horaSalida: "18:20", estado: "completa", horasTrabajadas: 8.5 },
    ],
  },
  {
    empleadoId: "EMP-007",
    nombre: "Gabriela Peña",
    sucursalId: "VAP-02",
    sucursalNombre: "Viña Mall",
    marcaciones: [
      { fecha: "2024-04-01", horaEntrada: "08:20", horaSalida: "17:10", estado: "completa", horasTrabajadas: 8.83 },
      { fecha: "2024-04-02", horaEntrada: "08:25", horaSalida: "17:05", estado: "completa", horasTrabajadas: 8.67 },
      { fecha: "2024-04-03", horaEntrada: "08:30", estado: "sin_salida" },
    ],
  },
];

export function getPlanillaKpis(empleados: EmpleadoPlanilla[]) {
  let completadas = 0;
  let totalMarcaciones = 0;
  let incidencias = 0;
  let horasExtraTotales = 0;

  empleados.forEach((empleado) => {
    empleado.marcaciones.forEach((marcacion) => {
      totalMarcaciones += 1;
      if (marcacion.estado === "completa") {
        completadas += 1;
      } else {
        incidencias += 1;
      }

      if (marcacion.horasTrabajadas && marcacion.horasTrabajadas > 8) {
        horasExtraTotales += marcacion.horasTrabajadas - 8;
      }
    });
  });

  const porcentajeCompletas = totalMarcaciones === 0 ? 0 : completadas / totalMarcaciones;

  return {
    porcentajeCompletas,
    totalIncidencias: incidencias,
    horasExtraTotales,
  };
}

/**
 * Servicio mock para integración con INVU
 * En el futuro se reemplazará con llamadas reales a la API de INVU
 */

export interface INVUCredentials {
  usuario: string;
  password: string;
}

export interface INVULoginResponse {
  token: string;
  expires: Date;
}

export interface VentaINVU {
  fecha: string;
  sucursal: string;
  total: number;
  propinas: number;
  itbms: number;
  num_transacciones: number;
}

export interface CompraINVU {
  proveedor: string;
  factura: string;
  fecha: string;
  subtotal: number;
  itbms: number;
  total: number;
}

/**
 * Mock: Login a INVU con credenciales de sucursal
 */
export const loginSucursal = async (usuario: string, password: string): Promise<INVULoginResponse> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock response
  return {
    token: `mock_token_${Date.now()}`,
    expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 días
  };
};

/**
 * Mock: Obtener ventas de INVU para una sucursal
 */
export const fetchVentas = async (
  sucursalId: string, 
  desde: Date, 
  hasta: Date
): Promise<VentaINVU[]> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generar datos mock
  const ventas: VentaINVU[] = [];
  const dias = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
  
  for (let i = 0; i < dias; i++) {
    const fecha = new Date(desde.getTime() + i * 24 * 60 * 60 * 1000);
    const total = Math.random() * 5000 + 1000;
    const propinas = total * 0.1;
    const itbms = total * 0.07;
    
    ventas.push({
      fecha: fecha.toISOString().split('T')[0],
      sucursal: sucursalId,
      total: Math.round(total * 100) / 100,
      propinas: Math.round(propinas * 100) / 100,
      itbms: Math.round(itbms * 100) / 100,
      num_transacciones: Math.floor(Math.random() * 50) + 10
    });
  }
  
  return ventas;
};

/**
 * Mock: Obtener compras de INVU para una sucursal
 */
export const fetchCompras = async (
  sucursalId: string, 
  desde: Date, 
  hasta: Date
): Promise<CompraINVU[]> => {
  // Simular delay de API
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generar datos mock
  const proveedores = ['Proveedor A', 'Proveedor B', 'Proveedor C', 'Distribuidora XYZ'];
  const compras: CompraINVU[] = [];
  const numCompras = Math.floor(Math.random() * 20) + 5;
  
  for (let i = 0; i < numCompras; i++) {
    const fecha = new Date(desde.getTime() + Math.random() * (hasta.getTime() - desde.getTime()));
    const subtotal = Math.random() * 2000 + 500;
    const itbms = subtotal * 0.07;
    const total = subtotal + itbms;
    
    compras.push({
      proveedor: proveedores[Math.floor(Math.random() * proveedores.length)],
      factura: `FAC-${String(i + 1).padStart(4, '0')}`,
      fecha: fecha.toISOString().split('T')[0],
      subtotal: Math.round(subtotal * 100) / 100,
      itbms: Math.round(itbms * 100) / 100,
      total: Math.round(total * 100) / 100
    });
  }
  
  return compras.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
};
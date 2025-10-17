import { supabase } from './supabase';

export interface UserProfile {
  user_id: string;
  rol: 'admin' | 'contador' | 'gerente';
  created_at: string;
}

export interface Sucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

/**
 * Obtiene el perfil del usuario actual (rol)
 */
export const getMyProfile = async (): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .single();

    if (error) {
      console.error('Error obteniendo perfil:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error en getMyProfile:', error);
    return null;
  }
};

/**
 * Obtiene las sucursales permitidas para el usuario actual
 */
export const getMyBranches = async (isAdmin?: boolean): Promise<Sucursal[]> => {
  try {
    let data, error;
    
    if (isAdmin) {
      // Los administradores ven todas las sucursales directamente
      const result = await supabase
        .from('sucursal')
        .select('id, nombre, activa')
        .eq('activa', true)
        .order('nombre');
      data = result.data;
      error = result.error;
    } else {
      // Usuarios normales usan la vista que filtra por asignación
      const result = await supabase
        .from('v_mis_sucursales')
        .select('sucursal_id as id, nombre, activa')
        .eq('activa', true)
        .order('nombre');
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error obteniendo sucursales:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error en getMyBranches:', error);
    return [];
  }
};
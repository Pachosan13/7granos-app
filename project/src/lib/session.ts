import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Obtiene el usuario actual autenticado
 */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Error obteniendo usuario:', error);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Error en getCurrentUser:', error);
    return null;
  }
};
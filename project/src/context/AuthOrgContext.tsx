import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getMyProfile, getMyBranches, UserProfile, Sucursal } from '../lib/org';

type ViewMode = 'all' | 'single';

interface AuthOrgContextType {
  user: User | null;
  profile: UserProfile | null;
  sucursales: Sucursal[];
  sucursalSeleccionada: Sucursal | null;
  setSucursalSeleccionada: (sucursal: Sucursal | null) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isViewingAll: boolean;
  getFilteredSucursalIds: () => string[];
}

const AuthOrgContext = createContext<AuthOrgContextType | undefined>(undefined);

export const useAuthOrg = () => {
  const context = useContext(AuthOrgContext);
  if (!context) {
    throw new Error('useAuthOrg debe usarse dentro de un AuthOrgProvider');
  }
  return context;
};

interface AuthOrgProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'viewMode';

export const AuthOrgProvider = ({ children }: AuthOrgProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<Sucursal | null>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = useMemo(() => profile?.rol === 'admin', [profile?.rol]);

  const isViewingAll = useMemo(() => {
    return viewMode === 'all' || sucursalSeleccionada === null;
  }, [viewMode, sucursalSeleccionada]);

  const getFilteredSucursalIds = useMemo(() => {
    return () => {
      if (viewMode === 'all' || sucursalSeleccionada === null) {
        return sucursales.map(s => s.id);
      }
      return [sucursalSeleccionada.id];
    };
  }, [viewMode, sucursalSeleccionada, sucursales]);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    if (mode === 'all') {
      setSucursalSeleccionada(null);
    } else if (!sucursalSeleccionada && sucursales.length > 0) {
      setSucursalSeleccionada(sucursales[0]);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Error obteniendo sesión:', sessionError);
          if (mounted) {
            setError(`Error de autenticación: ${sessionError.message}`);
            setLoading(false);
          }
          return;
        }

        const currentUser = session?.user || null;
        if (mounted) {
          setUser(currentUser);
        }

        if (!currentUser) {
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        // Load user profile
        const userProfile = await getMyProfile();

        if (!userProfile) {
          console.warn('No se pudo obtener el perfil del usuario. La tabla user_profile puede no existir o no tener datos.');
          if (mounted) {
            setProfile(null);
            setSucursales([]);
            setLoading(false);
          }
          return;
        }

        if (mounted) {
          setProfile(userProfile);
        }

        // Load branches based on user role
        const isUserAdmin = userProfile.rol === 'admin';
        const branches = await getMyBranches(isUserAdmin);

        if (!branches || branches.length === 0) {
          console.warn('No se encontraron sucursales. Las tablas de sucursal pueden no existir o estar vacías.');
        }

        if (mounted) {
          setSucursales(branches);

          // Restore saved view mode
          const savedViewMode = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
          const initialViewMode = savedViewMode || 'all';
          setViewModeState(initialViewMode);

          if (initialViewMode === 'single' && branches.length > 0) {
            setSucursalSeleccionada(branches[0]);
          } else {
            setSucursalSeleccionada(null);
          }
        }
      } catch (err) {
        console.error('Error cargando datos del usuario:', err);
        if (mounted) {
          setError('Error cargando información del usuario. Verifica que las tablas de la base de datos estén configuradas correctamente.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadUserData();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        const currentUser = session?.user || null;
        setUser(currentUser);

        // If user logged out, clear everything
        if (!currentUser) {
          setProfile(null);
          setSucursales([]);
          setSucursalSeleccionada(null);
          setError(null);
        } else {
          // If user logged in, reload data
          loadUserData();
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthOrgContextType = {
    user,
    profile,
    sucursales,
    sucursalSeleccionada,
    setSucursalSeleccionada,
    viewMode,
    setViewMode,
    loading,
    error,
    isAdmin,
    isViewingAll,
    getFilteredSucursalIds,
  };

  return (
    <AuthOrgContext.Provider value={value}>
      {children}
    </AuthOrgContext.Provider>
  );
};

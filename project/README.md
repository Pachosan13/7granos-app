# 7 Granos - Sistema de Gestión Empresarial

Aplicación web moderna para gestión empresarial construida con Vite, React, TypeScript y Supabase. Incluye sistema de roles y multi-sucursal.

## 🚀 Características

- **Autenticación**: Magic Links con Supabase Auth
- **Roles y Permisos**: Admin, Contador, Gerente con acceso diferenciado
- **Multi-sucursal**: Gestión de múltiples ubicaciones (El Cangrejo, San Francisco, Costa del Este, Museo)
- **Rutas protegidas**: Sistema de autenticación robusto
- **UI moderna**: Diseño limpio con TailwindCSS personalizado
- **Multimodular**: Planilla, Contabilidad y Administración
- **TypeScript**: Tipado completo para mejor DX
- **Responsive**: Adaptable a todos los dispositivos

## 🛠️ Stack Tecnológico

- **Frontend**: Vite + React 18 + TypeScript
- **Estilos**: TailwindCSS con colores personalizados
- **Enrutamiento**: React Router v6
- **Backend**: Supabase (Auth + Database)
- **Iconos**: Lucide React

## 🎨 Colores de Marca

- `bean`: #2B2B29 (texto principal)
- `sand`: #E5DCCF (fondo principal)
- `off`: #F5F1EA (fondos secundarios)
- `accent`: #A9CAEE (acentos y botones)
- `slate7g`: #4F5860 (textos secundarios)

## 🚦 Instalación y Configuración

### 1. Configurar Supabase

1. Crea un nuevo proyecto en [Supabase](https://app.supabase.com)
2. Ve a `Settings` > `API`
3. Copia tu `Project URL` y `anon public key`

### 2. Configurar Base de Datos

1. Ve a `SQL Editor` en tu proyecto de Supabase
2. Ejecuta el archivo `supabase/sql/roles_schema.sql` (crea tablas y sucursales)
3. Ejecuta el archivo `supabase/sql/roles_policies.sql` (configura seguridad RLS)
4. **NUEVO**: Ejecuta el archivo `supabase/sql/import_schema.sql` (sistema de importación)
5. **NUEVO**: Ejecuta el archivo `supabase/sql/import_policies.sql` (políticas de importación)

### 3. Configurar Supabase Storage

1. Ve a `Storage` en tu proyecto de Supabase
2. Crea un nuevo bucket llamado `uploads`
3. Configura las políticas de acceso ejecutando estos comandos en el SQL Editor:
   ```sql
   -- Permitir subida de archivos a usuarios autenticados en el bucket 'uploads'
   create policy "Authenticated users can upload files" on storage.objects
     for insert with check (bucket_id = 'uploads' AND auth.uid() = owner);
   
   -- Permitir lectura de archivos a usuarios autenticados en el bucket 'uploads'
   create policy "Authenticated users can view files" on storage.objects
     for select using (bucket_id = 'uploads' AND auth.uid() = owner);
   
   -- Permitir actualización de archivos a usuarios autenticados en el bucket 'uploads'
   create policy "Authenticated users can update files" on storage.objects
     for update using (bucket_id = 'uploads' AND auth.uid() = owner);
   
   -- Permitir eliminación de archivos a usuarios autenticados en el bucket 'uploads'
   create policy "Authenticated users can delete files" on storage.objects
     for delete using (bucket_id = 'uploads' AND auth.uid() = owner);
   ```

### 4. Variables de Entorno

1. Copia `.env.example` a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Completa con tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-anonima-aqui
   ```

### 5. Instalación

```bash
# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo
pnpm dev
```

### 6. Configurar Usuarios y Roles

Para que un usuario pueda acceder al sistema:

1. **Crear usuario en Supabase Auth**:
   - Ve a `Authentication > Users` en tu dashboard de Supabase
   - Haz clic en "Invite a user" o "Add user"
   - Ingresa email y contraseña temporal
   - El usuario puede cambiar su contraseña usando la recuperación

2. **Crear perfil de usuario** en la tabla `user_profile`:
   ```sql
   INSERT INTO public.user_profile (user_id, rol) 
   VALUES ('uuid-del-usuario', 'admin'); -- o 'contador', 'gerente'
   ```

3. **Asignar sucursales** (solo para gerentes, admin/contador ven todas):
   ```sql
   INSERT INTO public.user_sucursal (user_id, sucursal_id) 
   VALUES ('uuid-del-usuario', 'uuid-de-sucursal');
   ```

4. **Obtener UUID del usuario**: En `Authentication > Users` en Supabase dashboard

## 📁 Estructura del Proyecto

```
src/
├── components/          # Componentes reutilizables
│   ├── Header.tsx      # Header con logo y logout
│   ├── Sidebar.tsx     # Navegación lateral
│   ├── SucursalSwitcher.tsx # Selector de sucursal
│   ├── Layout.tsx      # Layout principal
│   ├── ProtectedRoute.tsx # Rutas protegidas
│   └── SupabaseBanner.tsx # Banner de configuración
├── context/            # Contextos de React
│   └── AuthOrgContext.tsx # Contexto de auth + organización
├── hooks/              # Custom hooks
│   └── useAuth.tsx     # Hook de autenticación
├── lib/                # Utilidades y configuración
│   ├── supabase.ts     # Cliente de Supabase
│   ├── session.ts      # Gestión de sesiones
│   ├── org.ts          # Funciones organizacionales
│   └── format.ts       # Funciones de formato
├── pages/              # Páginas de la aplicación
│   ├── Auth/
│   │   └── IniciarSesion.tsx
│   ├── importar/       # Sistema de importación
│   │   ├── Planilla.tsx
│   │   └── Contabilidad.tsx
│   ├── Tablero.tsx
│   ├── Planilla.tsx
│   ├── Contabilidad.tsx
│   └── Administracion.tsx
├── services/           # Servicios externos
│   └── invu.ts         # Mock de integración INVU
├── lib/                # Utilidades y configuración
│   ├── csv/            # Procesamiento CSV
│   │   └── parse.ts
│   ├── storage/        # Gestión de archivos
│   │   └── saveUpload.ts
├── App.tsx             # Componente principal
├── supabase/sql/       # Scripts SQL para Supabase
│   ├── roles_schema.sql # Schema de roles y sucursales
│   ├── roles_policies.sql # Políticas de seguridad RLS
│   ├── import_schema.sql # Schema de importación
│   └── import_policies.sql # Políticas de importación
└── main.tsx            # Punto de entrada
```

## 🏢 Sistema de Roles y Sucursales

### Roles Disponibles

- **Admin**: Acceso completo a todas las sucursales y funcionalidades
- **Contador**: Acceso a todas las sucursales, enfoque en contabilidad
- **Gerente**: Acceso limitado a sucursales asignadas específicamente

### Sucursales

- **El Cangrejo**
- **San Francisco** 
- **Costa del Este**
- **Museo**

### Lógica de Permisos

- Los usuarios **Admin** y **Contador** pueden ver todas las sucursales automáticamente
- Los usuarios **Gerente** solo ven las sucursales que tienen asignadas en `user_sucursal`
- El selector de sucursal en el header permite cambiar entre ubicaciones permitidas
- Todas las vistas futuras filtrarán datos según la sucursal seleccionada

## 🔐 Autenticación

La aplicación utiliza **Email + Contraseña** de Supabase para autenticación:

1. El usuario ingresa su email y contraseña
2. El sistema valida las credenciales con Supabase Auth
3. Si olvida la contraseña, puede usar la recuperación por email
4. Todas las rutas principales están protegidas
5. Después del login, se cargan el perfil y sucursales del usuario

### Configuración de Supabase Auth

En tu proyecto de Supabase, ve a **Authentication > Settings**:

1. **Habilitar Email + Password**: Asegúrate de que esté activado
2. **Site URL**: Configura tu dominio local (ej: `http://localhost:5173`) para que funcione el `redirectTo` de recuperación
3. **Redirect URLs**: Agrega `http://localhost:5173/auth/restablecer` para la recuperación de contraseña

### Flujo de Recuperación de Contraseña

1. Usuario va a `/auth/recuperar`
2. Ingresa su email y recibe un enlace por correo
3. El enlace lo lleva a `/auth/restablecer` con una sesión temporal
4. Puede establecer una nueva contraseña
5. Redirige a `/auth/iniciar-sesion` para entrar con la nueva contraseña

## 🧩 Utilidades Incluidas

### Formateo de Moneda
```typescript
import { formatCurrencyUSD } from '@/lib/format';
formatCurrencyUSD(1234.56); // "$1,234.56"
```

### Formateo de Fecha
```typescript
import { formatDateDDMMYYYY } from '@/lib/format';
formatDateDDMMYYYY(new Date()); // "25/08/2025"
```

### Contexto Organizacional
```typescript
import { useAuthOrg } from '@/context/AuthOrgContext';

const { user, profile, sucursales, sucursalSeleccionada } = useAuthOrg();
```

## 🎯 Rutas Disponibles

- **Públicas**: 
  - `/auth/iniciar-sesion` - Página de login
  - `/auth/crear-cuenta` - Registro de usuarios
  - `/auth/recuperar` - Recuperación de contraseña
  - `/auth/restablecer` - Restablecer contraseña
- **Privadas** (requieren autenticación):
  - `/` - Tablero principal
  - `/payroll` - Gestión de planillas
  - `/gl` - Contabilidad general
  - `/importar/planilla` - Importar CSV de planillas
  - `/importar/contabilidad` - Importar CSV de ventas/compras
  - `/admin` - Administración del sistema

## 📊 Sistema de Importación CSV

### Características
- **Importación de planillas**: CSV con columnas empleado, codigo, monto (opcional: qty, centro)
- **Importación de ventas**: CSV con columnas fecha, sucursal, total, propinas, itbms, num_transacciones
- **Importación de compras**: CSV con columnas proveedor, factura, fecha, subtotal, itbms, total
- **Vista previa**: Muestra las primeras 100 filas y estadísticas
- **Validación**: Verifica columnas requeridas antes de procesar
- **Storage**: Archivos guardados en Supabase Storage con estructura organizada
- **Manifiestos**: JSON con metadatos de cada importación
- **Log de operaciones**: Registro completo de todas las importaciones

### Sincronización INVU (Mock)
- **API simulada**: Genera datos de prueba para ventas y compras
- **Cursor incremental**: Sistema de seguimiento por dataset
- **Log de sincronización**: Registro de todas las operaciones API
- **Rango de fechas**: Sincronización por períodos específicos

### Estructura de Storage
```
uploads/
├── {sucursalId}/
│   ├── planilla/
│   │   └── {YYYY}/{MM}/{timestamp}-{slug}.csv
│   │   └── {YYYY}/{MM}/{timestamp}-{slug}.manifest.json
│   ├── ventas/
│   │   └── {YYYY}/{MM}/{timestamp}-{slug}.csv
│   │   └── {YYYY}/{MM}/{timestamp}-{slug}.manifest.json
│   └── compras/
│       └── {YYYY}/{MM}/{timestamp}-{slug}.csv
│       └── {YYYY}/{MM}/{timestamp}-{slug}.manifest.json
```

## 📱 Diseño Responsivo

La aplicación está optimizada para:
- 📱 **Mobile**: < 768px
- 📟 **Tablet**: 768px - 1024px  
- 🖥️ **Desktop**: > 1024px

## ⚡ Scripts Disponibles

```bash
pnpm dev      # Servidor de desarrollo
pnpm build    # Build para producción
pnpm preview  # Preview del build
pnpm lint     # Linter de código
```

## 🔧 Troubleshooting

### Usuario no puede acceder después del login
1. Verifica que existe un registro en `user_profile` con el `user_id` correcto
2. Para gerentes, verifica que tiene sucursales asignadas en `user_sucursal`
3. Revisa los logs del navegador para errores de permisos RLS

### "No tienes sucursales asignadas"
- Los usuarios **Admin** y **Contador** deberían ver todas las sucursales automáticamente
- Los usuarios **Gerente** necesitan registros en `user_sucursal`

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -m 'feat: nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---

## 📋 Checklist de Configuración

- [ ] Proyecto Supabase creado
- [ ] Email + Password habilitado en Supabase Auth
- [ ] Site URL configurada en Supabase Auth Settings
- [ ] Variables de entorno configuradas
- [ ] Scripts SQL ejecutados (`roles_schema.sql` y `roles_policies.sql`)
- [ ] **NUEVO**: Scripts de importación ejecutados (`import_schema.sql` y `import_policies.sql`)
- [ ] **NUEVO**: Bucket `uploads` creado en Supabase Storage
- [ ] **NUEVO**: Políticas de Storage configuradas
- [ ] Usuario creado en Supabase Auth
- [ ] Perfil creado en `user_profile`
- [ ] Sucursales asignadas (si es gerente)
- [ ] Login exitoso con selector de sucursal visible
- [ ] **NUEVO**: Sistema de importación CSV funcionando
- [ ] **NUEVO**: Sincronización mock con INVU operativa
- [ ] **NUEVO**: Reglas de planilla de Panamá configuradas
- [ ] **NUEVO**: Motor de cálculo con aportes patronales
- [ ] **NUEVO**: Reporte de planilla con exportación CSV/PDF
- [ ] **NUEVO**: Generación de proforma contable

---

**7 Granos** - Sistema de Gestión Empresarial 🌟
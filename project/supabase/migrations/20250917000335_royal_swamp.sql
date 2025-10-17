/*
  # Configurar políticas de Storage para bucket 'uploads'

  1. Políticas de Storage
    - Permitir subida de archivos a usuarios autenticados
    - Permitir lectura de archivos propios
    - Permitir actualización de archivos propios
    - Permitir eliminación de archivos propios

  2. Seguridad
    - Solo usuarios autenticados pueden acceder
    - Solo pueden acceder a sus propios archivos
    - Restricción específica al bucket 'uploads'
*/

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;

-- Permitir subida de archivos a usuarios autenticados en el bucket 'uploads'
CREATE POLICY "Authenticated users can upload files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.uid() = owner);

-- Permitir lectura de archivos a usuarios autenticados en el bucket 'uploads'
CREATE POLICY "Authenticated users can view files" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads' AND auth.uid() = owner);

-- Permitir actualización de archivos a usuarios autenticados en el bucket 'uploads'
CREATE POLICY "Authenticated users can update files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'uploads' AND auth.uid() = owner);

-- Permitir eliminación de archivos a usuarios autenticados en el bucket 'uploads'
CREATE POLICY "Authenticated users can delete files" ON storage.objects
  FOR DELETE USING (bucket_id = 'uploads' AND auth.uid() = owner);
-- 1. Tambahkan kolom activity_name (Nama Kegiatan)
ALTER TABLE public.master_data 
ADD COLUMN IF NOT EXISTS activity_name text DEFAULT 'Kegiatan Umum';

-- 2. Buat Policy (Aturan) agar aplikasi bisa mengubah data (UPDATE)
DROP POLICY IF EXISTS "Allow public update access" ON public.master_data;
CREATE POLICY "Allow public update access" 
ON public.master_data 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- 3. Buat Policy (Aturan) agar aplikasi bisa menghapus data (DELETE)
DROP POLICY IF EXISTS "Allow public delete access" ON public.master_data;
CREATE POLICY "Allow public delete access" 
ON public.master_data 
FOR DELETE 
USING (true);

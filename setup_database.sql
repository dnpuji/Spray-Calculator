-- 1. Buat tabel master_data
CREATE TABLE IF NOT EXISTS public.master_data (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_name text NOT NULL,
    active_ingredients text,
    dose_per_ha numeric NOT NULL,
    dose_unit text DEFAULT 'L'::text,
    water_rate_per_ha numeric NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.master_data ENABLE ROW LEVEL SECURITY;

-- 3. Buat Policy (Aturan) agar aplikasi bisa membaca data (SELECT)
DROP POLICY IF EXISTS "Allow public read access" ON public.master_data;
CREATE POLICY "Allow public read access" 
ON public.master_data 
FOR SELECT 
USING (true);

-- 4. Buat Policy (Aturan) agar aplikasi bisa menambah data (INSERT)
DROP POLICY IF EXISTS "Allow public insert access" ON public.master_data;
CREATE POLICY "Allow public insert access" 
ON public.master_data 
FOR INSERT 
WITH CHECK (true);

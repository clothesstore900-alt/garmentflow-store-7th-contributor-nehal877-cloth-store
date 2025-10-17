/*
  # Fix Complete Inventory Management Schema
  
  1. Overview
    This migration ensures all required tables exist with proper structure
    for a complete garment inventory management system.
  
  2. Tables Created/Updated
    - `user_roles`: User role management (owner, admin, staff)
    - `categories`: Product categories
    - `sizes`: Product sizes with sort order
    - `colors`: Product colors with hex codes and sort order  
    - `products`: Main product catalog with images, pricing, stock
    - `product_size_prices`: Size-specific pricing for products
    - `product_inventory`: Track inventory by product, size, and color
    - `invoices`: Sales invoices with payment tracking
    - `invoice_items`: Line items for invoices with size and color
    - `store_settings`: Store configuration including QR codes
  
  3. Key Features
    - Multi-size and multi-color product support
    - Size-specific pricing
    - Inventory tracking by size and color
    - Invoice with payment status (done/pending)
    - Expected payment date for pending invoices
    - Store branding with QR codes for social media
    - Auto-generated invoice numbers
  
  4. Security
    - RLS enabled on all tables
    - Authenticated users have full access to their store data
    - Public storage access for product images and store assets
*/

-- Create enums
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'owner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create sizes table
CREATE TABLE IF NOT EXISTS public.sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create colors table
CREATE TABLE IF NOT EXISTS public.colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  hex_code TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default sizes
INSERT INTO public.sizes (name, sort_order) VALUES
  ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6), ('XXXL', 7)
ON CONFLICT (name) DO NOTHING;

-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  size_ids UUID[],
  color_ids UUID[],
  price_inr DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost_inr DECIMAL(10, 2),
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  secondary_image_url TEXT,
  description TEXT,
  sku TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on SKU if not null
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON public.products(sku) WHERE sku IS NOT NULL;

-- Create product_size_prices table
CREATE TABLE IF NOT EXISTS public.product_size_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  size_id UUID REFERENCES public.sizes(id) ON DELETE CASCADE NOT NULL,
  price_inr DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, size_id)
);

-- Create product_inventory table
CREATE TABLE IF NOT EXISTS public.product_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  size_id UUID REFERENCES public.sizes(id) ON DELETE CASCADE,
  color_id UUID REFERENCES public.colors(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, size_id, color_id)
);

-- Create invoices table  
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax_percentage DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  discount_type TEXT DEFAULT 'percentage',
  grand_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_status TEXT DEFAULT 'done' CHECK (payment_status IN ('done', 'pending')),
  expected_payment_date DATE,
  pdf_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on invoice_number
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique ON public.invoices(invoice_number);

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  size_name TEXT,
  color_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create store_settings table
CREATE TABLE IF NOT EXISTS public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL DEFAULT 'My Store',
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_percentage DECIMAL(5, 2) DEFAULT 0,
  logo_url TEXT,
  currency_symbol TEXT DEFAULT '₹',
  whatsapp_channel TEXT DEFAULT '',
  instagram_page TEXT DEFAULT '',
  whatsapp_tagline TEXT DEFAULT 'Join our WhatsApp',
  instagram_tagline TEXT DEFAULT 'Follow us on Instagram',
  whatsapp_qr_url TEXT DEFAULT '',
  instagram_qr_url TEXT DEFAULT '',
  whatsapp_channel_name TEXT DEFAULT '',
  instagram_page_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default store settings if table is empty
INSERT INTO public.store_settings (store_name, tax_percentage)
SELECT 'My Garment Store', 18.00
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings LIMIT 1);

-- Create function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(invoice_number FROM 'INV-([0-9]+)') AS INTEGER)), 0
  ) + 1 INTO next_number
  FROM invoices
  WHERE invoice_number ~ '^INV-[0-9]+$';
  
  RETURN 'INV-' || LPAD(next_number::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for invoice number
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice number generation
DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;
CREATE TRIGGER set_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_size_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can delete user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can create categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can update categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can delete categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can view sizes" ON public.sizes;
DROP POLICY IF EXISTS "Authenticated users can create sizes" ON public.sizes;
DROP POLICY IF EXISTS "Authenticated users can insert sizes" ON public.sizes;
DROP POLICY IF EXISTS "Authenticated users can update sizes" ON public.sizes;
DROP POLICY IF EXISTS "Authenticated users can delete sizes" ON public.sizes;
DROP POLICY IF EXISTS "Authenticated users can view colors" ON public.colors;
DROP POLICY IF EXISTS "Authenticated users can manage colors" ON public.colors;
DROP POLICY IF EXISTS "Authenticated users can insert colors" ON public.colors;
DROP POLICY IF EXISTS "Authenticated users can update colors" ON public.colors;
DROP POLICY IF EXISTS "Authenticated users can delete colors" ON public.colors;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can create products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view product_size_prices" ON public.product_size_prices;
DROP POLICY IF EXISTS "Authenticated users can manage product_size_prices" ON public.product_size_prices;
DROP POLICY IF EXISTS "Authenticated users can insert product_size_prices" ON public.product_size_prices;
DROP POLICY IF EXISTS "Authenticated users can update product_size_prices" ON public.product_size_prices;
DROP POLICY IF EXISTS "Authenticated users can delete product_size_prices" ON public.product_size_prices;
DROP POLICY IF EXISTS "Authenticated users can view product_inventory" ON public.product_inventory;
DROP POLICY IF EXISTS "Authenticated users can manage product_inventory" ON public.product_inventory;
DROP POLICY IF EXISTS "Authenticated users can insert product_inventory" ON public.product_inventory;
DROP POLICY IF EXISTS "Authenticated users can update product_inventory" ON public.product_inventory;
DROP POLICY IF EXISTS "Authenticated users can delete product_inventory" ON public.product_inventory;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can create invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can view invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can create invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can view invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can update invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can delete invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can view store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated users can view store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated users can update store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated users can create store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated users can insert store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated users can update store_settings" ON public.store_settings;

-- Create RLS policies for user_roles
CREATE POLICY "Authenticated users can view user roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert user roles"
  ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update user roles"
  ON public.user_roles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete user roles"
  ON public.user_roles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create RLS policies for categories
CREATE POLICY "Authenticated users can view categories"
  ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert categories"
  ON public.categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update categories"
  ON public.categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete categories"
  ON public.categories FOR DELETE TO authenticated USING (true);

-- Create RLS policies for sizes
CREATE POLICY "Authenticated users can view sizes"
  ON public.sizes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sizes"
  ON public.sizes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sizes"
  ON public.sizes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete sizes"
  ON public.sizes FOR DELETE TO authenticated USING (true);

-- Create RLS policies for colors
CREATE POLICY "Authenticated users can view colors"
  ON public.colors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert colors"
  ON public.colors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update colors"
  ON public.colors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete colors"
  ON public.colors FOR DELETE TO authenticated USING (true);

-- Create RLS policies for products
CREATE POLICY "Authenticated users can view products"
  ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products"
  ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products"
  ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete products"
  ON public.products FOR DELETE TO authenticated USING (true);

-- Create RLS policies for product_size_prices
CREATE POLICY "Authenticated users can view product_size_prices"
  ON public.product_size_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert product_size_prices"
  ON public.product_size_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_size_prices"
  ON public.product_size_prices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete product_size_prices"
  ON public.product_size_prices FOR DELETE TO authenticated USING (true);

-- Create RLS policies for product_inventory
CREATE POLICY "Authenticated users can view product_inventory"
  ON public.product_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert product_inventory"
  ON public.product_inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_inventory"
  ON public.product_inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete product_inventory"
  ON public.product_inventory FOR DELETE TO authenticated USING (true);

-- Create RLS policies for invoices
CREATE POLICY "Authenticated users can view invoices"
  ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoices"
  ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoices"
  ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete invoices"
  ON public.invoices FOR DELETE TO authenticated USING (true);

-- Create RLS policies for invoice_items
CREATE POLICY "Authenticated users can view invoice_items"
  ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoice_items"
  ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoice_items"
  ON public.invoice_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete invoice_items"
  ON public.invoice_items FOR DELETE TO authenticated USING (true);

-- Create RLS policies for store_settings
CREATE POLICY "Authenticated users can view store_settings"
  ON public.store_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert store_settings"
  ON public.store_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update store_settings"
  ON public.store_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('product-images', 'product-images', true),
  ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update store assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete store assets" ON storage.objects;

-- Storage policies for product-images
CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');

-- Storage policies for store-assets
CREATE POLICY "Authenticated users can upload store assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-assets');

CREATE POLICY "Anyone can view store assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'store-assets');

CREATE POLICY "Authenticated users can update store assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'store-assets') WITH CHECK (bucket_id = 'store-assets');

CREATE POLICY "Authenticated users can delete store assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'store-assets');

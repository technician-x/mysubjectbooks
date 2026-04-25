
-- Roles
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- First signup becomes teacher
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles WHERE role = 'teacher';
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher');
    INSERT INTO public.teacher_settings (teacher_email) VALUES (NEW.email)
      ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  END IF;
  RETURN NEW;
END;
$$;

-- Tables
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📚',
  color TEXT NOT NULL DEFAULT 'indigo',
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('full','unit','part')),
  unit_number TEXT,
  order_index INT NOT NULL DEFAULT 0,
  pdf_url TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  allow_download BOOLEAN NOT NULL DEFAULT true,
  cover_emoji TEXT DEFAULT '📄',
  cover_color TEXT DEFAULT 'indigo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teacher_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'EduShelf',
  tagline TEXT NOT NULL DEFAULT 'Your classroom, always with you',
  teacher_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_settings ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read subjects" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "Public read books" ON public.books FOR SELECT USING (true);
CREATE POLICY "Public read resources" ON public.resources FOR SELECT USING (true);
CREATE POLICY "Public read settings" ON public.teacher_settings FOR SELECT USING (true);

-- Teacher write policies
CREATE POLICY "Teachers manage subjects" ON public.subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));
CREATE POLICY "Teachers manage books" ON public.books FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));
CREATE POLICY "Teachers manage resources" ON public.resources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));
CREATE POLICY "Teachers manage settings" ON public.teacher_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));

-- Trigger for new users
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs','pdfs',true);

CREATE POLICY "Public read pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');
CREATE POLICY "Teachers upload pdfs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pdfs' AND public.has_role(auth.uid(),'teacher'));
CREATE POLICY "Teachers update pdfs" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pdfs' AND public.has_role(auth.uid(),'teacher'));
CREATE POLICY "Teachers delete pdfs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pdfs' AND public.has_role(auth.uid(),'teacher'));

-- Default settings row
INSERT INTO public.teacher_settings (site_name, tagline) VALUES ('EduShelf','Your classroom, always with you');

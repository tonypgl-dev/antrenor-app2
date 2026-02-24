
-- Athletes table
CREATE TABLE public.athletes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  birth_date DATE,
  structure TEXT CHECK (structure IN ('MAI', 'MAPN', 'IGSU', 'SRI', 'Other')),
  payment_mode TEXT NOT NULL DEFAULT 'PER_SESSION' CHECK (payment_mode IN ('PER_SESSION', 'SUBSCRIPTION')),
  default_race TEXT NOT NULL DEFAULT '1000m' CHECK (default_race IN ('1000m', '2000m')),
  email TEXT,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  public_slug TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_by_coach TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions table (Coaching & Gym)
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('COACHING', 'GYM')),
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  amount NUMERIC NOT NULL,
  created_by_coach TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cash ledger
CREATE TABLE public.cash_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID REFERENCES public.athletes(id) ON DELETE SET NULL,
  athlete_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('COACHING', 'GYM', 'PER_SESSION')),
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by_coach TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendance day
CREATE TABLE public.attendance_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
  finalized_by_coach TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendance entries
CREATE TABLE public.attendance_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_day_id UUID NOT NULL REFERENCES public.attendance_days(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT false,
  session_paid BOOLEAN NOT NULL DEFAULT false,
  created_by_coach TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attendance_day_id, athlete_id)
);

-- Timing sessions
CREATE TABLE public.timing_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  attendance_day_id UUID REFERENCES public.attendance_days(id),
  created_by_coach TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lanes
CREATE TABLE public.lanes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  race_type TEXT NOT NULL,
  laps_total INTEGER NOT NULL,
  ideal_total_time_seconds NUMERIC,
  black_threshold_seconds NUMERIC,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Runs (per lane per session)
CREATE TABLE public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timing_session_id UUID NOT NULL REFERENCES public.timing_sessions(id) ON DELETE CASCADE,
  lane_id UUID NOT NULL REFERENCES public.lanes(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED')),
  start_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lane assignments (athletes in lanes for a session)
CREATE TABLE public.lane_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timing_session_id UUID NOT NULL REFERENCES public.timing_sessions(id) ON DELETE CASCADE,
  lane_id UUID NOT NULL REFERENCES public.lanes(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES public.athletes(id) ON DELETE SET NULL,
  external_name TEXT,
  nickname TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lap events
CREATE TABLE public.lap_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  lane_assignment_id UUID NOT NULL REFERENCES public.lane_assignments(id) ON DELETE CASCADE,
  lap_number INTEGER NOT NULL,
  elapsed_ms BIGINT NOT NULL,
  created_by_coach TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Update trigger for athletes
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_athletes_updated_at
  BEFORE UPDATE ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert preset lanes
INSERT INTO public.lanes (name, race_type, laps_total, ideal_total_time_seconds, is_preset) VALUES
  ('2000m', '2000m', 11, 480, true),
  ('1000m', '1000m', 5, 210, true),
  ('200m-A', '200m', 1, NULL, true),
  ('200m-B', '200m', 1, NULL, true);

-- Enable RLS on all tables (open policies since no auth, coach-based)
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lane_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lap_events ENABLE ROW LEVEL SECURITY;

-- Since there's no auth (coach picker only), allow all operations
CREATE POLICY "Allow all" ON public.athletes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.cash_ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.attendance_days FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.attendance_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.timing_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.lanes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.lane_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.lap_events FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for timing-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lane_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lap_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_entries;

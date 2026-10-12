-- In-app feedback reports (feat/in-app-feedback).
-- Apply once: Supabase SQL editor, or `npm run db:migrate` with DATABASE_URL set.
-- IF NOT EXISTS so it is safe on databases created outside drizzle-kit.
CREATE TABLE IF NOT EXISTS "feedback" (
  "feedback_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "category" text NOT NULL,
  "screen" text,
  "message" text NOT NULL,
  "status" text DEFAULT 'New' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

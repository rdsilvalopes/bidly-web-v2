-- enum: garantir 'company_contract'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'doc_type' AND e.enumlabel = 'company_contract'
  ) THEN
    ALTER TYPE doc_type ADD VALUE 'company_contract';
  END IF;
END $$;

-- unique (user_id, type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documents_user_type_uniq'
       AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_user_type_uniq UNIQUE (user_id, type);
  END IF;
END $$;

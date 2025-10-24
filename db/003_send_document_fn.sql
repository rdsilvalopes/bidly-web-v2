CREATE OR REPLACE FUNCTION public.send_document(
  p_type         doc_type,
  p_storage_path text      -- chave relativa, ex.: '<user_uuid>/company_contract.pdf'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Normaliza: só aceita chave relativa (nunca URL completa)
  IF position('storage/v1/object' in coalesce(p_storage_path,'')) > 0 THEN
    RAISE EXCEPTION 'invalid storage path: must be object key only';
  END IF;

  INSERT INTO public.documents (user_id, type, storage_path, status, submitted_at)
  VALUES (v_uid, p_type, p_storage_path, 'under_review', now())
  ON CONFLICT (user_id, type) DO UPDATE
  SET storage_path = EXCLUDED.storage_path,
      status       = 'under_review',
      submitted_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_document(doc_type, text) TO authenticated;

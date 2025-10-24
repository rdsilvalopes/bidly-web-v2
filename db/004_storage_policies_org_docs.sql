-- SELECT por capacidade (admins/reviewers)
DROP POLICY IF EXISTS orgdocs_admin_read_by_cap ON storage.objects;
CREATE POLICY orgdocs_admin_read_by_cap
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'org-docs'
  AND rbac.has_cap('doc.view_pdf')
);

-- SELECT do próprio arquivo
DROP POLICY IF EXISTS orgdocs_read_own ON storage.objects;
CREATE POLICY orgdocs_read_own
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'org-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- INSERT (somente PDF do próprio prefixo)
DROP POLICY IF EXISTS orgdocs_insert_own_pdf ON storage.objects;
CREATE POLICY orgdocs_insert_own_pdf
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'org-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND right(lower(name), 4) = '.pdf'
);

-- UPDATE (somente PDF do próprio prefixo)
DROP POLICY IF EXISTS orgdocs_update_own_pdf ON storage.objects;
CREATE POLICY orgdocs_update_own_pdf
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'org-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'org-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND right(lower(name), 4) = '.pdf'
);

-- DELETE (próprio)
DROP POLICY IF EXISTS orgdocs_delete_own ON storage.objects;
CREATE POLICY orgdocs_delete_own
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'org-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

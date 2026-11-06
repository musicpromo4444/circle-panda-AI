-- Keep dating photos in the existing private bucket and enforce blurred/unblurred access.
DROP POLICY IF EXISTS "members read photos on published dating profiles" ON storage.objects;

CREATE POLICY "dating profile photos follow blur and mutual match rules"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dating-profile-photos'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.dating_profiles AS dp
      WHERE dp.user_id::text = (storage.foldername(objects.name))[1]
        AND dp.is_published = true
        AND (
          dp.blurred_photo_path = objects.name
          OR (
            dp.photo_path = objects.name
            AND EXISTS (
              SELECT 1
              FROM public.dating_matches AS dm
              WHERE dm.status = 'matched'
                AND dm.photos_revealed = true
                AND (
                  (dm.user_a = (SELECT auth.uid()) AND dm.user_b = dp.user_id)
                  OR
                  (dm.user_b = (SELECT auth.uid()) AND dm.user_a = dp.user_id)
                )
            )
          )
        )
    )
  )
);

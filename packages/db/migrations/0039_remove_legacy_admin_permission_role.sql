-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Super Admin is a platform override on users, not an editable permission-role column.
-- Consolidate the legacy `admin` permission role into the canonical space Admin (`owner`).
DO $$
DECLARE
  legacy_admin_id uuid;
  space_admin_id uuid;
BEGIN
  SELECT id INTO legacy_admin_id
  FROM permission_roles
  WHERE slug = 'admin'
  LIMIT 1;

  IF legacy_admin_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO space_admin_id
  FROM permission_roles
  WHERE slug = 'owner'
  LIMIT 1;

  IF space_admin_id IS NULL THEN
    -- Older databases may only have the legacy row. Preserve assignments and
    -- settings while moving it to the canonical space-role identity.
    UPDATE permission_roles
    SET slug = 'owner',
        name = 'Admin',
        description = 'Space administrator with full control of that space (not Super Admin).',
        is_system = true,
        position = 'a2',
        updated_at = now()
    WHERE id = legacy_admin_id;
  ELSE
    -- Databases that already created `owner` can safely merge assignments and
    -- remove the duplicate legacy column.
    UPDATE users
    SET permission_role_id = space_admin_id,
        updated_at = now()
    WHERE permission_role_id = legacy_admin_id;

    DELETE FROM permission_roles WHERE id = legacy_admin_id;
  END IF;
END $$;

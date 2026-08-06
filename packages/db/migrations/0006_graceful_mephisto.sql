-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE INDEX "tasks_list_position_created_idx" ON "tasks" USING btree ("list_id","position","created_at");

-- What the upload sorter found about the school in a file, when it is not one of the known schools:
--   {"kind": "new_school", "school": {name, school_type, board, medium, grade_from, grade_to}, "teachers": [names], "data": {...}}
--   {"kind": "no_school"}
-- The Add files page shows it ("New school detected" / "No school detected") so the CRP can add the school, pick another, or remove the file.
alter table upload_items add column if not exists detected jsonb;

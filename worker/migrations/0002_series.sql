-- Series of the QR code (1-3) and the exact question shown with the answer.
-- NULL for answers sent before this change, or by an older version of the app. Existing rows are untouched.
ALTER TABLE responses ADD COLUMN series INTEGER;
ALTER TABLE responses ADD COLUMN question TEXT;

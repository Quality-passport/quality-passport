-- Quiz series (series 2): the option chosen (A-D) and its verdict (1 right, 0 wrong).
-- NULL for open questions (series 1 and 3) and for every answer sent before. Existing rows are untouched.
ALTER TABLE responses ADD COLUMN choice TEXT;
ALTER TABLE responses ADD COLUMN correct INTEGER;

-- Portuguese defaults for what automations send to people.
--
-- Earlier versions saved English default texts on automations (the editor
-- prefilled them). Each one is swapped for the new Portuguese default ONLY
-- when the stored value is EXACTLY the old default; anything the owner typed
-- stays as it is. The defaults live in lib/campaigns/defaults.ts.

-- Link buttons: the campaign's own label and the second link's label.
UPDATE "Automation" SET "linkButtonLabel" = 'Abrir link'
WHERE "linkButtonLabel" IN ('Open link');

UPDATE "TrackedLink" SET "label" = 'Abrir link'
WHERE "label" IN ('Open link');

-- Opening DM button (rows imported from a CSV without a label).
UPDATE "Automation" SET "openingDmButtonLabel" = 'Me manda o link'
WHERE "openingDmButtonLabel" IN ('Send link');

-- "Follow to unlock": the request and its button.
UPDATE "Automation" SET "followPromptMessage" = 'Antes de te mandar o link, segue a gente aqui? Depois é só tocar no botão abaixo.'
WHERE "followPromptMessage" IN ('quick favor before i send your link. i don''t make any money from this, it''s free. if you want to support me, just don''t unfollow after, and star the repo on github if it helps you. tap the button once you''re following and i''ll send it over', 'Almost there! Follow me and tap the button below to grab your link 💛');

UPDATE "Automation" SET "followPromptButtonLabel" = 'Já sigo'
WHERE "followPromptButtonLabel" IN ('i''m following', 'I''m following ✅');

-- The app now connects Instagram accounts only through Business Login for
-- Instagram. Accounts connected through the Facebook (Unified) login hold a
-- token that only works on graph.facebook.com: mark them so the Accounts tab
-- asks to reconnect (reconnecting updates the same row, automations kept).
-- Data only, on a small table; harmless for the previous code, which shows
-- the same "reconnect" state.
UPDATE "InstagramAccount" SET "tokenInvalidAt" = CURRENT_TIMESTAMP WHERE "metaLogin" = 'UNIFIED' AND "tokenInvalidAt" IS NULL;

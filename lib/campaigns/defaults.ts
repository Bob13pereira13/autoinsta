/**
 * Every default text an automation sends to the person (the end customer),
 * in one place: used when the owner left a field blank, by the worker, the
 * editor, the preview and the detail page. They are sent to people, so they
 * follow the product's language (Portuguese) — there is no per-workspace
 * language to choose another one from — and never mention anything but the
 * business itself. Old English defaults saved by earlier versions are swapped
 * by the migration 20261201120000_portuguese_customer_defaults.
 */

/** The link button. */
export const DEFAULT_LINK_BUTTON_LABEL = "Abrir link";

/** The opening DM's button, when an imported row brings no label. */
export const DEFAULT_OPENING_BUTTON_LABEL = "Me manda o link";

/** "Follow to unlock": the request and its button. */
export const DEFAULT_FOLLOW_PROMPT_MESSAGE = "Antes de te mandar o link, segue a gente aqui? Depois é só tocar no botão abaixo.";
export const DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL = "Já sigo";

/** The text above the link button when the message is nothing but {link}. */
export const DEFAULT_LINK_ONLY_TEXT = "Aqui está o seu link:";

/** Every default above, for the tests that keep them in Portuguese. */
export const CUSTOMER_DEFAULTS = {
  DEFAULT_LINK_BUTTON_LABEL,
  DEFAULT_OPENING_BUTTON_LABEL,
  DEFAULT_FOLLOW_PROMPT_MESSAGE,
  DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
  DEFAULT_LINK_ONLY_TEXT,
} as const;

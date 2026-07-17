// Shared `window` CustomEvent name used to keep the chat page and the
// sidebar's conversation list in sync without prop-drilling/context — same
// lightweight pattern already used for 'coin-balance-update' (see
// components/CoinBadge.tsx). Dispatched whenever a conversation is created,
// renamed via a completed exchange (title/updated_at change server-side), or
// deleted; listeners just refetch the list rather than trying to diff a
// partial payload.
export const CONVERSATION_CHANGED_EVENT = 'yol-conversation-changed';

// A direct call is stored with conversationId = the person who was called (the caller's view of the chat).
// The person who was called sees that chat as "the caller", so a direct call log must be matched by its two
// participants and shown with the OTHER participant as its conversation. Group calls use the group id for everyone.

/** Query part for the calls of one conversation, seen by `viewerObjectId`. */
export function callLogConversationMatch(viewerObjectId, conversationObjectId, isGroup) {
  return isGroup
    ? { isGroup: true, conversationId: conversationObjectId }
    : { isGroup: false, participants: { $all: [viewerObjectId, conversationObjectId] } };
}

/** The log as `viewerId` sees it: a direct call's conversation is the other participant. */
export function viewCallLog(log, viewerId) {
  if (!log || log.isGroup) return log;
  const other = (log.participants || []).map(String).find((id) => id !== String(viewerId));
  return other ? { ...log, conversationId: other } : log;
}

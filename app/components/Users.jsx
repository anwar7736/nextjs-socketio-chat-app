import { useContext, useEffect, useRef, useState } from "react";
import { FiArchive, FiMoreHorizontal, FiSlash } from "react-icons/fi";
import { MdDone, MdDoneAll } from "react-icons/md";
import { toast } from "react-toastify";
import { UserContext } from "../contexts/UserContext";
import { MessageContext } from "../contexts/MessageContext";
import { activityFormat, getImageURL, loadMessages } from "../helpers/helper";
import { UserListContext } from "../contexts/UserListContext";

const Users = ({ activeUsers, isLoading, setConversationLoading }) => {
  const { user, setUser } = useContext(UserContext);
  const { users, setUsers } = useContext(UserListContext);
  const { setMessages } = useContext(MessageContext);
  const [requestId, setRequestId] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const menuRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!menuFor) return;
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuFor(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menuFor]);

  const getMessages = async (data) => {
    if (data?._id === user?._id && data?.is_group === user?.is_group) return;
    const requestId = ++requestIdRef.current;
    setConversationLoading(true);
    setMessages([]);
    setUser(data);
    setUsers((current) => current.map((item) =>
      item?._id === data?._id ? { ...item, pending: 0 } : item
    ));
    try {
      const result = await loadMessages(data);
      if (!Array.isArray(result)) throw new Error("Unable to load messages.");
      if (requestId === requestIdRef.current) setMessages(result);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast.error(error.message || "Unable to load messages.");
      }
    } finally {
      if (requestId === requestIdRef.current) setConversationLoading(false);
    }
  };

  const updatePreference = async (contact, action) => {
    const key = `${contact.is_group ? "group" : "user"}:${contact._id}`;
    setRequestId(key);
    try {
      const response = await fetch("/api/conversations/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: contact._id,
          is_group: contact.is_group === 1,
          action,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update this conversation.");
      }
      const updatedContact = {
        ...contact,
        archived: result.archived,
        blocked: result.blocked,
        blockedByPartner: result.blockedByPartner,
      };
      setUsers((current) => current.map((item) =>
        item?._id === contact._id && item?.is_group === contact.is_group
          ? { ...item, ...updatedContact }
          : item
      ));
      setUser((current) =>
        current?._id === contact._id && current?.is_group === contact.is_group
          ? { ...current, ...updatedContact }
          : current
      );
      setMenuFor(null);
      toast.success(
        action === "archive" ? "Conversation archived."
          : action === "unarchive" ? "Conversation unarchived."
            : action === "block" ? "Contact blocked."
              : "Contact unblocked."
      );
    } catch (error) {
      toast.error(error.message || "Unable to update this conversation.");
    } finally {
      setRequestId(null);
    }
  };

  const visibleUsers = (users || []).filter((item) => Boolean(item?.archived) === showArchived);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Conversation folders">
        <button
          type="button"
          role="tab"
          aria-selected={!showArchived}
          className={`rounded-lg px-3 py-2 text-sm ${!showArchived ? "bg-[#263248] text-white" : "text-[#91a0b7] hover:bg-[#1b273b]"}`}
          onClick={() => setShowArchived(false)}
        >
          Chats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showArchived}
          className={`rounded-lg px-3 py-2 text-sm ${showArchived ? "bg-[#263248] text-white" : "text-[#91a0b7] hover:bg-[#1b273b]"}`}
          onClick={() => setShowArchived(true)}
        >
          Archived
        </button>
      </div>
      {isLoading ? (
        <div className="conversation-list-skeleton" role="status" aria-label="Loading conversations">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="conversation-skeleton-row" key={index}>
              <span className="skeleton-shimmer conversation-skeleton-avatar" />
              <span className="conversation-skeleton-copy">
                <span className="skeleton-shimmer conversation-skeleton-name" />
                <span className="skeleton-shimmer conversation-skeleton-preview" />
              </span>
            </div>
          ))}
          <span className="sr-only">Loading conversations...</span>
        </div>
      ) : (
        visibleUsers.length > 0 ? visibleUsers.map((contact) => {
          const isActive = activeUsers.includes(contact?._id);
          const mine = contact?.last_message_sender_id === user?._id;
          const preview = contact?.last_message || (
            contact?.last_message_type === "image" ? "📷 Photo"
              : contact?.last_message_type === "audio" ? "🎤 Voice message"
                : contact?.last_message_type === "video" ? "🎥 Video"
                  : contact?.last_message_attachment ? `📎 ${contact.last_message_attachment}`
                    : ""
          );
          const preferenceKey = `${contact?.is_group ? "group" : "user"}:${contact?._id}`;
          return (
            <div
              key={`${contact?.is_group}:${contact?._id}`}
              className="relative mb-2"
              ref={menuFor === preferenceKey ? menuRef : null}
            >
              <button
                type="button"
                className={`${contact?._id === user?._id && contact?.is_group === user?.is_group ? "bg-[#222f46]" : ""} flex w-full items-center gap-3 rounded-xl p-3 pr-11 text-left hover:bg-[#1b273b]`}
                onClick={() => getMessages(contact)}
              >
                <div className="h-11 w-11 shrink-0 rounded-full bg-[#263248]">
                  <img src={getImageURL(contact?.photo)} alt="" className="h-11 w-11 rounded-full border border-[#394761] object-cover" title={contact?.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center">
                    <span className="truncate text-sm font-semibold text-[#e8edf7]">{contact?.nickname || contact?.name}</span>
                    {isActive && <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-label="Online" />}
                    {contact?.pending > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-indigo-500 px-2 py-0.5 text-xs text-white">{contact.pending}</span>
                    )}
                  </div>
                  {preview && (
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-[#c7d2e3]">
                      {mine && (contact?.last_message_status > 0
                        ? <MdDoneAll className="shrink-0 text-indigo-300" aria-label="Seen" />
                        : <MdDone className="shrink-0 text-[#91a0b7]" aria-label="Sent, not seen" />)}
                      {contact?.is_group === 1 && contact?.last_message_sender_id && (
                        <span className="shrink-0">{mine ? "You:" : ""}</span>
                      )}
                      <span className="truncate">{preview}</span>
                    </p>
                  )}
                  {contact?.is_group !== 1 && (
                    <p className="mt-1 truncate text-xs text-[#91a0b7]">
                      {isActive ? "Active now" : activityFormat(contact?.lastSeenAt)}
                    </p>
                  )}
                  {(contact?.blocked || contact?.blockedByPartner) && (
                    <p className="mt-1 truncate text-xs text-rose-300">
                      {contact?.blocked ? "You blocked this contact" : "This contact blocked you"}
                    </p>
                  )}
                </div>
              </button>
              <button
                type="button"
                className="absolute right-2 top-3 grid h-8 w-8 place-items-center rounded-lg text-[#91a0b7] hover:bg-[#263248] hover:text-white"
                aria-label={`Options for ${contact?.nickname || contact?.name}`}
                aria-expanded={menuFor === preferenceKey}
                onClick={() => setMenuFor((current) => current === preferenceKey ? null : preferenceKey)}
              >
                <FiMoreHorizontal />
              </button>
              {menuFor === preferenceKey && (
                <div className="absolute right-2 top-11 z-40 min-w-48 rounded-xl border border-[#263248] bg-[#111827] p-1 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#e8edf7] hover:bg-[#263248] disabled:opacity-50"
                    disabled={requestId === preferenceKey}
                    onClick={() => updatePreference(contact, contact?.archived ? "unarchive" : "archive")}
                  >
                    <FiArchive />
                    {contact?.archived ? "Unarchive" : "Archive"}
                  </button>
                  {contact?.is_group !== 1 && (
                    contact?.blockedByPartner && !contact?.blocked ? (
                      <p className="px-3 py-2 text-xs text-[#91a0b7]">You cannot change their block setting.</p>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-[#263248] disabled:opacity-50"
                        disabled={requestId === preferenceKey}
                        onClick={() => updatePreference(contact, contact?.blocked ? "unblock" : "block")}
                      >
                        <FiSlash />
                        {contact?.blocked ? "Unblock contact" : "Block contact"}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        }) : (
          <small className="text-sm text-[#91a0b7]">
            {showArchived ? "No archived conversations." : "No conversations found."}
          </small>
        )
      )}
    </div>
  );
};

export default Users;

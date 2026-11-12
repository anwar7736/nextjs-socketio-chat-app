import { useContext, useEffect, useRef, useState } from "react";
import {
  FiArchive,
  FiFile,
  FiImage,
  FiMic,
  FiMoreHorizontal,
  FiPhoneIncoming,
  FiPhoneMissed,
  FiPhoneOutgoing,
  FiSlash,
  FiVideo,
} from "react-icons/fi";
import { MdDone, MdDoneAll } from "react-icons/md";
import { toast } from "sonner";
import { UserContext } from "../contexts/UserContext";
import { MessageContext } from "../contexts/MessageContext";
import { activityFormat, getImageURL, loadConversationTimeline } from "../helpers/helper";
import { UserListContext } from "../contexts/UserListContext";

const conversationDateLabel = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.floor((dayStart.getTime() - dateStart.getTime()) / 86400000);
  if (daysAgo === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  }
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
};

const Users = ({ activeUsers, activityNow, isLoading, setConversationLoading }) => {
  const { user, setUser } = useContext(UserContext);
  const { users, setUsers } = useContext(UserListContext);
  const { setMessages, setCallLogs } = useContext(MessageContext);
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
    setCallLogs([]);
    setUser(data);
    setUsers((current) => current.map((item) =>
      item?._id === data?._id ? { ...item, pending: 0 } : item
    ));
    try {
      const timeline = await loadConversationTimeline(data);
      if (!Array.isArray(timeline.messages)) throw new Error("Unable to load messages.");
      if (requestId === requestIdRef.current) {
        setMessages(timeline.messages);
        setCallLogs(timeline.callLogs);
      }
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
          const isActive = activeUsers.includes(String(contact?._id));
          const activityDate = conversationDateLabel(contact?.last_activity);
          const isCallPreview = contact?.last_activity_kind === "call";
          const isMissedCall = isCallPreview &&
            contact?.last_call_status === "no-answer" &&
            String(contact?.last_call_caller_id) !== String(user?._id);
          const mine = !isCallPreview && contact?.last_message_sender_id === user?._id;
          const callType = contact?.last_call_is_video ? "Video call" : "Voice call";
          const callLabel = isMissedCall
            ? `Missed ${callType.replace(" call", " Call")}`
            : contact?.last_call_status === "no-answer"
              ? callType
              : contact?.last_call_status === "declined"
                ? `Declined · ${callType}`
                : callType;
          const audioDuration = Math.max(0, Number(contact?.last_message_duration_seconds) || 0);
          const audioDurationLabel = audioDuration
            ? ` (${Math.floor(audioDuration / 60)}:${String(audioDuration % 60).padStart(2, "0")})`
            : "";
          const mediaPreview = {
            image: { Icon: FiImage, text: "Photo" },
            audio: { Icon: FiMic, text: `Voice message${audioDurationLabel}` },
            video: { Icon: FiVideo, text: "Video" },
            file: { Icon: FiFile, text: contact?.last_message_attachment || "Attachment" },
          }[contact?.last_message_type];
          const PreviewIcon = isCallPreview
            ? isMissedCall
              ? FiPhoneMissed
              : contact?.last_call_is_video
                ? FiVideo
                : String(contact?.last_call_caller_id) === String(user?._id)
                  ? FiPhoneOutgoing
                  : FiPhoneIncoming
            : mediaPreview?.Icon;
          const preview = isCallPreview
            ? callLabel
            : mediaPreview?.text || contact?.last_message || "";
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
                  <img src={getImageURL(contact?.photo)} alt="" className="h-11 w-11 rounded-full border border-[#394761] object-cover" title={contact?.nickname || contact?.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center">
                    <span className="truncate text-sm font-semibold text-[#e8edf7]">{contact?.nickname || contact?.name}</span>
                    {isActive && (
                      <span
                        className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                        aria-label="Online"
                        title={activityFormat(contact?.lastSeenAt || Date.now(), activityNow)}
                      />
                    )}
                    {activityDate && (
                      <span className="ml-auto shrink-0 pl-2 text-[11px] text-[#91a0b7]">
                        {activityDate}
                      </span>
                    )}
                    {contact?.pending > 0 && (
                      <span className="ml-2 shrink-0 rounded-full bg-indigo-500 px-2 py-0.5 text-xs text-white">{contact.pending}</span>
                    )}
                  </div>
                  {preview && (
                    <p className={`mt-1 flex items-center gap-1 truncate text-xs ${isMissedCall ? "text-rose-300" : "text-[#c7d2e3]"}`}>
                      {mine && (contact?.last_message_status > 0
                        ? <MdDoneAll className="shrink-0 text-indigo-300" aria-label="Seen" />
                        : <MdDone className="shrink-0 text-[#91a0b7]" aria-label="Sent, not seen" />)}
                      {contact?.is_group === 1 && contact?.last_message_sender_id && (
                        <span className="shrink-0">{mine ? "You:" : ""}</span>
                      )}
                      {PreviewIcon && (
                        <PreviewIcon
                          className={`shrink-0 ${!isCallPreview && contact?.last_message_type === "audio" ? "text-emerald-400" : ""}`}
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{preview}</span>
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

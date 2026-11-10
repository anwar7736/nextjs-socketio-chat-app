import { useContext, useEffect, useRef, useState } from "react";
import { dateTimeFormat, getImageURL, socket_connection } from "../helpers/helper";
import { AuthContext } from "../contexts/AuthContext";
import { toast } from "react-toastify";
import { MessageContext } from "../contexts/MessageContext";

const socket = socket_connection();
const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const Messages = () => {
  const elementRef = useRef(null);
  const holdTimerRef = useRef(null);
  const touchStartXRef = useRef(null);
  const ignoreNextClickRef = useRef(false);
  const { user } = useContext(AuthContext);
  const { messages, setMessages } = useContext(MessageContext);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    elementRef.current?.scrollTo({
      top: elementRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const closePreview = (event) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", closePreview);
    return () => window.removeEventListener("keydown", closePreview);
  }, []);

  const removeMessage = async (msg) => {
    const method = msg?.sender?._id === user?._id ? "DELETE" : "PATCH";
    const response = await fetch(`/api/messages/${msg?._id}`, { method });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to remove this message.");
    }

    if (method === "DELETE") {
      const deletedMessageId = result.message_id;
      setMessages((current) => (current || []).filter((item) =>
        item?._id !== result.log_id && item?.message_id !== deletedMessageId
      ));
      socket.emit("message-deleted", JSON.stringify({
        _id: result.log_id,
        message_id: result.message_id,
        sender: { _id: msg?.sender?._id },
        receiver: { _id: msg?.group?._id || msg?.receiver?._id },
        recipient_ids: result.recipient_ids,
      }));
    } else {
      setMessages((current) => (current || []).filter((item) => item?._id !== msg?._id));
    }
  };

  const handleRemoveMsg = async (msg) => {
    setActionMessage(null);
    try {
      await removeMessage(msg);
    } catch (error) {
      toast.error(error.message || "Unable to remove this message.");
    }
  };

  const removeSelected = async () => {
    const selected = (messages || []).filter((msg) => selectedIds.includes(msg?._id));
    for (const msg of selected) {
      try {
        await removeMessage(msg);
      } catch (error) {
        toast.error(error.message || "Unable to remove a selected message.");
        return;
      }
    }
    setSelectedIds([]);
  };

  const toggleSelected = (messageId) => {
    setSelectedIds((current) => current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId]);
    setActionMessage(null);
  };

  const applyReaction = async (msg, emoji) => {
    setActionMessage(null);
    try {
      const response = await fetch(`/api/messages/${msg?._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to add this reaction.");
      }
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === result.message_id ? { ...item, reactions: result.reactions } : item
      ));
      socket.emit("message-reaction", result.socket_event);
    } catch (error) {
      toast.error(error.message || "Unable to add this reaction.");
    }
  };

  const requestReply = (msg) => {
    setActionMessage(null);
    window.dispatchEvent(new CustomEvent("chat:reply", {
      detail: {
        message_id: msg?.message_id,
        sender: msg?.sender?.name || "You",
        text: msg?.message?.message || msg?.message?.attachmentName || "Attachment",
      },
    }));
  };

  if (!socket) return null;

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="message-selection-bar">
          <button type="button" onClick={() => setSelectedIds([])} aria-label="Cancel selection">×</button>
          <span>{selectedIds.length} selected</span>
          <button type="button" className="message-delete-selected" onClick={removeSelected}>
            Delete selected
          </button>
        </div>
      )}
      <div className="message-scroll" id="root" ref={elementRef}>
        {(messages || []).map((data) => {
          const sender = data?.sender;
          const receiver = data?.receiver;
          if (receiver?._id === user?._id && data?.status === 2) return null;

          const mine = sender?._id === user?._id;
          const selected = selectedIds.includes(data?._id);
          const reactions = data?.reactions || data?.message?.reactions || [];
          const repliedTo = (messages || []).find((item) => item?.message_id === data?.message?.reply_to);
          return (
            <div key={data?._id} className={`message-row mb-5 ${selected ? "is-selected" : ""}`}>
              {!mine && <div className="mb-1 ml-11 text-xs text-[#91a0b7]">{sender?.name}</div>}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && (
                  <img
                    src={getImageURL(sender?.photo)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border border-[#394761] object-cover"
                    title={sender?.name}
                  />
                )}
                {selectedIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(data?._id)}
                    aria-label={`Select message from ${sender?.name || "you"}`}
                    className="mb-3 h-5 w-5 accent-indigo-500"
                  />
                )}
                <div className="message-action-anchor">
                  <div
                    className={`max-w-[min(85vw,36rem)] cursor-pointer rounded-2xl px-4 py-3 shadow-lg shadow-black/10 ${
                      mine
                        ? "rounded-br-md border border-indigo-400/20 bg-indigo-500 text-white"
                        : "rounded-bl-md border border-[#263248] bg-[#182235] text-[#e8edf7]"
                    }`}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setActionMessage(data?._id);
                    }}
                    onTouchStart={(event) => {
                      touchStartXRef.current = event.touches[0]?.clientX;
                      holdTimerRef.current = setTimeout(() => {
                        ignoreNextClickRef.current = true;
                        setActionMessage(data?._id);
                      }, 550);
                    }}
                    onTouchEnd={(event) => {
                      clearTimeout(holdTimerRef.current);
                      const endX = event.changedTouches[0]?.clientX;
                      if (touchStartXRef.current != null && endX - touchStartXRef.current > 70) {
                        requestReply(data);
                      }
                      touchStartXRef.current = null;
                    }}
                    onTouchMove={() => clearTimeout(holdTimerRef.current)}
                    onDoubleClick={() => setActionMessage(data?._id)}
                    onClick={(event) => {
                      if (ignoreNextClickRef.current) {
                        ignoreNextClickRef.current = false;
                        return;
                      }
                      if (event.target.closest(".message-action-menu") || event.target.closest("button")) return;
                      if (selectedIds.length) toggleSelected(data?._id);
                      else if (actionMessage === data?._id) setActionMessage(null);
                    }}
                    aria-label="Message actions: press and hold or right-click"
                  >
                    {data?.message?.reply_to && (
                      <p className="mb-2 max-w-full truncate border-l-2 border-white/50 pl-2 text-xs opacity-80">
                        ↪ {repliedTo?.sender?.name || "Message"}: {repliedTo?.message?.message || repliedTo?.message?.attachmentName || "Reply"}
                      </p>
                    )}
                    <MessageContent message={data?.message} onPreview={setPreview} />
                  </div>
                  {reactions.length > 0 && (
                    <div className={`message-reactions ${mine ? "right-0" : "left-0"}`}>
                      {quickReactions.map((emoji) => {
                        const count = reactions.filter((reaction) => reaction.emoji === emoji).length;
                        return count ? <span key={emoji}>{emoji} {count}</span> : null;
                      })}
                    </div>
                  )}
                  {actionMessage === data?._id && (
                    <div className={`message-action-menu ${mine ? "right-0" : "left-0"}`} role="toolbar" aria-label="Message actions">
                      <div className="flex items-center gap-1">
                        {quickReactions.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => applyReaction(data, emoji)} aria-label={`React ${emoji}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1 flex justify-end gap-2 border-t border-white/10 pt-1">
                        <button type="button" onClick={() => requestReply(data)}>Reply</button>
                        <button type="button" onClick={() => toggleSelected(data?._id)}>Select</button>
                        <button type="button" className="text-rose-300" onClick={() => handleRemoveMsg(data)}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
                {mine && (
                  <img
                    src={getImageURL(user?.photo)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border border-indigo-400 object-cover"
                    title={user?.name}
                  />
                )}
              </div>
              <div className={`mt-1 text-xs text-[#728099] ${mine ? "mr-10 text-right" : "ml-10"}`}>
                {dateTimeFormat(data?.message?.createdAt)}
              </div>
            </div>
          );
        })}
      </div>
      {preview && (
        <div className="photo-preview-overlay" role="dialog" aria-modal="true" aria-label="Photo preview">
          <button type="button" className="photo-preview-back" onClick={() => setPreview(null)} aria-label="Back to conversation">
            <span aria-hidden="true">←</span> Back
          </button>
          <img src={preview.src} alt={preview.alt} />
        </div>
      )}
    </>
  );
};

function MessageContent({ message, onPreview }) {
  if (!message?.attachmentUrl) {
    return <p className="whitespace-pre-wrap break-words">{message?.message}</p>;
  }

  if (message.type === "image") {
    return (
      <div>
        <button type="button" className="block" onClick={() => onPreview({ src: message.attachmentUrl, alt: message.attachmentName || "Shared image" })}>
          <img
            src={message.attachmentUrl}
            alt={message.attachmentName || "Shared image"}
            className="max-h-80 max-w-full rounded-xl object-contain"
          />
        </button>
        {message.message && <p className="mt-2 whitespace-pre-wrap break-words">{message.message}</p>}
      </div>
    );
  }

  if (message.type === "audio") {
    return (
      <div>
        <audio controls preload="metadata" src={message.attachmentUrl} className="max-w-full" />
        <p className="mt-1 text-xs opacity-75">{message.attachmentName || "Voice message"}</p>
      </div>
    );
  }

  if (message.type === "video") {
    return (
      <div>
        <video controls preload="metadata" src={message.attachmentUrl} className="max-h-80 max-w-full rounded-xl" />
        {message.attachmentName && <p className="mt-1 text-xs opacity-75">{message.attachmentName}</p>}
      </div>
    );
  }

  return (
    <a className="underline underline-offset-2" href={message.attachmentUrl} target="_blank" rel="noreferrer" download>
      {message.attachmentName || "Download attachment"}
    </a>
  );
}

export default Messages;

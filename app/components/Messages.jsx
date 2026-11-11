import { useCallback, useContext, useEffect, useRef, useState } from "react";
import Picker from "emoji-picker-react";
import { FiArrowLeft, FiChevronDown, FiCornerUpLeft, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { dateTimeFormat, getImageURL, socket_connection } from "../helpers/helper";
import { AuthContext } from "../contexts/AuthContext";
import { UserContext } from "../contexts/UserContext";
import { toast } from "react-toastify";
import { MessageContext } from "../contexts/MessageContext";

const socket = socket_connection();
const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const HOLD_MS = 450;       // press and hold this long to select (like WhatsApp)
const SWIPE_REPLY_PX = 64; // drag a message right this far to reply
const SWIPE_MAX_PX = 90;

const Messages = () => {
  const elementRef = useRef(null);
  const holdTimerRef = useRef(null);
  const touchRef = useRef(null); // { id, x, y, dx, swiping, held }
  const { user } = useContext(AuthContext);
  const { user: conversationUser } = useContext(UserContext);
  const { messages, setMessages } = useContext(MessageContext);
  const [selectedIds, setSelectedIds] = useState([]);
  const [reactionFor, setReactionFor] = useState(null); // message whose reaction bar is open
  const [emojiPickerFor, setEmojiPickerFor] = useState(null);
  const [reactionDetailsFor, setReactionDetailsFor] = useState(null);
  const [reactionFilter, setReactionFilter] = useState("all");
  const [swipe, setSwipe] = useState({ id: null, dx: 0 });
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const selecting = selectedIds.length > 0;

  // Stay at the newest message: on new messages, and while photos/videos above it finish loading
  // (each one makes the list taller). Someone who scrolled up to read older messages is left alone.
  const stickToBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false); // the ↓ button, shown once scrolled up
  const [unseen, setUnseen] = useState(0);         // messages that arrived while scrolled up
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    const count = (messages || []).length;
    const added = count - lastCountRef.current;
    const firstLoad = lastCountRef.current === 0;
    lastCountRef.current = count;
    if (firstLoad || (added > 0 && stickToBottomRef.current)) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstLoad ? "auto" : "smooth" });
      stickToBottomRef.current = true;
    } else if (added > 0) {
      setUnseen((n) => n + added);
    }
  }, [messages]);

  const jumpToBottom = () => {
    const el = elementRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 160;
      setShowJump(distance > 300);
      if (distance < 160) setUnseen(0);
    };
    const onMediaLoad = () => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("load", onMediaLoad, true); // img load events do not bubble: capture them
    el.addEventListener("loadedmetadata", onMediaLoad, true);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("load", onMediaLoad, true);
      el.removeEventListener("loadedmetadata", onMediaLoad, true);
    };
  }, []);

  // a message removed elsewhere (real-time delete) leaves the selection too
  useEffect(() => {
    const present = new Set((messages || []).map((item) => item?._id));
    setSelectedIds((current) => {
      const next = current.filter((id) => present.has(id));
      return next.length === current.length ? current : next;
    });
  }, [messages]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setReactionFor(null);
  }, []);

  /* ---------- photo preview: the phone's back button closes it and stays in this conversation ---------- */
  const openPreview = (data) => {
    window.history.pushState({ chatPreview: true }, "");
    setPreview(data);
  };
  const closePreview = useCallback(() => {
    if (window.history.state?.chatPreview) window.history.back(); // popstate below clears it
    else setPreview(null);
  }, []);
  useEffect(() => {
    const onPop = () => setPreview(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (deleteConfirmationOpen) setDeleteConfirmationOpen(false);
      else if (reactionDetailsFor) setReactionDetailsFor(null);
      else if (emojiPickerFor) setEmojiPickerFor(null);
      else if (preview) closePreview();
      else clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, deleteConfirmationOpen, reactionDetailsFor, emojiPickerFor, closePreview, clearSelection]);

  useEffect(() => {
    if (!emojiPickerFor) return;
    const closeOnOutsidePointer = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".reaction-picker-popover, .reaction-more-button")) return;
      setEmojiPickerFor(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [emojiPickerFor]);

  /* ---------- delete ---------- */
  const removeMessage = async (msg) => {
    const method = msg?.sender?._id === user?._id ? "DELETE" : "PATCH"; // mine: for everyone, theirs: for me
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`/api/messages/${msg?._id}`, {
        method,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("The delete request timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const result = await response.json().catch(() => ({}));
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

  const openDeleteConfirmation = () => {
    if (selectedIds.length && !deleting) setDeleteConfirmationOpen(true);
  };

  const confirmDeleteSelected = async () => {
    const selected = (messages || []).filter((msg) => selectedIds.includes(msg?._id));
    if (!selected.length || deleting) return;
    setDeleteConfirmationOpen(false);
    setDeleting(true);
    try {
      const results = await Promise.allSettled(selected.map((msg) => removeMessage(msg)));
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
      clearSelection();
    } catch (error) {
      toast.error(error.message || "Unable to remove a selected message.");
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- selection ---------- */
  const menuOpenedAtRef = useRef(0);
  const startSelection = (data) => {
    navigator.vibrate?.(25);
    menuOpenedAtRef.current = Date.now();
    setSelectedIds((current) => (current.includes(data?._id) ? current : [...current, data?._id]));
    setReactionFor(data?._id);
  };

  const toggleSelected = (messageId) => {
    setSelectedIds((current) => {
      const next = current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId];
      setReactionFor(next.length === 1 ? next[0] : null);
      return next;
    });
  };

  /* ---------- reactions & reply ---------- */
  const applyReaction = async (msg, emoji) => {
    clearSelection();
    setEmojiPickerFor(null);
    try {
      const response = await fetch(`/api/messages/${msg?._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to add this reaction.");
      }
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === result.message_id
          ? { ...item, reactions: undefined, message: { ...item.message, reactions: result.reactions } }
          : item
      ));
      socket.emit("message-reaction", result.socket_event);
    } catch (error) {
      toast.error(error.message || "Unable to add this reaction.");
    }
  };

  const requestReply = (msg) => {
    clearSelection();
    window.dispatchEvent(new CustomEvent("chat:reply", {
      detail: {
        message_id: msg?.message_id,
        sender: msg?.sender?._id === user?._id ? "You" : msg?.sender?.name || "Message",
        text: msg?.message?.message || msg?.message?.attachmentName || "Attachment",
      },
    }));
  };

  /* ---------- touch: hold = select, drag right = reply ---------- */
  // one long press = one select/toggle, whether the timer or Android's own long-press contextmenu fires first
  const holdSelect = (data) => {
    const state = touchRef.current;
    if (state) {
      if (state.held || state.swiping) return;
      state.held = true;
    }
    clearTimeout(holdTimerRef.current);
    if (selecting) toggleSelected(data?._id);
    else startSelection(data);
  };

  const onTouchStart = (event, data) => {
    const touch = event.touches[0];
    touchRef.current = { id: data?._id, x: touch.clientX, y: touch.clientY, dx: 0, swiping: false, held: false };
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => holdSelect(data), HOLD_MS);
  };

  const onTouchMove = (event) => {
    const state = touchRef.current;
    if (!state) return;
    const touch = event.touches[0];
    const dx = touch.clientX - state.x;
    const dy = touch.clientY - state.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(holdTimerRef.current);
    if (!state.swiping && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5 && !selecting) state.swiping = true;
    if (state.swiping) {
      state.dx = Math.max(0, Math.min(SWIPE_MAX_PX, dx));
      setSwipe({ id: state.id, dx: state.dx });
    }
  };

  const onTouchEnd = (event, data) => {
    clearTimeout(holdTimerRef.current);
    const state = touchRef.current;
    // after a long press or a swipe the browser may still send a "click" at that spot, where the
    // reaction bar has just appeared: cancel it so it cannot pick an emoji or undo the selection
    if ((state?.held || state?.swiping) && event?.cancelable) event.preventDefault();
    if (state?.swiping && state.dx >= SWIPE_REPLY_PX) {
      navigator.vibrate?.(15);
      requestReply(data);
    }
    setSwipe({ id: null, dx: 0 });
    // keep "held"/"swiping" until the click (and Android's late contextmenu) that follow the touch have been ignored
    const ended = state;
    setTimeout(() => { if (touchRef.current === ended) touchRef.current = null; }, 450);
  };

  const onBubbleClick = (event, data) => {
    if (touchRef.current?.held || touchRef.current?.swiping) return;
    if (event.target.closest("a, audio, video, .message-media-button")) {
      if (!selecting) return; // let links, players and photos work normally
      event.preventDefault();
    }
    if (selecting) toggleSelected(data?._id);
  };

  if (!socket) return null;

  const selectedMessages = (messages || []).filter((msg) => selectedIds.includes(msg?._id));
  const lastSeenMessageByUser = new Map();
  for (const msg of messages || []) {
    if (msg?.sender?._id !== user?._id) continue;
    for (const viewer of msg?.seen_by || []) {
      lastSeenMessageByUser.set(viewer?._id, { ...viewer, messageId: msg?._id });
    }
  }
  const seenMessageIds = new Set(
    [...lastSeenMessageByUser.values()].map((viewer) => viewer.messageId)
  );
  const reactionDetailsMessage = (messages || []).find((msg) => msg?._id === reactionDetailsFor);
  const reactionDetails = reactionDetailsMessage?.message?.reactions || [];
  const reactionDetailsGroups = reactionDetails.reduce((groups, reaction) => {
    groups.set(reaction.emoji, (groups.get(reaction.emoji) || 0) + 1);
    return groups;
  }, new Map());
  const filteredReactionDetails = reactionFilter === "all"
    ? reactionDetails
    : reactionDetails.filter((reaction) => reaction.emoji === reactionFilter);
  const ownSelectedCount = selectedMessages.filter((msg) => msg?.sender?._id === user?._id).length;
  const receivedSelectedCount = selectedMessages.length - ownSelectedCount;

  return (
    <>
      {selecting && (
        <div className="message-selection-bar" role="toolbar" aria-label="Selected messages">
          <button type="button" className="selection-icon-button" onClick={clearSelection} aria-label="Cancel selection" title="Cancel">
            <FiX />
          </button>
          <span className="font-semibold">{selectedIds.length}</span>
          <span className="text-sm text-[#91a0b7]">selected</span>
          <div className="ml-auto flex items-center gap-1">
            {selectedIds.length === 1 && (
              <button type="button" className="selection-icon-button" onClick={() => requestReply(selectedMessages[0])} aria-label="Reply" title="Reply">
                <FiCornerUpLeft />
              </button>
            )}
            <button
              type="button"
              className="selection-icon-button is-danger"
              onClick={openDeleteConfirmation}
              disabled={deleting}
              aria-label={`Delete ${selectedIds.length} selected`}
              title="Delete"
            >
              <FiTrash2 />
            </button>
          </div>
        </div>
      )}
      {deleteConfirmationOpen && (
        <div
          className="confirmation-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeleteConfirmationOpen(false);
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirmation-title"
            aria-describedby="delete-confirmation-description"
          >
            <button
              type="button"
              className="confirmation-close"
              onClick={() => setDeleteConfirmationOpen(false)}
              aria-label="Close delete confirmation"
            >
              <FiX />
            </button>
            <h2 id="delete-confirmation-title">
              Delete {selectedIds.length} message{selectedIds.length > 1 ? "s" : ""}?
            </h2>
            <p id="delete-confirmation-description">
              {ownSelectedCount > 0 &&
                `${ownSelectedCount} of your message${ownSelectedCount > 1 ? "s" : ""} will be deleted for everyone.`}
              {ownSelectedCount > 0 && receivedSelectedCount > 0 && " "}
              {receivedSelectedCount > 0 &&
                `${receivedSelectedCount} received message${receivedSelectedCount > 1 ? "s" : ""} will be removed for you.`}
            </p>
            <div className="confirmation-actions">
              <button type="button" className="confirmation-cancel" onClick={() => setDeleteConfirmationOpen(false)}>
                Cancel
              </button>
              <button type="button" className="confirmation-accept is-danger" onClick={confirmDeleteSelected}>
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
      {reactionDetailsFor && reactionDetailsMessage && (
        <div
          className="reaction-details-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setReactionDetailsFor(null);
          }}
        >
          <section
            className="reaction-details-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reaction-details-title"
          >
            <header className="reaction-details-header">
              <h2 id="reaction-details-title">Reactions</h2>
              <button type="button" onClick={() => setReactionDetailsFor(null)} aria-label="Close reactions">
                <FiX />
              </button>
            </header>
            <div className="reaction-details-tabs" role="tablist" aria-label="Filter reactions">
              <button
                type="button"
                className={reactionFilter === "all" ? "is-active" : ""}
                onClick={() => setReactionFilter("all")}
              >
                All {reactionDetails.length}
              </button>
              {[...reactionDetailsGroups.entries()].map(([emoji, count]) => (
                <button
                  type="button"
                  key={emoji}
                  className={reactionFilter === emoji ? "is-active" : ""}
                  onClick={() => setReactionFilter(emoji)}
                >
                  {emoji} {count}
                </button>
              ))}
            </div>
            <div className="reaction-details-list">
              {filteredReactionDetails.map((reaction, index) => (
                <div className="reaction-person" key={`${reaction.user_id}-${reaction.emoji}-${index}`}>
                  <img src={getImageURL(reaction.photo)} alt="" />
                  <span>{reaction.name || "Conversation member"}</span>
                  <span className="reaction-person-emoji">{reaction.emoji}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <div className="message-scroll" id="root" ref={elementRef}>
        {(messages || []).map((data) => {
          const sender = data?.sender;
          const receiver = data?.receiver;
          if (receiver?._id === user?._id && data?.status === 2) return null;

          const mine = sender?._id === user?._id;
          const selected = selectedIds.includes(data?._id);
          const reactions = data?.message?.reactions || data?.reactions || [];
          const messageReactionGroups = reactions.reduce((groups, reaction) => {
            groups.set(reaction.emoji, (groups.get(reaction.emoji) || 0) + 1);
            return groups;
          }, new Map());
          const repliedTo = (messages || []).find((item) => item?.message_id === data?.message?.reply_to);
          const dx = swipe.id === data?._id ? swipe.dx : 0;
          return (
            <div
              key={data?._id}
              className={`message-row ${reactions.length ? "mb-7" : "mb-4"} ${selected ? "is-selected" : ""} ${selecting ? "is-selecting" : ""}`}
              onClick={(event) => {
                // in selection mode a tap anywhere on the row toggles it
                if (selecting && !event.target.closest(".message-bubble, .message-action-menu")) toggleSelected(data?._id);
              }}
            >
              {!mine && (
                <div className="mb-1 ml-11 text-xs text-[#91a0b7]">
                  {conversationUser?.is_group === 1 ? sender?.name : conversationUser?.nickname || sender?.name}
                </div>
              )}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && (
                  <img
                    src={getImageURL(sender?.photo)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border border-[#394761] object-cover"
                    title={sender?.name}
                  />
                )}
                <div className="message-action-anchor">
                  {dx > 0 && (
                    <span className="swipe-reply-hint" style={{ opacity: Math.min(1, dx / SWIPE_REPLY_PX) }} aria-hidden="true">
                      <FiCornerUpLeft />
                    </span>
                  )}
                  <div
                    className={`message-bubble max-w-[min(80vw,36rem)] select-none rounded-2xl px-4 py-3 shadow-lg shadow-black/10 ${
                      mine
                        ? "rounded-br-md border border-indigo-400/20 bg-indigo-500 text-white"
                        : "rounded-bl-md border border-[#263248] bg-[#182235] text-[#e8edf7]"
                    }`}
                    style={dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      holdSelect(data); // right-click on desktop, long-press on Android
                    }}
                    onTouchStart={(event) => onTouchStart(event, data)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={(event) => onTouchEnd(event, data)}
                    onTouchCancel={(event) => onTouchEnd(event, data)}
                    onClick={(event) => onBubbleClick(event, data)}
                  >
                    {!selecting && (
                      <button
                        type="button"
                        className="message-more-button"
                        onClick={(event) => { event.stopPropagation(); startSelection(data); }}
                        aria-label="Message options"
                        title="Options"
                      >
                        <FiChevronDown />
                      </button>
                    )}
                    {data?.message?.reply_to && (
                      <p className="mb-2 max-w-full truncate rounded-md border-l-2 border-white/50 bg-black/10 px-2 py-1 text-xs opacity-90">
                        ↪ {repliedTo?.sender?._id === user?._id ? "You" : repliedTo?.sender?.name || "Message"}: {repliedTo?.message?.message || repliedTo?.message?.attachmentName || "Reply"}
                      </p>
                    )}
                    <MessageContent message={data?.message} onPreview={selecting ? null : openPreview} />
                  </div>
                  {reactions.length > 0 && (
                    <div className={`message-reactions ${mine ? "right-2" : "left-2"}`}>
                      {[...messageReactionGroups.entries()].map(([emoji, count]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setReactionDetailsFor(data?._id);
                            setReactionFilter(emoji);
                          }}
                          aria-label={`${count} reaction${count === 1 ? "" : "s"} with ${emoji}`}
                        >
                          {emoji}{count > 1 ? ` ${count}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {reactionFor === data?._id && selectedIds.length === 1 && selected && (
                    <div className={`message-action-menu ${mine ? "right-0" : "left-0"}`} role="toolbar" aria-label="React to message">
                      {quickReactions.map((emoji) => {
                        const mineReaction = reactions.some((reaction) => reaction.user_id === user?._id && reaction.emoji === emoji);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={mineReaction ? "is-active" : ""}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (Date.now() - menuOpenedAtRef.current < 500) return; // the finger that opened the bar
                              applyReaction(data, emoji);
                            }}
                            aria-label={`React ${emoji}`}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="reaction-more-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEmojiPickerFor((current) => current === data?._id ? null : data?._id);
                        }}
                        aria-label="More emoji reactions"
                        title="More emoji"
                      >
                        <FiPlus />
                      </button>
                    </div>
                  )}
                  {emojiPickerFor === data?._id && (
                    <div
                      className={`reaction-picker-popover ${mine ? "right-0" : "left-0"}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Picker
                        theme="dark"
                        width="min(320px, 85vw)"
                        height={360}
                        lazyLoadEmojis
                        previewConfig={{ showPreview: false }}
                        onEmojiClick={(emoji) => applyReaction(data, emoji.emoji)}
                      />
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
              {mine && seenMessageIds.has(data?._id) && (
                <div className="message-seen-avatars" aria-label="Seen by">
                  {[...lastSeenMessageByUser.values()]
                    .filter((viewer) => viewer.messageId === data?._id)
                    .slice(0, 4)
                    .map((viewer) => (
                      <img
                        key={viewer._id}
                        src={getImageURL(viewer.photo)}
                        alt={`Seen by ${viewer.name || "conversation member"}`}
                        title={`Seen by ${viewer.name || "conversation member"}`}
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showJump && (
        <button type="button" className="jump-to-bottom" onClick={jumpToBottom} aria-label="Scroll to the newest message" title="Newest messages">
          <FiChevronDown />
          {unseen > 0 && <span className="jump-badge">{unseen > 99 ? "99+" : unseen}</span>}
        </button>
      )}
      {preview && (
        <div className="photo-preview-overlay" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
          <div className="photo-preview-bar">
            <button type="button" className="photo-preview-back" onClick={closePreview} aria-label="Back to conversation" title="Back">
              <FiArrowLeft />
            </button>
            <span className="min-w-0 truncate text-sm text-[#c7d2e3]">{preview.alt}</span>
          </div>
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
        <button
          type="button"
          className="message-media-button block"
          onClick={() => onPreview?.({ src: message.attachmentUrl, alt: message.attachmentName || "Shared image" })}
        >
          <img
            src={message.attachmentUrl}
            alt={message.attachmentName || "Shared image"}
            className="max-h-80 max-w-full rounded-xl object-contain"
            draggable={false}
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

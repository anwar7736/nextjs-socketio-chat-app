import { useCallback, useContext, useEffect, useRef, useState } from "react";
import Picker from "emoji-picker-react";
import { FiAlertCircle, FiArrowLeft, FiChevronDown, FiClock, FiCopy, FiCornerUpLeft, FiEdit2, FiPhoneIncoming, FiPhoneMissed, FiPhoneOutgoing, FiPlus, FiTrash2, FiVideo, FiX } from "react-icons/fi";
import { dateTimeFormat, getImageURL, socket_connection } from "../helpers/helper";
import { AuthContext } from "../contexts/AuthContext";
import { UserContext } from "../contexts/UserContext";
import { toast } from "sonner";
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
  const { messages, setMessages, callLogs, setCallLogs, pendingMessages } = useContext(MessageContext);
  // messages this device is still sending in this conversation (shown at once, like WhatsApp)
  const localMessages = (pendingMessages || []).filter((item) => item.conversationId === String(conversationUser?._id));
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionType, setSelectionType] = useState(null);
  const [reactionFor, setReactionFor] = useState(null); // message whose reaction bar is open
  const [emojiPickerFor, setEmojiPickerFor] = useState(null);
  const [reactionDetailsFor, setReactionDetailsFor] = useState(null);
  const [reactionFilter, setReactionFilter] = useState("all");
  const [swipe, setSwipe] = useState({ id: null, dx: 0 });
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState("default");
  const [callDeleteConfirmationOpen, setCallDeleteConfirmationOpen] = useState(false);
  const [callDeleteMode, setCallDeleteMode] = useState("for-me");
  const [deletingCall, setDeletingCall] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const messagesRef = useRef(messages);
  const callLogsRequestRef = useRef(0);
  messagesRef.current = messages;
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
    const visibleCallLogs = (callLogs || []).filter((item) =>
      String(item?.conversationId) === String(conversationUser?._id) &&
      Boolean(item?.isGroup) === (Number(conversationUser?.is_group) === 1)
    );
    const count = (messages || []).length + visibleCallLogs.length;
    const added = count - lastCountRef.current;
    const firstLoad = lastCountRef.current === 0;
    lastCountRef.current = count;
    if (firstLoad || (added > 0 && stickToBottomRef.current)) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstLoad ? "auto" : "smooth" });
      stickToBottomRef.current = true;
    } else if (added > 0) {
      setUnseen((n) => n + added);
    }
  }, [messages, callLogs, conversationUser?._id, conversationUser?.is_group]);

  // sending a message always brings the chat to the bottom
  const localCountRef = useRef(0);
  useEffect(() => {
    const el = elementRef.current;
    if (el && localMessages.length > localCountRef.current) {
      stickToBottomRef.current = true;
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
    }
    localCountRef.current = localMessages.length;
  }, [localMessages.length]);

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

  useEffect(() => {
    let active = true;
    const loadCallLogs = async () => {
      const requestId = ++callLogsRequestRef.current;
      try {
        const query = new URLSearchParams({
          conversation_id: String(conversationUser?._id || ""),
          is_group: Number(conversationUser?.is_group) === 1 ? "1" : "0",
        });
        const response = await fetch(`/api/calls/history?${query}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load call history.");
        }
        if (active && requestId === callLogsRequestRef.current) {
          setCallLogs(Array.isArray(result.data) ? result.data : []);
        }
      } catch (error) {
        if (active) {
          console.error("Unable to load conversation call history:", error);
          toast.error(error.message || "Unable to load call history.");
        }
      }
    };
    const refreshCallLogs = () => loadCallLogs();
    const onCallLogDeleted = ({ callId }) => {
      setCallLogs((current) => (current || []).filter((item) => item?.callId !== callId));
      window.dispatchEvent(new Event("chat:refresh-conversations"));
    };
    window.addEventListener("chat:refresh-call-logs", refreshCallLogs);
    socket.on("call-log-deleted", onCallLogDeleted);
    return () => {
      active = false;
      window.removeEventListener("chat:refresh-call-logs", refreshCallLogs);
      socket.off("call-log-deleted", onCallLogDeleted);
    };
  }, [conversationUser?._id, conversationUser?.is_group]);

  // a message removed elsewhere (real-time delete) leaves the selection too
  useEffect(() => {
    const present = new Set([
      ...(messages || []).map((item) => item?._id),
      ...(callLogs || []).map((item) => item?._id),
    ]);
    setSelectedIds((current) => {
      const next = current.filter((id) => present.has(id));
      return next.length === current.length ? current : next;
    });
  }, [messages, callLogs]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectionType(null);
    setReactionFor(null);
  }, []);

  /* ---------- photo preview: the phone's back button closes it and stays in this conversation ---------- */
  const openPreview = (data) => {
    window.history.pushState({ ...(window.history.state || {}), chatPreview: true }, "");
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
    const onSearch = (event) => {
      if (event.detail?.item) {
        const item = event.detail.item;
        const loaded = (messagesRef.current || []).some((current) => current?._id === item._id);
        if (!loaded) {
          setMessages((current) => [...(current || []), item].sort((a, b) =>
            new Date(a.message?.createdAt || 0).getTime() - new Date(b.message?.createdAt || 0).getTime()
          ));
        }
        window.setTimeout(() => {
          document.getElementById(`message-${item._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        return;
      }
      const query = String(event.detail?.query || "").trim().toLowerCase();
      if (!query) return;
      const match = (messagesRef.current || []).find((item) =>
        String(item?.message?.message || "").toLowerCase().includes(query)
      );
      if (!match) {
        toast.info("No matching message in the loaded conversation.");
        return;
      }
      document.getElementById(`message-${match._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("chat:search", onSearch);
    return () => window.removeEventListener("chat:search", onSearch);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (deleteConfirmationOpen) setDeleteConfirmationOpen(false);
      else if (callDeleteConfirmationOpen) setCallDeleteConfirmationOpen(false);
      else if (reactionDetailsFor) setReactionDetailsFor(null);
      else if (emojiPickerFor) setEmojiPickerFor(null);
      else if (preview) closePreview();
      else clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, deleteConfirmationOpen, callDeleteConfirmationOpen, reactionDetailsFor, emojiPickerFor, closePreview, clearSelection]);

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
  const removeMessage = async (msg, mode = "default") => {
    const mine = msg?.sender?._id === user?._id;
    const deleteForEveryone = mine && mode !== "for-me";
    const method = deleteForEveryone ? "DELETE" : "PATCH";
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

    if (deleteForEveryone) {
      const deletedMessageId = result.message_id;
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === deletedMessageId
          ? { ...item, message: { ...item.message, message: "", attachmentUrl: "", attachmentName: "", deletedForEveryone: true, reactions: [] } }
          : item
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
    window.dispatchEvent(new Event("chat:refresh-conversations"));
  };

  const openDeleteConfirmation = () => {
    if (selectedIds.length && !deleting) {
      setDeleteMode("default");
      setDeleteConfirmationOpen(true);
    }
  };

  const deleteCallLogRequest = async (callLog, mode) => {
    const response = await fetch("/api/calls/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callLog.callId, mode }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to delete this call log.");
    }
    if (result.socket_event) socket.emit("call-log-deleted", result.socket_event);
    return callLog;
  };

  const applyDeletedCallLogs = (deleted) => {
    if (!deleted.length) return;
    const deletedIds = new Set(deleted.map((item) => item._id));
    const deletedCallIds = new Set(deleted.map((item) => item.callId));
    setCallLogs((current) => (current || []).filter((item) => !deletedCallIds.has(item?.callId)));
    setSelectedIds((current) => current.filter((id) => !deletedIds.has(id)));
    window.dispatchEvent(new Event("chat:refresh-conversations"));
  };

  // one delete for whatever is selected: messages and call logs together.
  // "for everyone" applies to your own messages and the calls you started; everything else is removed for you.
  const confirmDeleteSelected = async () => {
    const selected = (messages || []).filter((msg) => selectedIds.includes(msg?._id));
    const selectedCalls = (callLogs || []).filter((item) => selectedIds.includes(item?._id));
    if ((!selected.length && !selectedCalls.length) || deleting) return;
    setDeleteConfirmationOpen(false);
    setDeleting(true);
    try {
      const [messageResults, callResults] = await Promise.all([
        Promise.allSettled(selected.map((msg) => removeMessage(msg, deleteMode))),
        Promise.allSettled(selectedCalls.map((callLog) => deleteCallLogRequest(
          callLog,
          deleteMode !== "for-me" && String(callLog.callerId) === String(user?._id) ? "everyone" : "for-me"
        ))),
      ]);
      applyDeletedCallLogs(callResults.filter((result) => result.status === "fulfilled").map((result) => result.value));
      if (messageResults.some((result) => result.status === "fulfilled")) {
        window.dispatchEvent(new Event("chat:refresh-conversations"));
      }
      const failedResult = [...messageResults, ...callResults].find((result) => result.status === "rejected");
      if (failedResult) throw failedResult.reason;
      clearSelection();
    } catch (error) {
      toast.error(error.message || "Unable to remove a selected item.");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteCall = async () => {
    if (!selectedCallLogs.length || deletingCall) return;
    setDeletingCall(true);
    try {
      const results = await Promise.allSettled(selectedCallLogs.map((callLog) => deleteCallLogRequest(callLog, callDeleteMode)));
      applyDeletedCallLogs(results.filter((result) => result.status === "fulfilled").map((result) => result.value));
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;

      setCallDeleteConfirmationOpen(false);
      clearSelection();
      toast.success(callDeleteMode === "everyone" ? "Call logs deleted for everyone." : "Call logs deleted for you.");
    } catch (error) {
      toast.error(error.message || "Unable to delete selected call logs.");
    } finally {
      setDeletingCall(false);
    }
  };

  const copySelectedMessage = async () => {
    const msg = selectedMessages[0]?.message;
    const text = msg?.message || msg?.attachmentUrl;
    if (!text) {
      toast.info("This message has no text to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied.");
      clearSelection();
    } catch {
      toast.error("Unable to copy this message.");
    }
  };

  const openEditMessage = () => {
    const selected = selectedMessages[0];
    if (!selected || selected?.sender?._id !== user?._id || selected?.message?.type !== "text") return;
    setEditingMessage(selected);
    setEditText(selected.message.message || "");
  };

  const saveEditedMessage = async (event) => {
    event.preventDefault();
    if (!editingMessage || savingEdit) return;
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/messages/${editingMessage._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", text: editText }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to edit this message.");
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === result.message_id
          ? { ...item, message: { ...item.message, message: result.message, editedAt: result.editedAt } }
          : item
      ));
      socket.emit("message-edited", result.socket_event);
      window.dispatchEvent(new Event("chat:refresh-conversations"));
      setEditingMessage(null);
      clearSelection();
    } catch (error) {
      toast.error(error.message || "Unable to edit this message.");
    } finally {
      setSavingEdit(false);
    }
  };

  /* ---------- selection ---------- */
  const menuOpenedAtRef = useRef(0);
  const startSelection = (data, type = "message") => {
    navigator.vibrate?.(25);
    menuOpenedAtRef.current = Date.now();
    setSelectionType(type);
    setSelectedIds([data?._id]);
    setReactionFor(type === "message" ? data?._id : null);
  };

  // messages and call logs can be selected together (one delete for both)
  const toggleSelected = (messageId, type = "message") => {
    setSelectionType(type);
    setSelectedIds((current) => {
      const next = current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId];
      // the reaction bar belongs to a single selected message (not a call log)
      const onlyMessage = next.length === 1 && (messagesRef.current || []).some((item) => item?._id === next[0]);
      setReactionFor(onlyMessage ? next[0] : null);
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
  const holdSelect = (data, type = "message") => {
    const state = touchRef.current;
    if (state) {
      if (state.held || state.swiping) return;
      state.held = true;
    }
    clearTimeout(holdTimerRef.current);
    if (selecting) toggleSelected(data?._id, type);
    else startSelection(data, type);
  };

  const onTouchStart = (event, data, type = "message") => {
    const touch = event.touches[0];
    touchRef.current = { id: data?._id, x: touch.clientX, y: touch.clientY, dx: 0, swiping: false, held: false, type };
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => holdSelect(data, type), HOLD_MS);
  };

  const onTouchMove = (event) => {
    const state = touchRef.current;
    if (!state) return;
    const touch = event.touches[0];
    const dx = touch.clientX - state.x;
    const dy = touch.clientY - state.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(holdTimerRef.current);
    if (state.type !== "call" && !state.swiping && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5 && !selecting) state.swiping = true;
    if (state.swiping) {
      state.dx = Math.max(0, Math.min(SWIPE_MAX_PX, dx));
      setSwipe({ id: state.id, dx: state.dx });
    }
  };

  const onTouchEnd = (event, data, type = "message") => {
    clearTimeout(holdTimerRef.current);
    const state = touchRef.current;
    // after a long press or a swipe the browser may still send a "click" at that spot, where the
    // reaction bar has just appeared: cancel it so it cannot pick an emoji or undo the selection
    if ((state?.held || state?.swiping) && event?.cancelable) event.preventDefault();
    if (type !== "call" && state?.swiping && state.dx >= SWIPE_REPLY_PX) {
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
    if (selecting) toggleSelected(data?._id, "message");
  };

  const onCallLogClick = (data) => {
    if (touchRef.current?.held || touchRef.current?.swiping) return;
    if (selecting) {
      toggleSelected(data?._id, "call");
      return;
    }
    window.dispatchEvent(new CustomEvent("chat:call-log-action", {
      detail: { callId: data.callId, isVideo: Boolean(data.isVideo) },
    }));
  };

  const onCallLogContextMenu = (event, data) => {
    event.preventDefault();
    if (selecting) toggleSelected(data?._id, "call");
    else startSelection(data, "call");
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

  const visibleCallLogs = (callLogs || []).filter((item) =>
    String(item?.conversationId) === String(conversationUser?._id) &&
    Boolean(item?.isGroup) === (Number(conversationUser?.is_group) === 1)
  );
  const selectedCallLogs = visibleCallLogs.filter((item) => selectedIds.includes(item?._id));
  const ownCallCount = selectedCallLogs.filter((item) => String(item?.callerId) === String(user?._id)).length;
  const totalSelected = selectedMessages.length + selectedCallLogs.length;
  const everyoneCapableCount = ownSelectedCount + ownCallCount; // items "delete for everyone" can apply to
  const singleMessageOnly = selectedMessages.length === 1 && selectedCallLogs.length === 0;
  const canDeleteCallLogsForEveryone = selectedCallLogs.length > 0 &&
    selectedCallLogs.every((item) => String(item?.callerId) === String(user?._id));
  const timelineItems = [
    ...(messages || []).map((item) => ({ ...item, timelineType: "message" })),
    ...visibleCallLogs.map((item) => ({ ...item, timelineType: "call" })),
    ...localMessages.map((item) => ({ ...item, timelineType: "message" })),
  ].sort((first, second) => {
    // messages still being sent stay at the bottom, in the order they were sent
    if (Boolean(first.localState) !== Boolean(second.localState)) return first.localState ? 1 : -1;
    const firstAt = new Date(first.timelineType === "call" ? first.startedAt : first.message?.createdAt || 0).getTime();
    const secondAt = new Date(second.timelineType === "call" ? second.startedAt : second.message?.createdAt || 0).getTime();
    return firstAt - secondAt;
  });

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
            {singleMessageOnly && (
              <button type="button" className="selection-icon-button" onClick={() => requestReply(selectedMessages[0])} aria-label="Reply" title="Reply">
                <FiCornerUpLeft />
              </button>
            )}
            {singleMessageOnly && (
              <button type="button" className="selection-icon-button" onClick={copySelectedMessage} aria-label="Copy message" title="Copy">
                <FiCopy />
              </button>
            )}
            {singleMessageOnly && selectedMessages[0]?.sender?._id === user?._id && selectedMessages[0]?.message?.type === "text" && (
              <button type="button" className="selection-icon-button" onClick={openEditMessage} aria-label="Edit message" title="Edit">
                <FiEdit2 />
              </button>
            )}
            <button
              type="button"
              className="selection-icon-button is-danger"
              onClick={() => {
                if (selectedMessages.length === 0 && selectedCallLogs.length > 0) {
                  setCallDeleteMode("for-me");
                  setCallDeleteConfirmationOpen(true);
                } else {
                  openDeleteConfirmation(); // messages, or messages together with call logs
                }
              }}
              disabled={deleting || deletingCall}
              aria-label={`Delete ${selectedIds.length} selected ${selectedCallLogs.length ? "items" : "messages"}`}
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
              Delete {totalSelected} {selectedCallLogs.length ? "item" : "message"}{totalSelected > 1 ? "s" : ""}?
            </h2>
            <p id="delete-confirmation-description">
              {(() => {
                const forMeCount = totalSelected - everyoneCapableCount;
                const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
                if (deleteMode === "for-me") {
                  return `${totalSelected === 1 ? "This item" : `These ${totalSelected} items`} will be removed only from your conversation view.`;
                }
                const everyoneText = [
                  ownSelectedCount ? plural(ownSelectedCount, "of your message") : "",
                  ownCallCount ? `${plural(ownCallCount, "call log")} you started` : "",
                ].filter(Boolean).join(" and ");
                if (!everyoneText) return `${plural(forMeCount, "item")} will be removed from your conversation view.`;
                return `${everyoneText} will be deleted for everyone${forMeCount ? ` and ${plural(forMeCount, "other item")} will be removed for you` : ""}.`;
              })()}
            </p>
            {everyoneCapableCount > 0 && (
              <div className="confirmation-delete-options">
                <label><input type="radio" checked={deleteMode === "for-me"} onChange={() => setDeleteMode("for-me")} /> Delete for me</label>
                <label><input type="radio" checked={deleteMode !== "for-me"} onChange={() => setDeleteMode("default")} /> Delete for everyone</label>
              </div>
            )}
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
      {callDeleteConfirmationOpen && selectedCallLogs.length > 0 && selectedMessages.length === 0 && (
        <div
          className="confirmation-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !deletingCall) setCallDeleteConfirmationOpen(false);
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="call-delete-title"
            aria-describedby="call-delete-description"
          >
            <button
              type="button"
              className="confirmation-close"
              onClick={() => setCallDeleteConfirmationOpen(false)}
              aria-label="Close delete confirmation"
              disabled={deletingCall}
            >
              <FiX />
            </button>
            <h2 id="call-delete-title">
              Delete {selectedCallLogs.length} call log{selectedCallLogs.length > 1 ? "s" : ""}?
            </h2>
            <p id="call-delete-description">
              {callDeleteMode === "everyone"
                ? "Selected call logs will be removed for everyone in the conversation."
                : "Selected call logs will be removed only from your conversation."}
            </p>
            {canDeleteCallLogsForEveryone && (
              <div className="confirmation-delete-options">
                <label>
                  <input
                    type="radio"
                    checked={callDeleteMode === "for-me"}
                    onChange={() => setCallDeleteMode("for-me")}
                    disabled={deletingCall}
                  />
                  Delete for me
                </label>
                <label>
                  <input
                    type="radio"
                    checked={callDeleteMode === "everyone"}
                    onChange={() => setCallDeleteMode("everyone")}
                    disabled={deletingCall}
                  />
                  Delete for everyone
                </label>
              </div>
            )}
            <div className="confirmation-actions">
              <button
                type="button"
                className="confirmation-cancel"
                onClick={() => setCallDeleteConfirmationOpen(false)}
                disabled={deletingCall}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirmation-accept is-danger"
                onClick={confirmDeleteCall}
                disabled={deletingCall}
              >
                {deletingCall ? "Deleting…" : "Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
      {editingMessage && (
        <div className="confirmation-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !savingEdit) setEditingMessage(null); }}>
          <form className="confirmation-dialog" role="dialog" aria-modal="true" onSubmit={saveEditedMessage}>
            <button type="button" className="confirmation-close" onClick={() => setEditingMessage(null)} aria-label="Close edit message"><FiX /></button>
            <h2>Edit message</h2>
            <textarea autoFocus maxLength={5000} value={editText} onChange={(event) => setEditText(event.target.value)} />
            <div className="confirmation-actions">
              <button type="button" className="confirmation-cancel" onClick={() => setEditingMessage(null)} disabled={savingEdit}>Cancel</button>
              <button type="submit" className="confirmation-accept" disabled={savingEdit || !editText.trim()}>{savingEdit ? "Saving..." : "Save"}</button>
            </div>
          </form>
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
        {!timelineItems.length && (
          <div className="grid min-h-full place-items-center text-center text-sm text-[#91a0b7]">
            <div>
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500/10 text-2xl text-indigo-300">✦</div>
              <p className="font-medium text-[#e8edf7]">Start the conversation</p>
              <p className="mt-1">Send a message, photo, or voice note.</p>
            </div>
          </div>
        )}
        {timelineItems.map((data) => {
          if (data.timelineType === "call") {
            const outgoing = String(data.callerId) === String(user?._id);
            const isMissed = data.status === "no-answer" && !outgoing;
            const isActive = !data.endedAt && ["ringing", "answered"].includes(data.status);
            const mediaName = data.isVideo ? "Video" : "Voice";
            let callStatus;
            if (isActive && data.status === "answered") callStatus = "In call · Tap to return";
            else if (isActive) callStatus = outgoing ? "Calling" : "Ringing";
            else if (data.status === "no-answer") callStatus = outgoing ? "No answer" : "Tap to call back";
            else if (data.status === "declined") callStatus = "Declined";
            else if (data.status === "ended" && !data.answeredAt) callStatus = outgoing ? "Cancelled" : "Call ended";
            else {
              const duration = Math.max(0, Number(data.durationSeconds) || 0);
              const minutes = Math.floor(duration / 60);
              const seconds = duration % 60;
              callStatus = minutes ? `${minutes} min${seconds ? ` ${seconds} sec` : ""}` : `${seconds} sec`;
            }
            const CallIcon = isMissed ? FiPhoneMissed : data.isVideo ? FiVideo : outgoing ? FiPhoneOutgoing : FiPhoneIncoming;
            const callStartedAt = new Date(data.startedAt);
            const validCallTime = !Number.isNaN(callStartedAt.getTime());
            return (
              <div
                id={`call-${data.callId}`}
                key={`call-${data.callId}`}
                className={`message-row call-log-row ${outgoing ? "is-outgoing" : "is-incoming"} ${isMissed ? "is-missed" : ""} ${selectedIds.includes(data?._id) ? "is-selected" : ""} ${selecting ? "is-selecting" : ""}`}
              >
                <div className={`call-log-actions ${outgoing ? "is-outgoing" : "is-incoming"}`}>
                  <button
                    type="button"
                    className={`call-log-bubble ${selecting ? "is-selecting" : ""}`}
                    aria-label={`${mediaName} call: ${callStatus}`}
                    title="Click to return to the call; press and hold to select"
                    onClick={() => onCallLogClick(data)}
                    onContextMenu={(event) => onCallLogContextMenu(event, data)}
                    onTouchStart={(event) => onTouchStart(event, data, "call")}
                    onTouchMove={onTouchMove}
                    onTouchEnd={(event) => onTouchEnd(event, data, "call")}
                    onTouchCancel={(event) => onTouchEnd(event, data, "call")}
                  >
                    <span className="call-log-icon"><CallIcon /></span>
                    <span className="call-log-copy">
                      <strong>{isMissed ? `Missed ${mediaName} Call` : `${mediaName} call`}</strong>
                      <span>{callStatus}</span>
                    </span>
                    <time dateTime={validCallTime ? callStartedAt.toISOString() : undefined}>
                      {validCallTime ? callStartedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
                    </time>
                  </button>
                </div>
              </div>
            );
          }
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
          const local = Boolean(data?.localState); // still sending (or failed): no actions until it is saved
          return (
            <div
              id={`message-${data?._id}`}
              key={data?._id}
              className={`message-row ${reactions.length ? "mb-7" : "mb-4"} ${selected ? "is-selected" : ""} ${selecting ? "is-selecting" : ""} ${local ? `is-local is-${data.localState}` : ""}`}
              onClick={(event) => {
                // in selection mode a tap anywhere on the row toggles it
                if (local) return;
                if (selecting && !event.target.closest(".message-bubble, .message-action-menu")) toggleSelected(data?._id);
              }}
            >
              {!mine && (
                <div className="mb-1 ml-11 text-xs text-[#91a0b7]">
                  {conversationUser?.is_group === 1 ? sender?.name : conversationUser?.nickname || sender?.name}
                </div>
              )}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""} ${reactions.length ? "pb-4" : ""}`}>
                {!mine && (
                  <img
                    src={getImageURL(sender?.photo)}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border border-[#394761] object-cover"
                    title={conversationUser?.is_group === 1
                      ? sender?.name
                      : conversationUser?.nickname || sender?.name}
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
                      if (!local) holdSelect(data); // right-click on desktop, long-press on Android
                    }}
                    onTouchStart={local ? undefined : (event) => onTouchStart(event, data)}
                    onTouchMove={local ? undefined : onTouchMove}
                    onTouchEnd={local ? undefined : (event) => onTouchEnd(event, data)}
                    onTouchCancel={local ? undefined : (event) => onTouchEnd(event, data)}
                    onClick={local ? undefined : (event) => onBubbleClick(event, data)}
                  >
                    {!selecting && !local && (
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
                    {data?.message?.deletedForEveryone ? (
                      <p className="italic opacity-75">This message was deleted.</p>
                    ) : (
                      <MessageContent message={data?.message} onPreview={selecting ? null : openPreview} />
                    )}
                    {!data?.message?.deletedForEveryone && data?.message?.editedAt && (
                      <span className="ml-2 text-[10px] italic opacity-70">Edited</span>
                    )}
                  </div>
                  {reactions.length > 0 && (
                    <div className={`message-reactions ${mine ? "right-2" : "left-2"}`}>
                      {[...messageReactionGroups.entries()].map(([emoji, count]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            const ownReaction = reactions.find(
                              (reaction) => reaction.user_id === user?._id && reaction.emoji === emoji
                            );
                            if (ownReaction) {
                              applyReaction(data, emoji);
                              return;
                            }
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
                {data?.localState === "sending" && (
                  <span className="message-local-status"><FiClock aria-hidden="true" /> Sending…</span>
                )}
                {data?.localState === "failed" && (
                  <span className="message-local-status is-failed">
                    <FiAlertCircle aria-hidden="true" /> Not sent{data.error ? ` · ${data.error}` : ""}
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("chat:retry-pending", { detail: data._id }))}>Retry</button>
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("chat:remove-pending", { detail: data._id }))}>Remove</button>
                  </span>
                )}
                {!local && dateTimeFormat(data?.message?.createdAt)}
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

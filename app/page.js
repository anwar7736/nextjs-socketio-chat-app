"use client";
import Picker from "emoji-picker-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { FaPaperclip } from "react-icons/fa";
import { FiMic, FiSend, FiSquare } from "react-icons/fi";
import { toast } from "sonner";
import GroupEditOrViewModal from "./components/GroupEditOrViewModal";
import Messages from "./components/Messages";
import Sidebar from "./components/Sidebar";
import CallControls from "./components/CallControls";
import ConversationMenu from "./components/ConversationMenu";
import ValidationError from "./components/ValidationError";
import { MessageContext } from "./contexts/MessageContext";
import { UserContext } from "./contexts/UserContext";
import { UserListContext } from "./contexts/UserListContext";
import {
  activityFormat,
  auth,
  getImageURL,
  loadConversationTimeline,
  playMessageReminder,
  socket_connection,
} from "./helpers/helper";
let socket = socket_connection();

// must match the upload route (Vercel accepts request bodies up to about 4.5 MB)
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 4;

// Decode a photo (camera JPEG, HEIC where the browser can, …) and re-encode it as a JPEG that fits the upload limit.
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // some phones' camera files only decode through an <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function shrinkImage(file, maxSide = 1920) {
  const source = await decodeImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error("The photo has no size.");
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const limit = (MAX_UPLOAD_MB - 0.5) * 1024 * 1024;
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Image conversion failed.");
    if (blob.size <= limit) return blob;
  }
  throw new Error("The photo is still too large after compression.");
}

const Home = () => {
  const { users, setUsers } = useContext(UserListContext);
  const [isUserListLoading, setIsUserListLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [activityNow, setActivityNow] = useState(Date.now());
  const { user, setUser } = useContext(UserContext);
  // const { user: authUser, setUser: setAuthUser } = useContext(AuthContext)
  const { messages, setMessages, setCallLogs, setPendingMessages } = useContext(MessageContext);
  const [message, setMessage] = useState("");
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [data, setData] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [attachmentDuration, setAttachmentDuration] = useState(0);
  const [replyTarget, setReplyTarget] = useState(null);
  const [messageError, setMessageError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const emojiRef = useRef(null);
  const userListRequestRef = useRef(0);
  const allowAppExitRef = useRef(false);
  const typingTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const typingUsersTimersRef = useRef(new Map());
  const mutedConversationsRef = useRef(new Set());
  const conversationHistoryRef = useRef(false);
  const realtimeMessageRequestRef = useRef(0);
  const conversationRefreshTimerRef = useRef(null);
  useEffect(() => {
    const updateMuted = (event) => {
      const { conversationId, muted } = event.detail || {};
      if (!conversationId) return;
      const next = new Set(mutedConversationsRef.current);
      if (muted) next.add(conversationId);
      else next.delete(conversationId);
      mutedConversationsRef.current = next;
    };
    window.addEventListener("chat:mute-change", updateMuted);
    return () => window.removeEventListener("chat:mute-change", updateMuted);
  }, []);
  const syncChatViewport = useCallback(() => {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty(
      "--chat-viewport-height",
      `${viewport?.height || window.innerHeight}px`
    );
    document.documentElement.style.setProperty(
      "--chat-viewport-top",
      `${viewport?.offsetTop || 0}px`
    );
  }, []);
  const authUser = auth();
  const selectedConversationRef = useRef(user);
  const authUserRef = useRef(authUser);
  selectedConversationRef.current = user;
  authUserRef.current = authUser;
  const emitTypingStatus = useCallback((typing, conversation = user) => {
    const activeUser = authUserRef.current;
    if (!socket.connected || !conversation?._id || !activeUser?._id) return;
    const isGroup = Number(conversation.is_group) === 1;
    const recipients = isGroup
      ? [...new Set((conversation.member_ids || []).map((id) => String(id?._id || id)).filter(Boolean))]
      : undefined;
    socket.volatile.emit("typing-status", {
      sender_id: String(activeUser._id),
      sender_name: activeUser.name,
      receiver_id: String(conversation._id),
      is_group: isGroup,
      ...(isGroup ? { recipient_ids: recipients } : {}),
      typing,
    });
  }, [user]);

  const stopTyping = useCallback((conversation = user) => {
    clearTimeout(typingTimerRef.current);
    if (typingActiveRef.current) emitTypingStatus(false, conversation);
    typingActiveRef.current = false;
  }, [emitTypingStatus, user]);

  const lastTypingEmitRef = useRef(0);
  const handleMessageTyping = (value) => {
    if (!value.trim()) {
      stopTyping();
      return;
    }
    // say "typing" at the start and again every 2.5 s while typing goes on
    // (the other side hides it 4 s after the last notice)
    if (!typingActiveRef.current || Date.now() - lastTypingEmitRef.current > 2500) {
      typingActiveRef.current = true;
      lastTypingEmitRef.current = Date.now();
      emitTypingStatus(true);
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => stopTyping(), 1200);
  };

  useEffect(() => {
    setTypingUsers([]);
    typingUsersTimersRef.current.forEach((timer) => clearTimeout(timer));
    typingUsersTimersRef.current.clear();
    return () => stopTyping(user);
  }, [stopTyping, user]);

  useEffect(() => {
    const typingTimers = typingUsersTimersRef.current;
    const onTypingStatus = (event) => {
      const conversation = selectedConversationRef.current;
      const isGroup = Number(conversation?.is_group) === 1;
      // group: the event names the group; direct chat: it names ME as receiver, so the open chat must be the sender
      const sameConversation = Boolean(event?.is_group) === isGroup && (isGroup
        ? String(event?.receiver_id) === String(conversation?._id)
        : String(event?.sender_id) === String(conversation?._id) &&
          String(event?.receiver_id) === String(authUserRef.current?._id));
      if (!sameConversation || !event?.sender_id) return;

      const senderId = String(event.sender_id);
      const existingTimer = typingTimers.get(senderId);
      if (existingTimer) clearTimeout(existingTimer);
      if (!event.typing) {
        typingTimers.delete(senderId);
        setTypingUsers((current) => current.filter((item) => String(item.user_id) !== senderId));
        return;
      }

      setTypingUsers((current) => [
        ...current.filter((item) => String(item.user_id) !== senderId),
        { user_id: senderId, name: event.sender_name || "Someone" },
      ]);
      typingTimers.set(senderId, setTimeout(() => {
        typingTimers.delete(senderId);
        setTypingUsers((current) => current.filter((item) => String(item.user_id) !== senderId));
      }, 4000));
    };
    const onSocketConnect = () => {
      if (typingActiveRef.current) {
        emitTypingStatus(true, selectedConversationRef.current);
      }
    };

    socket.on("typing-status", onTypingStatus);
    socket.on("connect", onSocketConnect);
    return () => {
      socket.off("typing-status", onTypingStatus);
      socket.off("connect", onSocketConnect);
      typingTimers.forEach((timer) => clearTimeout(timer));
      typingTimers.clear();
    };
  }, [emitTypingStatus]);

  useEffect(() => {
    if (!authUser?._id) return;
    const updatePresence = () => {
      fetch("/api/user/presence", { method: "POST", keepalive: true })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to update activity status.");
        })
        .catch((error) => console.warn(error.message));
    };
    updatePresence();
    const interval = setInterval(updatePresence, 60_000);
    const activityInterval = setInterval(() => setActivityNow(Date.now()), 15_000);
    const onPageHide = () => updatePresence();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") updatePresence();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      clearInterval(activityInterval);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authUser?._id]);

  const onEmojiClick = (emojiObject) => {
    setMessage((msg) => msg + emojiObject.emoji); // picker stays open, like WhatsApp, for several emojis
  };

  // a tap outside the emoji button/picker closes it
  useEffect(() => {
    if (!showPicker) return;
    const close = (event) => {
      if (!emojiRef.current?.contains(event.target)) setShowPicker(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showPicker]);

  useEffect(() => {
    if (!authUser?._id) return;
    const confirmClose = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmClose);
    return () => window.removeEventListener("beforeunload", confirmClose);
  }, [authUser?._id]);

  useEffect(() => {
    syncChatViewport();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncChatViewport);
    viewport?.addEventListener("scroll", syncChatViewport);
    window.addEventListener("resize", syncChatViewport);
    return () => {
      viewport?.removeEventListener("resize", syncChatViewport);
      viewport?.removeEventListener("scroll", syncChatViewport);
      window.removeEventListener("resize", syncChatViewport);
      document.documentElement.style.removeProperty("--chat-viewport-height");
      document.documentElement.style.removeProperty("--chat-viewport-top");
    };
  }, [syncChatViewport]);

  useEffect(() => {
    const lockPageScroll = () => {
      document.documentElement.classList.add("chat-input-focused");
      document.body.classList.add("chat-input-focused");
    };
    const unlockPageScroll = () => {
      document.documentElement.classList.remove("chat-input-focused");
      document.body.classList.remove("chat-input-focused");
    };
    const input = messageInputRef.current;
    input?.addEventListener("focus", lockPageScroll);
    input?.addEventListener("blur", unlockPageScroll);
    return () => {
      input?.removeEventListener("focus", lockPageScroll);
      input?.removeEventListener("blur", unlockPageScroll);
      unlockPageScroll();
    };
  }, [user?._id]);

  useEffect(() => {
    if (!authUser?._id) return;
    const addExitGuard = () => {
      window.history.pushState(
        { ...(window.history.state || {}), convoExitGuard: true },
        "",
        window.location.href
      );
    };
    addExitGuard();

    const handleBack = (event) => {
      // the call screen handles this Back itself (back to the chat), or removed its own history entry
      if (window.__convoIgnoreNextPop) {
        window.__convoIgnoreNextPop = false;
        return;
      }
      if (document.querySelector("[data-call-screen-open]")) return;
      if (allowAppExitRef.current || event.state?.convoChat || event.state?.nicknamesDialog) return;
      if (selectedConversationRef.current?._id) {
        setUser("");
        setMessages([]);
        setCallLogs([]);
        return;
      }
      setExitConfirmationOpen(true);
      addExitGuard();
    };
    window.addEventListener("popstate", handleBack);
    return () => {
      window.removeEventListener("popstate", handleBack);
      if (window.history.state?.convoExitGuard) {
        const { convoExitGuard, ...state } = window.history.state;
        window.history.replaceState(state, "", window.location.href);
      }
    };
  }, [authUser?._id, setCallLogs, setMessages, setUser]);

  useEffect(() => {
    const hasConversation = Boolean(user?._id);
    if (hasConversation && !conversationHistoryRef.current) {
      window.history.pushState({ convoChat: true }, "", window.location.href);
    }
    conversationHistoryRef.current = hasConversation;
  }, [user?._id, user?.is_group]);

  const closeConversation = () => {
    if (window.history.state?.convoChat) {
      window.history.back();
      return;
    }
    setUser("");
    setMessages([]);
    setCallLogs([]);
  };

  useEffect(() => {
    if (!exitConfirmationOpen) return;
    const dismissOnEscape = (event) => {
      if (event.key === "Escape") setExitConfirmationOpen(false);
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [exitConfirmationOpen]);

  const getUserList = useCallback(async ({ showLoading = true } = {}) => {
    if (!authUser?._id) {
      setIsUserListLoading(false);
      return;
    }
    const requestId = ++userListRequestRef.current;
    if (showLoading) setIsUserListLoading(true);
    try {
      const response = await fetch(
        `/api/users?auth_id=${authUser._id}&search=${encodeURIComponent(search)}`
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load conversations.");
      }
      if (requestId === userListRequestRef.current) setUsers(result.data);
    } catch (error) {
      if (requestId === userListRequestRef.current) {
        toast.error(error.message || "Unable to load conversations.");
      }
    } finally {
      if (requestId === userListRequestRef.current) setIsUserListLoading(false);
    }
  }, [authUser?._id, search, setUsers]);
  const getUserListRef = useRef(getUserList);
  getUserListRef.current = getUserList;

  useEffect(() => {
    const refreshConversations = () => {
      clearTimeout(conversationRefreshTimerRef.current);
      conversationRefreshTimerRef.current = setTimeout(
        () => getUserListRef.current({ showLoading: false }),
        60
      );
    };
    window.addEventListener("chat:refresh-conversations", refreshConversations);
    window.addEventListener("chat:refresh-call-logs", refreshConversations);
    return () => {
      clearTimeout(conversationRefreshTimerRef.current);
      window.removeEventListener("chat:refresh-conversations", refreshConversations);
      window.removeEventListener("chat:refresh-call-logs", refreshConversations);
    };
  }, []);

  useEffect(() => {
    if (!user?._id || user?.is_group === 1) return;
    const matchingContact = (users || []).find((item) =>
      item?._id === user._id && item?.is_group !== 1
    );
    if (!matchingContact || matchingContact.lastSeenAt === user.lastSeenAt) return;
    setUser((current) =>
      current?._id === user._id && current?.is_group !== 1
        ? { ...current, lastSeenAt: matchingContact.lastSeenAt }
        : current
    );
  }, [users, user, setUser]);

  useEffect(() => {
    getUserList();
  }, [getUserList]);

  const unreadTotal = (Array.isArray(users) ? users : [])
    .reduce((total, item) => total + Math.max(0, Number(item?.pending) || 0), 0);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const updateBadge = unreadTotal > 0
      ? navigator.setAppBadge?.(unreadTotal)
      : navigator.clearAppBadge?.();
    updateBadge?.catch((error) => console.warn("Unable to update the app unread badge:", error));
  }, [unreadTotal]);

  useEffect(() => {
    if (!authUser?._id) return;
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticket");
    const isGroup = params.get("is_group") === "1";
    if (!ticketId || !/^[a-f\d]{24}$/i.test(ticketId)) return;
    let cancelled = false;
    const openTicket = async () => {
      setIsConversationLoading(true);
      try {
        const response = await fetch(`/api/users?auth_id=${authUser._id}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to open the notification conversation.");
        }
        const ticket = result.data.find((item) => item._id === ticketId && Number(item.is_group) === Number(isGroup));
        if (!ticket) throw new Error("This conversation is unavailable.");
        if (cancelled) return;
        setUser(ticket);
        setMessages([]);
        setCallLogs([]);
        const timeline = await loadConversationTimeline(ticket);
        if (!Array.isArray(timeline.messages)) throw new Error("Unable to load messages.");
        if (cancelled) return;
        setMessages(timeline.messages);
        setCallLogs(timeline.callLogs);
        window.history.replaceState(window.history.state, "", "/");
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to open the notification conversation:", error);
          toast.error(error.message || "Unable to open the notification conversation.");
        }
      } finally {
        if (!cancelled) setIsConversationLoading(false);
      }
    };
    openTicket();
    return () => { cancelled = true; };
  }, [authUser?._id, setCallLogs, setMessages, setUser]);

  useEffect(() => {
    if (!authUser?._id) return;
    const registerUser = () => socket.emit("register-user");
    socket.on("connect", registerUser);
    socket.connect();
    if (socket.connected) registerUser();
    return () => socket.off("connect", registerUser);
  }, [authUser?._id]);

  // ---- Sending, like WhatsApp: the message shows at once ("Sending…"), goes out in the background one at a
  // time in order, and is replaced by the saved copy. The receiver gets it exactly as before (socket broadcast).
  const sendQueueRef = useRef(Promise.resolve());
  const pendingInputsRef = useRef(new Map()); // local id -> what was typed/attached, kept for Retry

  const removePending = useCallback((localId) => {
    const input = pendingInputsRef.current.get(localId);
    if (input?.previewUrl) setTimeout(() => URL.revokeObjectURL(input.previewUrl), 5000);
    pendingInputsRef.current.delete(localId);
    setPendingMessages((list) => list.filter((item) => item._id !== localId));
  }, [setPendingMessages]);

  const deliverPending = async (localId) => {
    const input = pendingInputsRef.current.get(localId);
    if (!input) return;
    const { conversation } = input;
    const markFailed = (error) => setPendingMessages((list) => list.map((item) =>
      item._id === localId ? { ...item, localState: "failed", error } : item
    ));
    try {
      let uploaded = null;
      if (input.file) {
        const uploadData = new FormData();
        uploadData.append("file", input.file);
        const uploadResponse = await fetch("/api/upload", { method: "POST", body: uploadData });
        // the host can refuse a too-large body before the app runs, with a non-JSON page
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok || !uploadResult.success) {
          markFailed(uploadResult.message || (uploadResponse.status === 413
            ? `File larger than ${MAX_UPLOAD_MB} MB`
            : "Upload failed"));
          return;
        }
        uploaded = uploadResult.data;
      }

      const data = {
        message: input.text,
        sender_id: authUser?._id,
        receiver_id: conversation?._id,
        is_group: conversation?.is_group,
        attachmentUrl: uploaded?.url,
        attachmentName: uploaded?.name,
        mimeType: uploaded?.mimeType,
        durationSeconds: input.durationSeconds,
        reply_to: input.replyTo,
        type: uploaded?.mimeType?.startsWith("image/")
          ? "image"
          : uploaded?.mimeType?.startsWith("audio/")
            ? "audio"
            : uploaded?.mimeType?.startsWith("video/")
              ? "video"
              : uploaded ? "file" : "text",
      };
      const response = await fetch("/api/messages", {
        method: "POST",
        body: JSON.stringify(data),
      });
      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res.success) {
        markFailed(res.message || "Unable to send");
        return;
      }
      socket.emit("private-message", JSON.stringify(res.data));
      // the socket server does not echo an event back to the tab that sent it: load the saved copy
      if (String(selectedConversationRef.current?._id) === String(conversation?._id)) {
        const timeline = await loadConversationTimeline(conversation);
        if (String(selectedConversationRef.current?._id) === String(conversation?._id)) {
          setMessages(timeline.messages);
          setCallLogs(timeline.callLogs);
        }
      }
      removePending(localId);
      getUserList({ showLoading: false });
    } catch (error) {
      markFailed("Check your connection");
    }
  };

  const queuePending = (localId) => {
    sendQueueRef.current = sendQueueRef.current
      .then(() => deliverPending(localId))
      .catch((error) => console.error("Unable to send a queued message:", error));
  };

  useEffect(() => {
    const onRetry = (event) => {
      const localId = event.detail;
      if (!pendingInputsRef.current.has(localId)) return;
      setPendingMessages((list) => list.map((item) =>
        item._id === localId ? { ...item, localState: "sending", error: "" } : item
      ));
      queuePending(localId);
    };
    const onRemove = (event) => removePending(event.detail);
    window.addEventListener("chat:retry-pending", onRetry);
    window.addEventListener("chat:remove-pending", onRemove);
    return () => {
      window.removeEventListener("chat:retry-pending", onRetry);
      window.removeEventListener("chat:remove-pending", onRemove);
    };
  });

  const sendMessage = async (e) => {
    e?.preventDefault();
    stopTyping();
    if (!message.trim() && !attachment) {
      setMessageError("Enter a message or attach a file before sending.");
      return;
    }
    if (message.trim().length > 5000) {
      setMessageError("Messages can contain up to 5,000 characters.");
      return;
    }
    if (!user?._id) return;
    setMessageError("");
    setAttachmentError("");

    const localId = `local-${crypto.randomUUID()}`;
    const file = attachment;
    const previewUrl = file ? URL.createObjectURL(file) : undefined;
    const fileType = (file?.type || "").toLowerCase();
    const isGroup = Number(user?.is_group) === 1;
    pendingInputsRef.current.set(localId, {
      conversation: user,
      text: message,
      file,
      previewUrl,
      durationSeconds: attachmentDuration,
      replyTo: replyTarget?.message_id,
    });
    setPendingMessages((list) => [...list, {
      _id: localId,
      message_id: localId,
      localState: "sending",
      conversationId: String(user._id),
      status: 1,
      sender: { _id: authUser?._id, name: authUser?.name, photo: authUser?.photo },
      receiver: { _id: user._id },
      ...(isGroup ? { group: { _id: user._id, name: user.name } } : {}),
      message: {
        message: message.trim(),
        type: fileType.startsWith("image/") ? "image"
          : fileType.startsWith("audio/") ? "audio"
            : fileType.startsWith("video/") ? "video"
              : file ? "file" : "text",
        attachmentUrl: previewUrl,
        attachmentName: file?.name,
        mimeType: file?.type,
        durationSeconds: attachmentDuration,
        reply_to: replyTarget?.message_id,
        createdAt: new Date().toISOString(),
        reactions: [],
      },
    }]);

    // the composer is free again at once: the next message can be typed while this one goes out
    setMessage("");
    setReplyTarget(null);
    setAttachment(null);
    setAttachmentDuration(0);
    setShowPicker(false);
    if (messageInputRef.current) messageInputRef.current.style.height = "auto";
    queuePending(localId);
  };

  const toggleVoiceRecording = async () => {
    if (recording) {
      clearTimeout(recordingTimerRef.current);
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setAttachmentError("Voice recording is not supported in this browser.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        clearTimeout(recordingTimerRef.current);
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const voiceNote = new File(chunks, `voice-note-${Date.now()}.webm`, {
          type: recorder.mimeType || "audio/webm",
        });
        setAttachment(voiceNote);
        setAttachmentDuration(durationSeconds);
        setAttachmentError("");
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start();
      recordingStartedAtRef.current = Date.now();
      recorderRef.current = recorder;
      setRecording(true);
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          toast.info("Voice notes are limited to 2 minutes.");
          recorder.stop();
        }
      }, 120_000);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setAttachmentError("Microphone access was denied.");
    }
  };

  //load read time messages
  const loadRealTimeMessages = () => {
    socket.off("private-message");
    socket.on("private-message", async (data) => {
      const isGroup = Number(data?.is_group) === 1;
      const notificationConversationId = isGroup
        ? data?.receiver_id
        : String(data?.sender_id) === String(authUser?._id) ? data?.receiver_id : data?.sender_id;
      const selectedConversation = selectedConversationRef.current;
      const sameOpenConversation = Boolean(selectedConversation?._id) &&
        Number(selectedConversation?.is_group) === Number(data?.is_group) &&
        (isGroup
          ? String(selectedConversation?._id) === String(data?.receiver_id)
          : String(selectedConversation?._id) === String(data?.sender_id) ||
            String(selectedConversation?._id) === String(data?.receiver_id));
      const shouldPlayReminder =
        String(data?.sender_id) !== String(authUser?._id) &&
        !sameOpenConversation &&
        document.visibilityState === "visible" &&
        !mutedConversationsRef.current.has(String(notificationConversationId));
      if (
        sameOpenConversation
      ) {
        const requestId = ++realtimeMessageRequestRef.current;
        try {
          const timeline = await loadConversationTimeline(selectedConversation);
          const currentConversation = selectedConversationRef.current;
          if (
            requestId === realtimeMessageRequestRef.current &&
            currentConversation?._id === selectedConversation?._id &&
            Number(currentConversation?.is_group) === Number(selectedConversation?.is_group)
          ) {
            setMessages(timeline.messages);
            setCallLogs(timeline.callLogs);
          }
        } catch (error) {
          console.error("Unable to refresh messages after a real-time update:", error);
          toast.error("Unable to refresh this conversation. Check your connection.");
        } finally {
          window.dispatchEvent(new Event("chat:refresh-conversations"));
        }
      } else if (
        String(data?.receiver_id) === String(authUser?._id) ||
        String(data?.sender_id) === String(authUser?._id) ||
        isGroup
      ) {
        await getUserListRef.current({ showLoading: false });
      }
      if (shouldPlayReminder) playMessageReminder();
    });
  };

  //online users
  const loadActiveUsers = () => {
    socket.off("active-users");
    socket.on("active-users", (data) => {
      setActiveUsers(Array.isArray(data) ? data.map(String) : []);
    });

    socket.off("user-offline");
    socket.on("user-offline", (data) => {
      const lastSeenAt = data?.last_seen_at;
      if (!data?.user_id || !lastSeenAt) return;
      setUsers((current) => current.map((item) =>
        String(item?._id) === String(data.user_id) ? { ...item, lastSeenAt } : item
      ));
      setUser((current) =>
        String(current?._id) === String(data.user_id) ? { ...current, lastSeenAt } : current
      );
    });

    //new user registered
    socket.off("new-user");
    socket.on("new-user", (data) => {
      getUserList();
      if (data?._id !== authUser?._id) {
        toast.success(data?.message);
      }
    });

    socket.off("user-updated");
    socket.on("user-updated", (data) => {
      //update users
      let userList = [...users];
      let index = userList.findIndex((user) => user?._id == data?._id);
      if (index >= 0) {
        userList[index].name = data?.name;
        userList[index].photo = data?.photo;
        setUsers(userList);
      }

      //update messages
      let filterMessages = [...(messages || [])];
      let sender = "";
      filterMessages = filterMessages.map((msg) => {
        sender = msg?.sender?.[0];
        if (sender && sender?._id === data?._id) {
          sender.name = data?.name;
          sender.photo = data?.photo;
        }

        return msg;
      });

      setMessages(filterMessages);
      if (data?._id !== authUser?._id) {
        toast.success(data?.message);
      }
    });

    socket.off("message-deleted");
    socket.on("message-deleted", (data) => {
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === data?.message_id
          ? { ...item, message: { ...item.message, message: "", attachmentUrl: "", attachmentName: "", deletedForEveryone: true, reactions: [] } }
          : item
      ));
      window.dispatchEvent(new Event("chat:refresh-conversations"));
    });

    socket.off("message-edited");
    socket.on("message-edited", (data) => {
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === data?.message_id
          ? { ...item, message: { ...item.message, message: data.message, editedAt: data.editedAt } }
          : item
      ));
      window.dispatchEvent(new Event("chat:refresh-conversations"));
    });

    socket.off("message-reaction");
    socket.on("message-reaction", (data) => {
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === data?.message_id
          ? { ...item, message: { ...item.message, reactions: data.reactions } }
          : item
      ));
    });

    socket.off("messages-seen");
    socket.on("messages-seen", (event) => {
      const messageIds = new Set(event?.message_ids || []);
      if (!event?.actor_id || !messageIds.size) return;
      const viewer = {
        _id: event.actor_id,
        name: event.actor_name || "Someone",
        photo: event.actor_photo || "",
      };
      setMessages((current) => (current || []).map((item) => {
        if (!messageIds.has(item?.message_id)) return item;
        const seenBy = item?.seen_by || [];
        return seenBy.some((person) => person?._id === viewer._id)
          ? item
          : { ...item, seen_by: [...seenBy, viewer] };
      }));
      window.dispatchEvent(new Event("chat:refresh-conversations"));
    });

    socket.off("add-group");
    socket.on("add-group", (data) => {
      let newUser = {
        _id: data?._id,
        name: data?.name,
        photo: data?.photo,
        pending: 0,
        is_group: 1,
        total_members: data?.group_members?.length,
        member_ids: (data?.group_members || []).map((member) => String(member?.user_id)).filter(Boolean),
      };

      let newUsers = [...users, newUser];

      setUsers(newUsers);
      if (data?.created_by !== authUser?._id) {
        toast.success(data?.message);
      }
    });

    socket.off("update-group");
    socket.on("update-group", (data) => {
      if (data?.res?.status === 0) {
        // Current user was removed from this group
        setUsers((current) => current.filter((item) => item?._id !== data?._id));
        setUser((current) => {
          if (current?._id === data?._id) {
            setMessages([]);
            setCallLogs([]);
            setModalOpen(false);
            return "";
          }
          return current;
        });
      } else {
        // Update sidebar/header for all group members (including the editor's other tabs)
        const newUser = {
          _id: data?._id,
          name: data?.name,
          photo: data?.photo,
          short_desc: data?.short_desc,
          member_ids: data?.member_ids || [],
          is_group: 1,
          total_members: data?.total_members,
        };
        setUsers((current) => {
          const exists = current.some((item) => item?._id === newUser._id);
          return exists
            ? current.map((item) => item?._id === newUser._id ? { ...item, ...newUser } : item)
            : [...current, { ...newUser, pending: 0 }];
        });
        setUser((current) => current?._id === newUser._id ? { ...current, ...newUser } : current);
      }

      if (data?.res?.message && !data?.res?.is_causer) toast.success(data.res.message);
    });

    socket.off("delete-group");
    socket.on("delete-group", (data) => {
      setModalOpen(false);
      setUser((current) => {
        if (current?._id === data?._id) {
          setMessages([]);
          setCallLogs([]);
          return "";
        }
        return current;
      });
      setUsers((current) => current.filter((item) => item?._id !== data?._id));
      if (data.deleted_by !== authUser._id) {
        toast.success(data?.message);
      }
    });

    socket.off("leave-group");
    socket.on("leave-group", (res) => {
      if (user._id === res?._id) {
        setUser((current) => current?._id === res?._id ? { ...current, total_members: (current.total_members || 1) - 1 } : current);
        if (isModalOpen) {
          let newMembers = data?.members?.filter(
            (m) => m.user_id !== res?.user_id
          );
          setData({ ...data, members: newMembers });
        }
      }

      // if (res?.user_id !== authUser?._id) {
      toast.success(res?.message);
      // }
    });
  };

  useEffect(() => {
    loadRealTimeMessages();
    loadActiveUsers();
  }, [user, authUser]);

  useEffect(() => {
    const handleReply = (event) => {
      setReplyTarget(event.detail);
      messageInputRef.current?.focus();
    };
    window.addEventListener("chat:reply", handleReply);
    return () => window.removeEventListener("chat:reply", handleReply);
  }, []);

  useEffect(() => {
    setReplyTarget(null);
  }, [user?._id]);

  // Phone camera photos are usually 3-12 MB, more than the server accepts (about 4 MB on Vercel):
  // every photo that is large, or in a format the server does not take (HEIC …), becomes a JPEG of at most 1920 px.
  const chooseAttachment = async (file) => {
    if (!file) return;
    setAttachmentError("");
    setAttachmentDuration(0);
    const type = (file.type || "").toLowerCase();
    const supportedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const isImage = type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(file.name);
    const isLargePhoto = isImage && file.size > 1.5 * 1024 * 1024 && type !== "image/gif";
    if (isImage && (isLargePhoto || !supportedImageTypes.includes(type))) {
      try {
        const blob = await shrinkImage(file);
        setAttachment(new File([blob], `${(file.name || "photo").replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }));
      } catch (error) {
        console.error("Unable to prepare the photo:", error);
        setAttachmentError("This photo could not be prepared. Please try again, or choose it from the gallery.");
      }
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setAttachmentError(`This file is too large. Files must be smaller than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    if (type.startsWith("audio/")) {
      try {
        const url = URL.createObjectURL(file);
        const durationSeconds = await new Promise((resolve, reject) => {
          const audio = new Audio();
          const cleanup = () => {
            audio.removeAttribute("src");
            URL.revokeObjectURL(url);
          };
          audio.onloadedmetadata = () => {
            const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
            cleanup();
            resolve(duration);
          };
          audio.onerror = () => {
            cleanup();
            reject(new Error("Unable to read audio duration."));
          };
          audio.src = url;
        });
        setAttachmentDuration(durationSeconds);
      } catch {
        setAttachmentDuration(0);
      }
    } else {
      setAttachmentDuration(0);
    }
    setAttachment(file);
  };

  const handleEditOrViewModal = async () => {
    if (user.is_group === 1) {
      let res = await fetch(`/api/group?id=${user?._id}`);
      res = await res.json();
      if (res.success) {
        res.data.is_group = 1;
        res.data.is_admin = res.data.members.some(
          (member) => member.is_admin === 1 && member.user_id === authUser._id
        );
        setData(res.data);
      }
    } else {
      let res = await fetch(`/api/user/profile/${user?._id}`);
      res = await res.json();
      if (res.success) {
        res.data.is_group = 0;
        setData(res.data);
      }
    }

    setModalOpen(true);
  };

  return (
    <div className="chat-shell">
      <div className="chat-panel">
        <Sidebar
          className={user ? "is-hidden-mobile" : ""}
          setSearch={setSearch}
          search={search}
          activeUsers={activeUsers}
          activityNow={activityNow}
          isUserListLoading={isUserListLoading}
          setConversationLoading={setIsConversationLoading}
        />
        <main className={`chat-main ${!user ? "is-hidden-mobile" : ""}`}>
          <header className="conversation-header sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-[#263248] bg-[#111827]/95 px-4 py-3 text-white sm:px-6">
            {user ? (
              <div
                className="flex min-w-0 cursor-pointer items-center gap-3"
                onClick={handleEditOrViewModal}
              >
                <button
                  type="button"
                  className="mr-1 rounded-lg p-2 text-gray-300 hover:bg-[#263248] md:hidden"
                  aria-label="Back to conversations"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeConversation();
                  }}
                >
                  <span aria-hidden="true">←</span>
                </button>
                <img
                  src={getImageURL(user?.photo)}
                  alt=""
                  height={40}
                  width={40}
                  className="h-10 w-10 rounded-full border border-indigo-400 object-cover"
                  title={user?.nickname || user?.name}
                />
                <span className="truncate">
                  <span className="block truncate text-sm font-semibold sm:text-base">{user?.nickname || user?.name}</span>
                  <span className="block text-xs text-[#91a0b7]">
                    {user?.is_group === 1
                      ? typingUsers.length
                        ? `${typingUsers.slice(0, 2).map((person) => person.name).join(", ")}${typingUsers.length > 2 ? ` +${typingUsers.length - 2}` : ""} typing…`
                        : `${user?.total_members || 0} members`
                      : typingUsers.length
                        ? "Typing…"
                        : activeUsers.includes(String(user?._id))
                          ? "Active now"
                          : activityFormat(user?.lastSeenAt, activityNow)}
                  </span>
                </span>
                {activeUsers.includes(String(user?._id)) && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-label="Online" />
                )}
              </div>
            ) : (
              <div className="font-semibold tracking-wide text-white">Convo</div>
            )}
            <div className="flex items-center gap-1">
              <CallControls
                conversation={user}
                currentUser={authUser}
                showButtons={Boolean(user)}
                blocked={Boolean(user?.blocked || user?.blockedByPartner)}
              />
              {user && <ConversationMenu conversation={user} onViewContact={handleEditOrViewModal} />}
            </div>
          </header>
          {user ? (
            isConversationLoading ? (
              <MessageLoadingState />
            ) : (
              <Messages key={user?._id} />
            )
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500/15 text-3xl text-indigo-300">✦</div>
                <h1 className="text-xl font-semibold text-white">Your conversations, together</h1>
                <p className="mt-2 max-w-sm text-sm text-[#91a0b7]">Choose a conversation to send messages, share files, or start a call.</p>
              </div>
            </div>
          )}
          {user && (
            <div className="shrink-0">
              {user?.blocked || user?.blockedByPartner ? (
                <div className="m-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {user?.blocked ? "You blocked this contact. Unblock them from the conversation menu to send messages or call." : "This contact has blocked you."}
                </div>
              ) : (
              <form method="POST" onSubmit={sendMessage}>
                <footer className="message-composer">
                  {attachment && (
                    <div className="mb-2 flex items-center justify-between rounded-xl border border-[#263248] bg-[#182235] px-3 py-2 text-sm text-[#c7d2e3]">
                      <span className="truncate">{attachment.name}</span>
                      <button type="button" className="ml-3 text-rose-300" onClick={() => { setAttachment(null); setAttachmentDuration(0); setAttachmentError(""); }} aria-label="Remove attachment">×</button>
                    </div>
                  )}
                  <ValidationError message={attachmentError} />
                  {replyTarget && (
                    <div className="mb-2 flex min-w-0 items-center justify-between rounded-xl border border-indigo-400/20 bg-[#182235] px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-[#c7d2e3]">Replying to {replyTarget.sender}: {replyTarget.text}</span>
                      <button type="button" className="ml-3 shrink-0 text-base text-[#91a0b7]" onClick={() => setReplyTarget(null)} aria-label="Cancel reply">×</button>
                    </div>
                  )}
                  <div className="composer-controls flex items-end gap-1 rounded-2xl border border-[#263248] bg-[#0c1321] p-1.5 shadow-lg shadow-black/20">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,audio/*,video/mp4,video/webm,application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        chooseAttachment(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="composer-action composer-icon"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach a photo or file, or take a picture"
                      aria-label="Attach a file"
                    >
                      <FaPaperclip />
                    </button>
                    <div className="composer-entry relative min-w-0 flex-1">
                      <textarea
                        ref={messageInputRef}
                        rows={1}
                        placeholder="Type a message"
                        enterKeyHint="enter"
                        className="form-control message-input min-h-11 resize-none"
                        aria-invalid={Boolean(messageError)}
                        onChange={(event) => {
                          setMessage(event.target.value);
                          handleMessageTyping(event.target.value);
                          setMessageError("");
                          event.target.style.height = "auto";
                          event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
                        }}
                        onKeyDown={(event) => {
                          // like WhatsApp: on a phone Enter adds a new line (send with the button);
                          // on a computer Enter sends and Shift+Enter adds a new line
                          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                          if (window.matchMedia?.("(pointer: coarse)").matches) return;
                          event.preventDefault();
                          sendMessage(event);
                        }}
                        onBlur={() => stopTyping()}
                        value={message}
                      />
                    </div>
                    <div className="composer-action relative" ref={emojiRef}>
                      <button
                        type="button"
                        className={`composer-icon text-lg ${showPicker ? "is-active" : ""}`}
                        title="Choose emoji"
                        aria-label="Choose emoji"
                        aria-expanded={showPicker}
                        onClick={() => setShowPicker((val) => !val)}
                      >
                        🙂
                      </button>
                      {showPicker && (
                        <div className="emoji-picker-popover">
                          <Picker
                            theme="dark"
                            width="100%"
                            height={380}
                            lazyLoadEmojis
                            previewConfig={{ showPreview: false }}
                            onEmojiClick={onEmojiClick}
                          />
                        </div>
                      )}
                    </div>
                    {message.trim().length > 0 || attachment ? (
                      <button
                        type="submit"
                        className="composer-send"
                        disabled={sending}
                        title="Send"
                        aria-label="Send"
                      >
                        {sending ? <span className="composer-spinner" aria-hidden="true" /> : <FiSend />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`composer-send ${recording ? "is-recording" : ""}`}
                        onClick={toggleVoiceRecording}
                        title={recording ? "Stop recording" : "Record voice note"}
                        aria-label={recording ? "Stop recording" : "Record voice note"}
                      >
                        {recording ? <FiSquare /> : <FiMic />}
                      </button>
                    )}
                  </div>
                  <ValidationError message={messageError} />
                </footer>
              </form>
              )}
            </div>
          )}
        </main>
      </div>
      <GroupEditOrViewModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        data={data}
      />
      {exitConfirmationOpen && (
        <div
          className="confirmation-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setExitConfirmationOpen(false);
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-exit-title"
            aria-describedby="app-exit-description"
          >
            <h2 id="app-exit-title">Do you want to close this app?</h2>
            <p id="app-exit-description">You can return to your conversations whenever you want.</p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="confirmation-cancel"
                onClick={() => setExitConfirmationOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirmation-accept"
                onClick={() => {
                  allowAppExitRef.current = true;
                  setExitConfirmationOpen(false);
                  window.close();
                  window.history.back();
                }}
              >
                Close app
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

function MessageLoadingState() {
  return (
    <div className="message-loading-state" role="status" aria-label="Loading messages">
      <div className="message-skeleton-row is-received">
        <span className="skeleton-shimmer message-skeleton-bubble short" />
      </div>
      <div className="message-skeleton-row is-sent">
        <span className="skeleton-shimmer message-skeleton-bubble medium" />
      </div>
      <div className="message-skeleton-row is-received">
        <span className="skeleton-shimmer message-skeleton-bubble long" />
      </div>
      <div className="message-skeleton-row is-sent">
        <span className="skeleton-shimmer message-skeleton-bubble short" />
      </div>
      <span className="sr-only">Loading messages...</span>
    </div>
  );
}

export default Home;

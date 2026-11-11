"use client";
import Picker from "emoji-picker-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { FaPaperclip } from "react-icons/fa";
import { FiMic, FiSend, FiSquare } from "react-icons/fi";
import { toast } from "react-toastify";
import GroupEditOrViewModal from "./components/GroupEditOrViewModal";
import Messages from "./components/Messages";
import Sidebar from "./components/Sidebar";
import CallControls from "./components/CallControls";
import ValidationError from "./components/ValidationError";
import { MessageContext } from "./contexts/MessageContext";
import { UserContext } from "./contexts/UserContext";
import { UserListContext } from "./contexts/UserListContext";
import {
  auth,
  getImageURL,
  loadMessages,
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
  const { user, setUser } = useContext(UserContext);
  // const { user: authUser, setUser: setAuthUser } = useContext(AuthContext)
  const { messages, setMessages } = useContext(MessageContext);
  const [message, setMessage] = useState("");
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [data, setData] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [messageError, setMessageError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const emojiRef = useRef(null);
  const userListRequestRef = useRef(0);
  const allowAppExitRef = useRef(false);
  const authUser = auth();
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
      if (allowAppExitRef.current || event.state?.convoExitGuard) return;
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
  }, [authUser?._id]);

  useEffect(() => {
    if (!exitConfirmationOpen) return;
    const dismissOnEscape = (event) => {
      if (event.key === "Escape") setExitConfirmationOpen(false);
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [exitConfirmationOpen]);

  const getUserList = useCallback(async () => {
    if (!authUser?._id) {
      setIsUserListLoading(false);
      return;
    }
    const requestId = ++userListRequestRef.current;
    setIsUserListLoading(true);
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

  useEffect(() => {
    getUserList();
  }, [getUserList]);

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
        const conversationMessages = await loadMessages(ticket);
        if (!Array.isArray(conversationMessages)) throw new Error("Unable to load messages.");
        if (cancelled) return;
        setMessages(conversationMessages);
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
  }, [authUser?._id, setMessages, setUser]);

  useEffect(() => {
    if (!authUser?._id) return;
    const registerUser = () => socket.emit("register-user");
    socket.on("connect", registerUser);
    socket.connect();
    if (socket.connected) registerUser();
    return () => socket.off("connect", registerUser);
  }, [authUser?._id]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (sending) return;
    if (!message.trim() && !attachment) {
      setMessageError("Enter a message or attach a file before sending.");
      return;
    }
    if (message.trim().length > 5000) {
      setMessageError("Messages can contain up to 5,000 characters.");
      return;
    }
    setMessageError("");
    setAttachmentError("");
    setSending(true);
    try {
      let uploaded = null;
      if (attachment) {
        const uploadData = new FormData();
        uploadData.append("file", attachment);
        const uploadResponse = await fetch("/api/upload", { method: "POST", body: uploadData });
        // the host can refuse a too-large body before the app runs, with a non-JSON page
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok || !uploadResult.success) {
          setAttachmentError(uploadResult.message || (uploadResponse.status === 413
            ? `This file is too large. Files must be smaller than ${MAX_UPLOAD_MB} MB.`
            : "Unable to upload this file. Please try again."));
          return;
        }
        uploaded = uploadResult.data;
      }

      const data = {
        message: message,
        sender_id: authUser?._id,
        receiver_id: user?._id,
        is_group: user?.is_group,
        attachmentUrl: uploaded?.url,
        attachmentName: uploaded?.name,
        mimeType: uploaded?.mimeType,
        reply_to: replyTarget?.message_id,
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
      const res = await response.json();
      if (response.ok && res.success) {
        socket.emit("private-message", JSON.stringify(res.data));
        setMessage("");
        setReplyTarget(null);
        setAttachment(null);
        setShowPicker(false);
        if (messageInputRef.current) messageInputRef.current.style.height = "auto";
        // the socket server does not echo an event back to the tab that sent it
        setMessages(await loadMessages(user));
      } else {
        setMessageError(res.message || "Unable to send message.");
      }
    } catch (error) {
      setMessageError("Unable to send this message. Check your connection and try again.");
    } finally {
      setSending(false);
    }
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
        const voiceNote = new File(chunks, `voice-note-${Date.now()}.webm`, {
          type: recorder.mimeType || "audio/webm",
        });
        setAttachment(voiceNote);
        setAttachmentError("");
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start();
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
      if (
        (data?.is_group == 1 && user?._id == data?.receiver_id) ||
        (data?.sender_id == authUser?._id && data?.receiver_id == user?._id) ||
        (data?.sender_id == user?._id && data?.receiver_id == authUser?._id)
      ) {
        let res = await loadMessages(user);
        setMessages(res);
      } else if (data?.receiver_id == authUser?._id || data?.is_group == 1) {
        let userList = [...users];
        let index = userList.findIndex(
          (user) =>
            (user?._id == data.sender_id || user?._id == data.receiver_id) &&
            user?.is_group == data?.is_group
        );
        if (index >= 0) {
          userList[index].pending++;
          setUsers(userList);
        }
      }
    });
  };

  //online users
  const loadActiveUsers = () => {
    socket.off("active-users");
    socket.on("active-users", (data) => {
      setActiveUsers(data);
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
      setMessages((current) => (current || []).filter((item) =>
        item?._id !== data?._id && (!data?.message_id || item?.message_id !== data.message_id)
      ));
    });

    socket.off("message-reaction");
    socket.on("message-reaction", (data) => {
      setMessages((current) => (current || []).map((item) =>
        item?.message_id === data?.message_id
          ? { ...item, message: { ...item.message, reactions: data.reactions } }
          : item
      ));
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
      };

      let newUsers = [...users, newUser];

      setUsers(newUsers);
      if (data?.created_by !== authUser?._id) {
        toast.success(data?.message);
      }
    });

    socket.off("update-group");
    socket.on("update-group", (data) => {
      setModalOpen(false);
      if (data?.res?.status === 0) {
        let newUsers = users.filter((user) => user._id !== data?._id);
        setUsers(newUsers);
        if (user._id === data?._id) {
          setUser("");
          setMessages([]);
        }
      }

      if (data?.res?.status === 1) {
        let newUser = {
          _id: data?._id,
          name: data?.name,
          photo: data?.photo,
          pending: 0,
          is_group: 1,
          total_members: data?.total_members,
        };

        let newUsers = [...users, newUser];

        setUsers(newUsers);
      }

      toast.success(data?.res?.message);
    });

    socket.off("delete-group");
    socket.on("delete-group", (data) => {
      setModalOpen(false);
      if (user._id === data?._id) {
        setUser("");
        setMessages([]);
      }
      let newUsers = users.filter((user) => user._id !== data?._id);
      setUsers(newUsers);
      if (data.deleted_by !== authUser._id) {
        toast.success(data?.message);
      }
    });

    socket.off("leave-group");
    socket.on("leave-group", (res) => {
      if (user._id === res?._id) {
        setUser({ ...user, total_members: user.total_members - 1 });
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
                    setUser("");
                    setMessages([]);
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
                  title={user?.name}
                />
                <span className="truncate">
                  <span className="block truncate text-sm font-semibold sm:text-base">{user?.name}</span>
                  <span className="block text-xs text-[#91a0b7]">
                    {user?.is_group === 1
                      ? `${user?.total_members || 0} members`
                      : activeUsers.includes(user?._id) ? "Online" : "Conversation"}
                  </span>
                </span>
                {activeUsers.includes(user?._id) && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-label="Online" />
                )}
              </div>
            ) : (
              <div className="font-semibold tracking-wide text-white">Convo</div>
            )}
            <div className="flex items-center gap-1">
              <CallControls conversation={user} currentUser={authUser} showButtons={Boolean(user)} />
              {user && (
                <button
                  type="button"
                  className="rounded-xl p-2 text-sm text-gray-300 hover:bg-[#263248]"
                  onClick={handleEditOrViewModal}
                  aria-label="Conversation details"
                >
                  ⋯
                </button>
              )}
            </div>
          </header>
          {user ? (
            isConversationLoading ? (
              <MessageLoadingState />
            ) : messages?.length > 0 ? (
              <Messages key={user?._id} />
            ) : (
              <div className="grid flex-1 place-items-center text-center text-sm text-[#91a0b7]">
                <div>
                  <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500/10 text-2xl text-indigo-300">✦</div>
                  <p className="font-medium text-[#e8edf7]">Start the conversation</p>
                  <p className="mt-1">Send a message, photo, or voice note.</p>
                </div>
              </div>
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
              <form method="POST" onSubmit={sendMessage}>
                <footer className="message-composer">
                  {attachment && (
                    <div className="mb-2 flex items-center justify-between rounded-xl border border-[#263248] bg-[#182235] px-3 py-2 text-sm text-[#c7d2e3]">
                      <span className="truncate">{attachment.name}</span>
                      <button type="button" className="ml-3 text-rose-300" onClick={() => { setAttachment(null); setAttachmentError(""); }} aria-label="Remove attachment">×</button>
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
                  setExitConfirmationOpen(false);
                  allowAppExitRef.current = true;
                  window.history.go(-2);
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

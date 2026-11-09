"use client";
import Picker from "emoji-picker-react";
import { useContext, useEffect, useRef, useState } from "react";
import { FaPaperclip } from "react-icons/fa";
import { FiMic, FiSquare } from "react-icons/fi";
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
const Home = () => {
  const { users, setUsers } = useContext(UserListContext);
  const [activeUsers, setActiveUsers] = useState([]);
  const { user, setUser } = useContext(UserContext);
  // const { user: authUser, setUser: setAuthUser } = useContext(AuthContext)
  const { messages, setMessages } = useContext(MessageContext);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [data, setData] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [messageError, setMessageError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const authUser = auth();
  const onEmojiClick = (emojiObject) => {
    setMessage((msg) => msg + emojiObject.emoji);
    setShowPicker(false);
  };

  const getUserList = async () => {
    let res = await fetch(
      `/api/users?auth_id=${authUser._id}&search=${search}`
    );
    res = await res.json();
    if (res.success) {
      setUsers(res.data);
    }
  };

  useEffect(() => {
    getUserList();
  }, [search]);

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
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadResult.success) {
          setAttachmentError(uploadResult.message || "Unable to upload this file.");
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
        setAttachment(null);
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
      let filterMessages = [...messages];
      filterMessages = filterMessages.filter((m) => m?._id !== data?._id);
      setMessages(filterMessages);
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
        />
        <main className={`chat-main ${!user ? "is-hidden-mobile" : ""}`}>
          <header className="flex items-center justify-between border-b border-[#263248] bg-[#111827]/95 px-4 py-3 text-white sm:px-6">
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
            messages?.length > 0 ? (
              <Messages />
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
            <div>
              <form method="POST" onSubmit={sendMessage}>
                <footer className="message-composer">
                  {attachment && (
                    <div className="mb-2 flex items-center justify-between rounded-xl border border-[#263248] bg-[#182235] px-3 py-2 text-sm text-[#c7d2e3]">
                      <span className="truncate">{attachment.name}</span>
                      <button type="button" className="ml-3 text-rose-300" onClick={() => { setAttachment(null); setAttachmentError(""); }} aria-label="Remove attachment">×</button>
                    </div>
                  )}
                  <ValidationError message={attachmentError} />
                  <div className="flex items-center gap-2 rounded-2xl border border-[#263248] bg-[#0c1321] p-2 shadow-lg shadow-black/20">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,audio/*,video/mp4,video/webm,application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        setAttachment(event.target.files?.[0] || null);
                        setAttachmentError("");
                        event.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-xl p-3 text-[#91a0b7] hover:bg-[#263248] hover:text-white"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach a file"
                      aria-label="Attach a file"
                    >
                      <FaPaperclip />
                    </button>
                    <button
                      type="button"
                      className={`rounded-xl p-3 ${recording ? "text-rose-300" : "text-[#91a0b7] hover:bg-[#263248] hover:text-white"}`}
                      onClick={toggleVoiceRecording}
                      title={recording ? "Stop recording" : "Record voice note"}
                      aria-label={recording ? "Stop recording" : "Record voice note"}
                    >
                      {recording ? <FiSquare /> : <FiMic />}
                    </button>
                    <div className="relative w-full">
                      <div className="relative w-full">
                        {/* Input and Send Button Wrapper */}
                        <div className="flex items-center">
                          <div className="relative flex-grow">
                            <input
                              type="text"
                              placeholder="Type a message..."
                              className="form-control pr-12"
                              aria-invalid={Boolean(messageError)}
                              onChange={(e) => { setMessage(e.target.value); setMessageError(""); }}
                              value={message}
                            />
                            {/* Emoji Picker Icon */}
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-lg"
                              title="Choose emoji"
                              aria-label="Choose emoji"
                              onClick={() => setShowPicker((val) => !val)}
                            >
                              🙂
                            </button>
                          </div>
                          {/* Send Button */}
                          <button
                            type="submit"
                            className={`ml-3 rounded-xl px-4 py-3 font-medium ${
                              message.trim()?.length > 0
                                ? "bg-indigo-500 hover:bg-indigo-400"
                                : "cursor-not-allowed bg-indigo-500/40"
                            } text-white`}
                            disabled={sending}
                            title={message.trim().length > 0 || attachment ? "Send" : ""}
                          >
                            {sending ? "Sending..." : "Send"}
                          </button>
                        </div>
                        <ValidationError message={messageError} />

                        {/* Emoji Picker */}
                        {showPicker && (
                          <div className="left-0 w-full mt-2 z-10">
                            <Picker
                              pickerStyle={{ width: "100%" }}
                              onEmojiClick={onEmojiClick}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
    </div>
  );
};

export default Home;

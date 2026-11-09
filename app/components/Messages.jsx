import { useContext, useEffect, useRef } from "react";
import { dateTimeFormat, getImageURL, socket_connection } from "../helpers/helper";
import { AuthContext } from "../contexts/AuthContext";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import { MessageContext } from "../contexts/MessageContext";

const socket = socket_connection();

const Messages = () => {
  const elementRef = useRef(null);
  const { user } = useContext(AuthContext);
  const { messages, setMessages } = useContext(MessageContext);

  useEffect(() => {
    elementRef.current?.scrollTo({
      top: elementRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleRemoveMsg = (msg) => {
    Swal.fire({
      title: "Remove this message?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#6366f1",
      cancelButtonColor: "#475569",
      confirmButtonText: "Remove",
      cancelButtonText: "Keep",
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      const method = msg?.sender?._id === user?._id ? "DELETE" : "PATCH";
      const response = await fetch(`/api/messages/${msg?._id}`, { method });
      const res = await response.json();
      if (res.success) {
        setMessages(messages.filter((message) => message?._id !== res?.message_id));
        if (method === "DELETE") socket.emit("message-deleted", JSON.stringify(msg));
      } else {
        toast.error(res.message || "Unable to remove this message.");
      }
    });
  };

  return (
    <div className="message-scroll" id="root" ref={elementRef}>
      {messages?.map((data) => {
        const sender = data?.sender;
        const receiver = data?.receiver;
        if (receiver?._id === user?._id && data?.status === 2) return null;

        const mine = sender?._id === user?._id;
        return (
          <div key={data?._id} className="mb-5">
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
              <div
                className={`max-w-[min(85%,36rem)] cursor-pointer rounded-2xl px-4 py-3 shadow-lg shadow-black/10 ${
                  mine
                    ? "rounded-br-md border border-indigo-400/20 bg-indigo-500 text-white"
                    : "rounded-bl-md border border-[#263248] bg-[#182235] text-[#e8edf7]"
                }`}
                title="Double-click to remove"
                onDoubleClick={() => handleRemoveMsg(data)}
              >
                <MessageContent message={data?.message} />
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
  );
};

function MessageContent({ message }) {
  if (!message?.attachmentUrl) {
    return <p className="whitespace-pre-wrap break-words">{message?.message}</p>;
  }

  if (message.type === "image") {
    return (
      <a href={message.attachmentUrl} target="_blank" rel="noreferrer">
        <img
          src={message.attachmentUrl}
          alt={message.attachmentName || "Shared image"}
          className="max-h-80 max-w-full rounded-xl object-contain"
        />
        {message.message && <p className="mt-2 whitespace-pre-wrap break-words">{message.message}</p>}
      </a>
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

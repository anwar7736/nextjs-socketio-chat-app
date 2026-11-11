"use client";

import { useEffect, useRef, useState } from "react";
import { FiBell, FiBellOff, FiDownload, FiFile, FiImage, FiLink, FiSearch, FiUser, FiX } from "react-icons/fi";
import { toast } from "react-toastify";

export default function ConversationMenu({ conversation, onViewContact }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [muted, setMuted] = useState(false);
  const [savingMute, setSavingMute] = useState(false);
  const rootRef = useRef(null);
  const conversationId = conversation?._id;
  const isGroup = conversation?.is_group === 1;

  const loadHistory = async () => {
    const history = [];
    for (let offset = 0; ; offset += 500) {
      const query = new URLSearchParams({
        ref_id: conversationId,
        is_group: isGroup ? "1" : "0",
        all: "1",
        mark_read: "0",
        offset: String(offset),
      });
      const response = await fetch(`/api/messages?${query}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load conversation history.");
      history.push(...(result.data || []));
      if (!result.has_more) return history;
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    fetch("/api/conversations/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, is_group: isGroup, action: "check" }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load notification settings.");
      setMuted(Boolean(result.muted));
      window.dispatchEvent(new CustomEvent("chat:mute-change", { detail: { conversationId, muted: Boolean(result.muted) } }));
    }).catch((error) => console.error("Unable to load notification settings:", error));
  }, [conversationId, isGroup]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setSearchOpen(false);
        setMediaOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  const openMedia = async () => {
    setOpen(false);
    setMediaOpen(true);
    setLoadingMedia(true);
    try {
      setMediaItems(await loadHistory());
    } catch (error) {
      toast.error(error.message || "Unable to load media.");
    } finally {
      setLoadingMedia(false);
    }
  };

  const exportChat = async () => {
    setOpen(false);
    try {
      const history = await loadHistory();
      const lines = history.map((item) => {
        const time = new Date(item.message?.createdAt || Date.now()).toLocaleString();
        const sender = item.sender?.name || "Unknown";
        const body = item.message?.deletedForEveryone
          ? "This message was deleted."
          : item.message?.message || item.message?.attachmentName || item.message?.attachmentUrl || "";
        return `[${time}] ${sender}${item.message?.editedAt ? " (edited)" : ""}: ${body}`;
      });
      const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(conversation?.name || "conversation").replace(/[^\w.-]+/g, "_")}-chat.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message || "Unable to export this chat.");
    }
  };

  const toggleMute = async () => {
    if (savingMute) return;
    setSavingMute(true);
    try {
      const action = muted ? "unmute" : "mute";
      const response = await fetch("/api/conversations/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, is_group: isGroup, action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to update notifications.");
      setMuted(Boolean(result.muted));
      window.dispatchEvent(new CustomEvent("chat:mute-change", { detail: { conversationId, muted: Boolean(result.muted) } }));
      setOpen(false);
      toast.success(result.muted ? "Conversation notifications muted." : "Conversation notifications enabled.");
    } catch (error) {
      toast.error(error.message || "Unable to update notifications.");
    } finally {
      setSavingMute(false);
    }
  };

  const searchMessages = (value) => {
    setSearch(value);
  };

  const openSearch = async () => {
    setOpen(false);
    setSearchOpen(true);
    setSearchError("");
    setLoadingSearch(true);
    try {
      setSearchHistory(await loadHistory());
    } catch (error) {
      setSearchError(error.message || "Unable to search this conversation.");
    } finally {
      setLoadingSearch(false);
    }
  };

  const searchResults = search.trim()
    ? searchHistory.filter((item) =>
      String(item.message?.message || "").toLowerCase().includes(search.trim().toLowerCase())
    ).slice(0, 40)
    : [];
  const openSearchResult = (item) => {
    window.dispatchEvent(new CustomEvent("chat:search", { detail: { item } }));
    setSearchOpen(false);
  };

  const items = mediaItems.flatMap((item) => {
    const message = item.message || {};
    const media = typeof message.attachmentUrl === "string" &&
      /^(\/api\/attachments\/|https?:\/\/)/i.test(message.attachmentUrl) ? [{
      key: `${item.message_id}-attachment`,
      icon: message.type === "image" || message.type === "video" ? FiImage : FiFile,
      label: message.attachmentName || (message.type === "image" ? "Photo" : message.type === "video" ? "Video" : "File"),
      href: message.attachmentUrl,
    }] : [];
    const links = (message.message || "").match(/https?:\/\/[^\s]+/g) || [];
    return [...media, ...links.map((href, index) => ({
      key: `${item.message_id}-link-${index}`,
      icon: FiLink,
      label: href,
      href,
    }))];
  });

  if (!conversationId) return null;
  return (
    <div className="conversation-menu-root" ref={rootRef}>
      <button
        type="button"
        className="rounded-xl p-2 text-sm text-gray-300 hover:bg-[#263248]"
        onClick={() => setOpen((value) => !value)}
        aria-label="Conversation options"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="conversation-menu-popover" role="menu">
          <button type="button" role="menuitem" onClick={openSearch}>
            <FiSearch /> Search
          </button>
          <button type="button" role="menuitem" onClick={openMedia}><FiImage /> Media, files & links</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onViewContact?.(); }}><FiUser /> View contact</button>
          <button type="button" role="menuitem" onClick={exportChat}><FiDownload /> Export chat</button>
          <button type="button" role="menuitem" onClick={toggleMute} disabled={savingMute}>
            {muted ? <FiBell /> : <FiBellOff />}
            {muted ? "Unmute notifications" : "Mute notifications"}
          </button>
        </div>
      )}
      {searchOpen && (
        <div className="conversation-search-popover">
          <div className="flex items-center gap-2">
            <FiSearch />
            <input autoFocus value={search} onChange={(event) => searchMessages(event.target.value)} placeholder="Search in conversation" />
            <button type="button" onClick={() => { setSearch(""); setSearchOpen(false); }} aria-label="Close search"><FiX /></button>
          </div>
          {loadingSearch ? <p>Loading conversation history…</p> : searchError ? <p>{searchError}</p> : search.trim() ? (
            <div className="conversation-search-results">
              {searchResults.map((item) => (
                <button key={item._id} type="button" onClick={() => openSearchResult(item)}>
                  <strong>{item.sender?.name || "Message"}</strong>
                  <span>{item.message?.message || item.message?.attachmentName || "Attachment"}</span>
                  <small>{new Date(item.message?.createdAt || Date.now()).toLocaleString()}</small>
                </button>
              ))}
              {!searchResults.length && <p>No matching messages.</p>}
            </div>
          ) : <p>Search all messages in this conversation.</p>}
        </div>
      )}
      {mediaOpen && (
        <div className="confirmation-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setMediaOpen(false); }}>
          <section className="conversation-media-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-media-title">
            <header>
              <h2 id="conversation-media-title">Media, files & links</h2>
              <button type="button" onClick={() => setMediaOpen(false)} aria-label="Close media"><FiX /></button>
            </header>
            {loadingMedia ? <p className="p-6 text-center text-sm text-[#91a0b7]">Loading conversation history…</p> : items.length ? (
              <div className="conversation-media-list">
                {items.map(({ key, icon: Icon, label, href }) => (
                  <a key={key} href={href} target="_blank" rel="noreferrer" className="conversation-media-item">
                    <Icon />
                    <span>{label}</span>
                  </a>
                ))}
              </div>
            ) : <p className="p-6 text-center text-sm text-[#91a0b7]">No media, files, or links shared.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

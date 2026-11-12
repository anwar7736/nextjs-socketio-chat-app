"use client";

import { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiBell, FiBellOff, FiDownload, FiFile, FiImage, FiLink, FiMusic, FiSearch, FiSmile, FiUser, FiVideo, FiX } from "react-icons/fi";
import { toast } from "sonner";
import NicknamesModal from "./NicknamesModal";

const mediaCategories = [
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
  { id: "docs", label: "Docs" },
  { id: "links", label: "Links" },
  { id: "stickers", label: "Stickers" },
  { id: "audio", label: "Audio" },
];

export default function ConversationMenu({ conversation, onViewContact }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaCategory, setMediaCategory] = useState("photos");
  const [mediaPreview, setMediaPreview] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [muted, setMuted] = useState(false);
  const [savingMute, setSavingMute] = useState(false);
  const [nicknamesOpen, setNicknamesOpen] = useState(false);
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

  useEffect(() => {
    if (!mediaOpen && !mediaPreview) return;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (mediaPreview) setMediaPreview(null);
      else setMediaOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mediaOpen, mediaPreview]);

  const openMedia = async () => {
    setOpen(false);
    setMediaCategory("photos");
    setMediaPreview(null);
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
        const sender = Number(conversation?.is_group) !== 1 &&
          String(item.sender?._id) === String(conversation?._id)
          ? conversation?.nickname || item.sender?.name || "Unknown"
          : item.sender?.name || "Unknown";
        const body = item.message?.deletedForEveryone
          ? "This message was deleted."
          : item.message?.message || item.message?.attachmentName || item.message?.attachmentUrl || "";
        return `[${time}] ${sender}${item.message?.editedAt ? " (edited)" : ""}: ${body}`;
      });
      const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(conversation?.nickname || conversation?.name || "conversation").replace(/[^\w.-]+/g, "_")}-chat.txt`;
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
      icon: message.type === "image" ? FiImage
        : message.type === "video" ? FiVideo
          : message.type === "audio" ? FiMusic
            : message.type === "sticker" ? FiSmile : FiFile,
      category: message.type === "image" ? "photos"
        : message.type === "video" ? "videos"
          : message.type === "audio" ? "audio"
            : message.type === "sticker" ? "stickers" : "docs",
      type: message.type,
      label: message.attachmentName || (message.type === "image" ? "Photo"
        : message.type === "video" ? "Video"
          : message.type === "audio" ? "Audio"
            : message.type === "sticker" ? "Sticker" : "File"),
      href: message.attachmentUrl,
    }] : [];
    const links = (message.message || "").match(/https?:\/\/[^\s]+/g) || [];
    return [...media, ...links.map((href, index) => ({
      key: `${item.message_id}-link-${index}`,
      icon: FiLink,
      category: "links",
      type: "link",
      label: href,
      href,
    }))];
  });
  const selectedMediaItems = items.filter((item) => item.category === mediaCategory);
  const mediaCounts = Object.fromEntries(mediaCategories.map(({ id }) => [
    id,
    items.filter((item) => item.category === id).length,
  ]));
  const closeMedia = () => {
    setMediaOpen(false);
    setMediaPreview(null);
  };

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
          {conversation?.is_group !== 1 && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setNicknamesOpen(true); }}>
              <FiUser /> Nicknames
            </button>
          )}
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
        <div className="confirmation-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeMedia(); }}>
          <section className="conversation-media-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-media-title">
            <header>
              <h2 id="conversation-media-title">Media, files & links</h2>
              <button type="button" onClick={closeMedia} aria-label="Close media"><FiX /></button>
            </header>
            {loadingMedia ? <p className="p-6 text-center text-sm text-[#91a0b7]">Loading conversation history…</p> : (
              <>
                <nav className="conversation-media-tabs" role="tablist" aria-label="Media categories">
                  {mediaCategories.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={mediaCategory === id}
                      className={mediaCategory === id ? "is-selected" : ""}
                      onClick={() => setMediaCategory(id)}
                    >
                      {label}
                      <span>{mediaCounts[id]}</span>
                    </button>
                  ))}
                </nav>
                {selectedMediaItems.length ? (
                  <div className={`conversation-media-list ${["photos", "videos", "stickers"].includes(mediaCategory) ? "is-grid" : ""}`}>
                    {selectedMediaItems.map((item) => {
                      const { key, icon: Icon, label, href, category, type } = item;
                      const canPreview = ["photos", "videos", "stickers", "audio"].includes(category);
                      if (canPreview) {
                        return (
                          <button
                            key={key}
                            type="button"
                            className={category === "audio" ? "conversation-media-item conversation-media-preview-item" : "conversation-media-tile"}
                            onClick={() => setMediaPreview(item)}
                            aria-label={`Preview ${label}`}
                          >
                            {category === "photos" || category === "stickers"
                              ? <img src={href} alt="" loading="lazy" />
                              : category === "videos"
                                ? <video src={href} preload="metadata" muted playsInline />
                                : <span className={`conversation-media-icon ${category === "audio" ? "is-inline" : ""}`}><Icon /></span>}
                            <span title={label}>{label}</span>
                          </button>
                        );
                      }
                      return (
                        <a
                          key={key}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          download={category === "docs" ? true : undefined}
                          className="conversation-media-item"
                        >
                          <Icon />
                          <span>{label}</span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="p-6 text-center text-sm text-[#91a0b7]">
                    No {mediaCategories.find((item) => item.id === mediaCategory)?.label.toLowerCase()} shared.
                  </p>
                )}
              </>
            )}
          </section>
          {mediaPreview && (
            <div
              className="photo-preview-overlay conversation-media-preview"
              role="dialog"
              aria-modal="true"
              aria-label={`${mediaPreview.label} preview`}
              onClick={(event) => { if (event.target === event.currentTarget) setMediaPreview(null); }}
            >
              <div className="photo-preview-bar">
                <button type="button" className="photo-preview-back" onClick={() => setMediaPreview(null)} aria-label="Back to media" title="Back">
                  <FiArrowLeft />
                </button>
                <span className="min-w-0 truncate text-sm text-[#c7d2e3]">{mediaPreview.label}</span>
              </div>
              {mediaPreview.type === "video"
                ? <video src={mediaPreview.href} controls playsInline />
                : mediaPreview.type === "audio"
                  ? <audio src={mediaPreview.href} controls />
                  : <img src={mediaPreview.href} alt={mediaPreview.label} />}
            </div>
          )}
        </div>
      )}
      {nicknamesOpen && (
        <NicknamesModal conversation={conversation} onClose={() => setNicknamesOpen(false)} />
      )}
    </div>
  );
}

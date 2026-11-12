"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiChevronRight, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { AuthContext } from "../contexts/AuthContext";
import { UserContext } from "../contexts/UserContext";
import { UserListContext } from "../contexts/UserListContext";
import { getImageURL } from "../helpers/helper";

export default function NicknamesModal({ conversation, onClose }) {
  const { user: currentUser } = useContext(AuthContext);
  const { setUser: setSelectedConversation } = useContext(UserContext);
  const { setUsers } = useContext(UserListContext);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(conversation?.nickname || "");
  const [saving, setSaving] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setNickname(conversation?.nickname || "");
  }, [conversation?._id, conversation?.nickname]);

  useEffect(() => {
    window.history.pushState(
      { ...(window.history.state || {}), nicknamesDialog: true },
      "",
      window.location.href
    );
    const handlePopState = (event) => {
      if (event.state?.nicknamesDialog) {
        closeEditor();
        return;
      }
      onCloseRef.current();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && window.history.state?.nicknamesDialog) {
        window.history.back();
      }
    };
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeNicknames = () => {
    if (window.history.state?.nicknamesDialog) window.history.back();
    else onClose();
  };

  const closeEditor = () => {
    if (window.history.state?.nicknameEditor) window.history.back();
    else setEditing(false);
  };

  const openEditor = () => {
    window.history.pushState(
      { ...(window.history.state || {}), nicknameEditor: true },
      "",
      window.location.href
    );
    setEditing(true);
  };

  const saveNickname = async (event) => {
    event.preventDefault();
    if (saving || !currentUser?._id || !conversation?._id) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/user/profile/${currentUser._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: conversation._id, nickname }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to save this nickname.");
      }

      const updatedConversation = { ...conversation, nickname: result.nickname };
      setSelectedConversation((current) =>
        current?._id === conversation._id ? { ...current, nickname: result.nickname } : current
      );
      setUsers((current) => (current || []).map((item) =>
        item?._id === conversation._id && item?.is_group !== 1
          ? { ...item, nickname: result.nickname }
          : item
      ));
      closeEditor();
      toast.success(result.nickname ? "Nickname updated." : "Nickname removed.");
    } catch (error) {
      toast.error(error.message || "Unable to save this nickname.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="nickname-screen-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget)         closeNicknames();
      }}
    >
      <section className="nickname-screen" role="dialog" aria-modal="true" aria-labelledby="nicknames-title">
        <header className="nickname-screen-header">
          <button type="button" onClick={closeNicknames} aria-label="Back to conversation">
            <FiArrowLeft />
          </button>
          <h2 id="nicknames-title">Nicknames</h2>
          <button type="button" className="nickname-screen-close" onClick={closeNicknames} aria-label="Close nicknames">
            <FiX />
          </button>
        </header>

        <div className="nickname-screen-list">
          <button type="button" className="nickname-person" onClick={openEditor}>
            <img src={getImageURL(conversation?.photo)} alt="" />
            <span className="nickname-person-copy">
              <strong>{conversation?.nickname || "Set nickname"}</strong>
              <span>{conversation?.name || "Conversation partner"}</span>
            </span>
            <FiChevronRight className="nickname-person-action" aria-hidden="true" />
          </button>
          <div className="nickname-person is-read-only">
            <img src={getImageURL(currentUser?.photo)} alt="" />
            <span className="nickname-person-copy">
              <strong>{conversation?.partnerNickname || "No nickname set"}</strong>
              <span>{currentUser?.name || "You"}</span>
            </span>
            <span className="nickname-person-note">You</span>
          </div>
        </div>
      </section>

      {editing && (
        <div
          className="nickname-edit-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <form className="nickname-edit-dialog" onSubmit={saveNickname} role="dialog" aria-modal="true" aria-labelledby="nickname-edit-title">
            <h3 id="nickname-edit-title">Set nickname</h3>
            <p>Choose how {conversation?.name || "this person"} appears to you.</p>
            <input
              autoFocus
              value={nickname}
              maxLength={40}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={conversation?.name || "Enter a nickname"}
              aria-label="Nickname"
            />
            <div className="nickname-edit-actions">
              <button type="button" className="nickname-edit-cancel" onClick={closeEditor}>
                Cancel
              </button>
              <button type="submit" className="nickname-edit-save" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

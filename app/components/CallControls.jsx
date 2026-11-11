"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { FaVideo } from "react-icons/fa";
import { FiMic, FiMicOff, FiPhone, FiPhoneOff, FiRefreshCw, FiVideo, FiVideoOff } from "react-icons/fi";
import { MdAddIcCall } from "react-icons/md";
import { toast } from "react-toastify";
import { UserListContext } from "../contexts/UserListContext";
import { getImageURL, socket_connection } from "../helpers/helper";

const socket = socket_connection();
const END_SCREEN_MS = 1800; // how long "Line busy", "Call ended 01:23" … stay on screen

const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

/* ---------- ringtones (generated once, no audio files needed) ---------- */

// a mono 16-bit WAV of tone segments: [frequencies[], seconds] ([] = silence)
function makeToneUrl(segments, sampleRate = 16000) {
  const total = segments.reduce((sum, [, seconds]) => sum + Math.round(seconds * sampleRate), 0);
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + total * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, total * 2, true);
  let offset = 44;
  for (const [freqs, seconds] of segments) {
    const count = Math.round(seconds * sampleRate);
    for (let i = 0; i < count; i += 1) {
      let value = 0;
      if (freqs.length) {
        const t = i / sampleRate;
        const fade = Math.min(1, i / 400, (count - i) / 400); // no clicks at the edges
        value = freqs.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / freqs.length * 0.35 * fade;
      }
      view.setInt16(offset, value * 32767, true);
      offset += 2;
    }
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

let tones = null;
function getTones() {
  if (!tones && typeof window !== "undefined") {
    tones = {
      // incoming: a bright two-note phrase, repeated
      ring: makeToneUrl([[[784], 0.18], [[], 0.06], [[988], 0.18], [[], 0.06], [[784], 0.18], [[], 0.06], [[988], 0.3], [[], 1.4]]),
      // outgoing ringback, the classic "tuuut … tuuut"
      ringback: makeToneUrl([[[440, 480], 1.2], [[], 2.4]]),
      // busy / ended: three short beeps
      busy: makeToneUrl([[[480, 620], 0.25], [[], 0.25], [[480, 620], 0.25], [[], 0.25], [[480, 620], 0.25], [[], 0.1]]),
    };
  }
  return tones;
}

function useTone(kind, playing, loop = true) {
  useEffect(() => {
    if (!playing || !kind) return;
    const audio = new Audio(getTones()[kind]);
    audio.loop = loop;
    audio.play().catch(() => {}); // browsers may refuse sound before the first tap; vibration/notification still work
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [kind, playing, loop]);
}

export default function CallControls({ conversation, currentUser, showButtons = true, blocked = false }) {
  const { users } = useContext(UserListContext) || {};
  const [incoming, setIncoming] = useState(null);
  const [call, setCall] = useState(null);
  const [ended, setEnded] = useState(null); // { title, subtitle, name, photo } shown briefly after a call
  const [remoteStreams, setRemoteStreams] = useState({});
  const [busy, setBusy] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const localStreamRef = useRef(null);
  const incomingRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const callRef = useRef(null);
  const endTimerRef = useRef(null);
  const iceServersRef = useRef([{ urls: "stun:stun.l.google.com:19302" }]);
  const currentUserIdRef = useRef(currentUser?._id);
  currentUserIdRef.current = currentUser?._id;
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const personFor = useCallback((id) => (Array.isArray(users) ? users.find((item) => item?._id === id) : null), [users]);

  const loadIceServers = useCallback(async () => {
    try {
      const response = await fetch("/api/calls/ice-servers");
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.iceServers)) iceServersRef.current = result.iceServers;
    } catch {
      // keep the public STUN default
    }
  }, []);

  const showEnded = useCallback((title, subtitle, info, tone = false) => {
    clearTimeout(endTimerRef.current);
    setEnded({ title, subtitle, ...info, tone });
    endTimerRef.current = setTimeout(() => setEnded(null), END_SCREEN_MS);
  }, []);

  const stopCall = useCallback((notify = true) => {
    const active = callRef.current;
    if (notify && active) socket.emit("call:end", { callId: active.callId });
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    callRef.current = null;
    setCall(null);
    setRemoteStreams({});
    setMuted(false);
    setCameraOff(false);
    setFacingMode("user");
  }, []);

  const removePeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRemoteStreams((streams) => {
      const next = { ...streams };
      delete next[peerId];
      return next;
    });
  }, []);

  const makePeer = useCallback((peerId, callId) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
    localStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:signal", { callId, to: peerId, signal: { candidate: event.candidate.toJSON() } });
      }
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) setRemoteStreams((streams) => ({ ...streams, [peerId]: stream }));
    };
    let restarts = 0;
    peer.onconnectionstatechange = async () => {
      // a dropped network (Wi-Fi to mobile data, a short outage): the side that made the offer
      // asks for a fresh route a couple of times before giving the participant up
      if (peer.connectionState === "failed" && restarts < 2 && currentUserIdRef.current < peerId) {
        restarts += 1;
        try {
          peer.restartIce?.();
          const offer = await peer.createOffer({ iceRestart: true });
          await peer.setLocalDescription(offer);
          socket.emit("call:signal", { callId, to: peerId, signal: { description: peer.localDescription.toJSON() } });
          return;
        } catch {
          // fall through and drop the participant
        }
      }
      if (peer.connectionState === "connected") restarts = 0;
      if (peer.connectionState === "closed" || (peer.connectionState === "failed" && restarts >= 2)) {
        removePeer(peerId);
      }
    };
    peersRef.current.set(peerId, peer);
    return peer;
  }, [removePeer]);

  const toggleTrack = (kind) => {
    const tracks = kind === "audio" ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMuted(!enabled);
    else setCameraOff(!enabled);
  };

  // front <-> back camera during a video call
  const flipCamera = async () => {
    const stream = localStreamRef.current;
    const oldTrack = stream?.getVideoTracks()[0];
    if (!oldTrack) return;
    const nextMode = facingMode === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextMode } });
      const newTrack = fresh.getVideoTracks()[0];
      newTrack.enabled = oldTrack.enabled;
      for (const peer of peersRef.current.values()) {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        await sender?.replaceTrack(newTrack);
      }
      stream.removeTrack(oldTrack);
      oldTrack.stop();
      stream.addTrack(newTrack);
      setFacingMode(nextMode);
      const element = document.getElementById("local-call-stream");
      if (element) element.srcObject = stream;
    } catch {
      toast.error("This device has no other camera.");
    }
  };

  const flushCandidates = useCallback(async (peerId, peer) => {
    const queued = pendingCandidatesRef.current.get(peerId) || [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of queued) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const openMedia = async (video) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Audio and video calls need a secure (https) connection.");
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        throw new Error(video ? "Allow camera and microphone access to make video calls." : "Allow microphone access to make calls.");
      }
      if (error?.name === "NotFoundError") throw new Error(video ? "No camera or microphone was found." : "No microphone was found.");
      if (error?.name === "NotReadableError") throw new Error("The camera or microphone is being used by another app.");
      throw error;
    }
  };

  const notifyMissed = useCallback((active, recipients) => {
    if (!active?.isCaller || !recipients?.length) return;
    fetch("/api/calls/missed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: active.conversationId,
        is_group: active.isGroup ? 1 : 0,
        is_video: active.isVideo,
        recipient_ids: recipients,
      }),
    }).catch(() => {});
  }, []);

  const startCall = async (video) => {
    if (!conversation?._id || !currentUser?._id || busy || callRef.current) return;
    if (blocked) {
      toast.error("Unblock this contact before calling.");
      return;
    }
    if (!socket.connected) {
      toast.error("Not connected. Check your internet connection and try again.");
      return;
    }
    setBusy(true);
    try {
      const accessResponse = await fetch("/api/conversations/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation._id,
          peer_id: conversation._id,
          is_group: conversation.is_group === 1,
        }),
      });
      const accessResult = await accessResponse.json().catch(() => ({}));
      if (!accessResponse.ok || !accessResult.success || !accessResult.allowed) {
        throw new Error(accessResult.message || "This conversation cannot receive calls.");
      }

      let recipients;
      if (conversation.is_group === 1) {
        const response = await fetch(`/api/group?id=${conversation._id}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to load group members.");
        recipients = result.data.members.map((member) => String(member.user_id)).filter((id) => id !== currentUser._id);
      } else {
        recipients = [String(conversation._id)];
      }
      if (!recipients.length) throw new Error("There are no other people to call.");
      if (recipients.length > 7) throw new Error("Group calls currently support up to 8 participants.");

      const stream = await openMedia(video);
      await loadIceServers();
      localStreamRef.current = stream;
      const activeCall = {
        callId: crypto.randomUUID(),
        isVideo: video,
        isCaller: true,
        callerId: currentUser._id,
        callerName: currentUser.name,
        conversationId: conversation._id,
        conversationName: conversation.name,
        photo: conversation.photo,
        isGroup: conversation.is_group === 1,
        recipients,
        status: "calling",
        startedAt: Date.now(),
      };
      callRef.current = activeCall;
      setCall(activeCall);
      socket.emit("call:invite", {
        callId: activeCall.callId,
        isVideo: activeCall.isVideo,
        callerName: activeCall.callerName,
        conversationName: activeCall.conversationName,
        conversationId: activeCall.conversationId,
        isGroup: activeCall.isGroup,
        recipients,
      });
    } catch (error) {
      toast.error(error.message || "Unable to start the call.");
      stopCall(false);
    } finally {
      setBusy(false);
    }
  };

  const acceptCall = async () => {
    if (!incoming) return;
    setBusy(true);
    try {
      const stream = await openMedia(incoming.isVideo);
      await loadIceServers();
      localStreamRef.current = stream;
      const caller = personFor(incoming.callerId);
      const activeCall = {
        ...incoming,
        isCaller: false,
        photo: caller?.photo,
        status: "connecting",
        startedAt: Date.now(),
      };
      callRef.current = activeCall;
      setCall(activeCall);
      incomingRef.current = null;
      setIncoming(null);
      socket.emit("call:accept", { callId: incoming.callId, callerId: incoming.callerId });
    } catch (error) {
      toast.error(error.message || "Unable to join the call.");
      socket.emit("call:reject", { callId: incoming.callId, callerId: incoming.callerId });
      incomingRef.current = null;
      setIncoming(null);
    } finally {
      setBusy(false);
    }
  };

  const declineCall = () => {
    if (!incoming) return;
    socket.emit("call:reject", { callId: incoming.callId, callerId: incoming.callerId });
    incomingRef.current = null;
    setIncoming(null);
  };

  const hangUp = () => {
    const active = callRef.current;
    if (!active) return;
    const connectedFor = active.connectedAt ? Math.floor((Date.now() - active.connectedAt) / 1000) : null;
    if (active.isCaller && !active.connectedAt) notifyMissed(active, active.recipients);
    stopCall();
    showEnded(connectedFor != null ? "Call ended" : "Call cancelled", connectedFor != null ? formatTime(connectedFor) : "", {
      name: active.isGroup || active.isCaller ? active.conversationName : active.callerName,
      photo: active.photo,
    });
  };

  /* ---------- sounds & vibration ---------- */
  useTone("ring", Boolean(incoming));
  useTone("ringback", call?.status === "ringing");
  useTone("busy", Boolean(ended?.tone), false);

  useEffect(() => {
    if (!incoming || !navigator.vibrate) return;
    navigator.vibrate([400, 200, 400]);
    const interval = setInterval(() => navigator.vibrate([400, 200, 400]), 2200);
    return () => {
      clearInterval(interval);
      navigator.vibrate(0);
    };
  }, [incoming]);

  // a ringing call while the app is in the background: a system notification, like WhatsApp
  useEffect(() => {
    if (!incoming || document.visibilityState === "visible") return;
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const tag = `incoming-${incoming.callId}`;
    navigator.serviceWorker.ready.then((registration) => registration.showNotification(
      `Incoming ${incoming.isVideo ? "video" : "voice"} call`,
      {
        body: incoming.conversationName && incoming.conversationName !== incoming.callerName
          ? `${incoming.callerName} @ ${incoming.conversationName}`
          : incoming.callerName,
        icon: "/icons/icon.svg",
        silent: false,
        tag,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400],
        data: { url: "/" },
      }
    )).catch(() => {});
    return () => {
      navigator.serviceWorker.ready
        .then((registration) => registration.getNotifications({ tag }))
        .then((list) => list.forEach((item) => item.close()))
        .catch(() => {});
    };
  }, [incoming]);

  /* ---------- timer: calling / ringing / in call ---------- */
  useEffect(() => {
    const timerStartedAt = call?.connectedAt || call?.startedAt || incoming?.startedAt;
    if (!timerStartedAt) {
      setElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - timerStartedAt) / 1000));
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [call?.connectedAt, call?.startedAt, incoming?.startedAt]);

  /* ---------- socket events ---------- */
  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onInvite = async (invite) => {
      if (callRef.current) {
        socket.emit("call:reject", { callId: invite.callId, callerId: invite.callerId });
        return;
      }
      try {
        const response = await fetch("/api/conversations/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: invite.conversationId,
            peer_id: invite.callerId,
            is_group: invite.isGroup,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !result.allowed || callRef.current) {
          socket.emit("call:reject", { callId: invite.callId, callerId: invite.callerId });
          return;
        }
      } catch (error) {
        console.error("Unable to verify incoming call access:", error);
        socket.emit("call:reject", { callId: invite.callId, callerId: invite.callerId });
        return;
      }
      const incomingCall = { ...invite, startedAt: Date.now() };
      incomingRef.current = incomingCall;
      setIncoming(incomingCall);
    };
    const onParticipant = async ({ callId, userId }) => {
      const active = callRef.current;
      if (!active || active.callId !== callId || userId === currentUserIdRef.current) return;
      if (!active.connectedAt) {
        const connectedCall = { ...active, status: "connected", connectedAt: Date.now() };
        callRef.current = connectedCall;
        setCall(connectedCall);
      }
      const peer = makePeer(userId, callId);
      if (currentUserIdRef.current < userId) {
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.emit("call:signal", { callId, to: userId, signal: { description: peer.localDescription.toJSON() } });
        } catch {
          toast.error("Unable to connect a call participant.");
        }
      }
    };
    const onSignal = async ({ callId, from, signal }) => {
      if (callRef.current?.callId !== callId || !signal) return;
      try {
        const peer = makePeer(from, callId);
        if (signal.candidate) {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            pendingCandidatesRef.current.set(from, [...(pendingCandidatesRef.current.get(from) || []), signal.candidate]);
          }
          return;
        }
        if (signal.description?.type === "offer") {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
          await flushCandidates(from, peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("call:signal", { callId, to: from, signal: { description: peer.localDescription.toJSON() } });
        } else if (signal.description?.type === "answer") {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
          await flushCandidates(from, peer);
        }
      } catch {
        toast.error("Unable to establish this call connection.");
      }
    };
    const endInfo = (active) => ({
      name: active.isGroup || active.isCaller ? active.conversationName : active.callerName,
      photo: active.photo,
    });
    const onEnded = ({ callId, reason }) => {
      const active = callRef.current;
      if (active?.callId === callId) {
        const connectedFor = active.connectedAt ? Math.floor((Date.now() - active.connectedAt) / 1000) : null;
        if (reason === "no-answer") notifyMissed(active, active.recipients);
        stopCall(false);
        if (reason === "no-answer") showEnded("No answer", "", endInfo(active), true);
        else if (reason === "declined") showEnded("Call declined", "", endInfo(active), true);
        else showEnded("Call ended", connectedFor != null ? formatTime(connectedFor) : "", endInfo(active));
      }
      const missedIncoming = incomingRef.current;
      if (missedIncoming?.callId === callId) {
        incomingRef.current = null;
        setIncoming(null);
        if (reason !== "answered-elsewhere" && reason !== "declined-elsewhere") {
          toast.info(`Missed call from ${missedIncoming.callerName || "someone"}.`);
          showEnded("Missed call", "", {
            name: missedIncoming.callerName || "Someone",
            photo: personFor(missedIncoming.callerId)?.photo,
          }, true);
        }
      }
    };
    const onLeft = ({ callId, userId }) => {
      if (callRef.current?.callId === callId) removePeer(userId);
    };
    const onRejected = ({ callId }) => {
      // in a one-to-one call the call:end that follows says it was declined
      if (callRef.current?.callId === callId && callRef.current.isGroup) toast.info("A participant declined the call.");
    };
    const onRinging = ({ callId }) => {
      if (callRef.current?.callId !== callId || callRef.current.connectedAt) return;
      const ringingCall = { ...callRef.current, status: "ringing" };
      callRef.current = ringingCall;
      setCall(ringingCall);
    };
    const onAccepted = ({ callId }) => {
      if (callRef.current?.callId !== callId || callRef.current.connectedAt) return;
      const connectedCall = { ...callRef.current, status: "connected", connectedAt: Date.now() };
      callRef.current = connectedCall;
      setCall(connectedCall);
    };
    const onBusy = ({ callId, userId }) => {
      const active = callRef.current;
      if (active?.callId !== callId) return;
      if (userId === currentUserIdRef.current) {
        stopCall(false);
        showEnded("You are on another call", "", endInfo(active), true);
        return;
      }
      if (active.isGroup) toast.info(`${personFor(userId)?.name || "A participant"} is on another call.`);
      // one-to-one: call:unavailable with reason "busy" follows
    };
    const onUnavailable = ({ callId, reason }) => {
      const active = callRef.current;
      if (active?.callId !== callId) return;
      stopCall(false);
      if (reason === "busy") {
        showEnded("Line busy", active.isGroup ? "Everyone is on another call" : "On another call", endInfo(active), true);
      } else {
        notifyMissed(active, active.recipients);
        showEnded(active.isGroup ? "Nobody is available" : "Unavailable", "They are offline. We let them know you called.", endInfo(active), true);
      }
    };

    socket.on("call:invite", onInvite);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("call:participant", onParticipant);
    socket.on("call:signal", onSignal);
    socket.on("call:end", onEnded);
    socket.on("call:left", onLeft);
    socket.on("call:rejected", onRejected);
    socket.on("call:ringing", onRinging);
    socket.on("call:accepted", onAccepted);
    socket.on("call:busy", onBusy);
    socket.on("call:unavailable", onUnavailable);
    return () => {
      socket.off("call:invite", onInvite);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("call:participant", onParticipant);
      socket.off("call:signal", onSignal);
      socket.off("call:end", onEnded);
      socket.off("call:left", onLeft);
      socket.off("call:rejected", onRejected);
      socket.off("call:ringing", onRinging);
      socket.off("call:accepted", onAccepted);
      socket.off("call:busy", onBusy);
      socket.off("call:unavailable", onUnavailable);
    };
  }, [flushCandidates, makePeer, notifyMissed, personFor, removePeer, showEnded, stopCall]);

  // leaving the page (sign out, closing the tab) hangs up
  useEffect(() => () => {
    clearTimeout(endTimerRef.current);
    stopCall();
  }, [stopCall]);

  useEffect(() => {
    if (call && localStreamRef.current) {
      const element = document.getElementById("local-call-stream");
      if (element) element.srcObject = localStreamRef.current;
    }
  }, [call, facingMode]);

  const remoteEntries = Object.entries(remoteStreams);
  const statusText = call
    ? call.connectedAt
      ? formatTime(elapsedSeconds)
      : `${call.status === "ringing" ? "Ringing" : call.status === "connecting" ? "Connecting" : "Calling"}… ${formatTime(elapsedSeconds)}`
    : "";
  const callName = call ? (call.isGroup || call.isCaller ? call.conversationName : call.callerName) : "";
  const incomingPerson = incoming ? personFor(incoming.callerId) : null;
  const showVideoStage = call?.isVideo && remoteEntries.length > 0;

  return (
    <>
      {showButtons && (
        <button
          type="button"
          className="rounded-xl p-3 text-indigo-300 hover:bg-[#263248] disabled:opacity-40"
          title={socketConnected ? "Voice call" : "Connecting…"}
          aria-label="Start voice call"
          disabled={busy || Boolean(call) || blocked}
          onClick={() => startCall(false)}
        >
          <MdAddIcCall size={20} />
        </button>
      )}
      {showButtons && (
        <button
          type="button"
          className="rounded-xl p-3 text-indigo-300 hover:bg-[#263248] disabled:opacity-40"
          title={socketConnected ? "Video call" : "Connecting…"}
          aria-label="Start video call"
          disabled={busy || Boolean(call) || blocked}
          onClick={() => startCall(true)}
        >
          <FaVideo size={18} />
        </button>
      )}

      {/* ---------- incoming call ---------- */}
      {incoming && (
        <div className="call-screen call-overlay" role="dialog" aria-modal="true" aria-label="Incoming call">
          <div className="call-hero">
            <p className="call-kind">{incoming.isVideo ? "Incoming video call" : "Incoming voice call"}</p>
            <div className="call-avatar is-ringing">
              <img src={getImageURL(incomingPerson?.photo)} alt="" />
            </div>
            <h2 className="call-name">{incoming.callerName}</h2>
            {incoming.conversationName && incoming.conversationName !== incoming.callerName && (
              <p className="call-sub">{incoming.conversationName}</p>
            )}
            <p className="call-status">Ringing… {formatTime(elapsedSeconds)}</p>
          </div>
          <div className="call-actions is-incoming">
            <div className="call-action">
              <button type="button" className="call-round is-end" onClick={declineCall} aria-label="Decline">
                <FiPhoneOff />
              </button>
              <span>Decline</span>
            </div>
            <div className="call-action">
              <button type="button" className="call-round is-accept" onClick={acceptCall} disabled={busy} aria-label="Accept">
                {incoming.isVideo ? <FiVideo /> : <FiPhone />}
              </button>
              <span>Accept</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------- active call ---------- */}
      {call && (
        <div className={`call-screen call-overlay ${showVideoStage ? "has-video" : ""}`} role="dialog" aria-modal="true" aria-label="Call">
          {showVideoStage && (
            <div className={`call-stage ${remoteEntries.length > 1 ? "is-grid" : ""}`}>
              {remoteEntries.map(([id, stream]) => (
                <CallVideo key={id} stream={stream} label={personFor(id)?.name || (id === conversation?._id ? conversation.name : "Participant")} />
              ))}
            </div>
          )}
          {!call.isVideo && remoteEntries.map(([id, stream]) => <RemoteAudio key={id} stream={stream} />)}

          <div className={`call-hero ${showVideoStage ? "is-compact" : ""}`}>
            <p className="call-kind">{call.isVideo ? "Video call" : "Voice call"}{call.isGroup ? ` · ${remoteEntries.length + 1} in call` : ""}</p>
            {!showVideoStage && (
              <div className={`call-avatar ${call.connectedAt ? "" : "is-ringing"}`}>
                <img src={getImageURL(call.photo)} alt="" />
              </div>
            )}
            <h2 className="call-name">{callName || "Call"}</h2>
            <p className="call-status">{statusText}</p>
            {call.connectedAt && remoteEntries.length === 0 && <p className="call-sub">Connecting audio…</p>}
          </div>

          {call.isVideo && (
            <video id="local-call-stream" className={`call-self-view ${facingMode === "user" ? "is-mirrored" : ""} ${cameraOff ? "is-off" : ""}`} autoPlay playsInline muted />
          )}

          <div className="call-actions">
            <div className="call-action">
              <button type="button" className={`call-round ${muted ? "is-on" : ""}`} aria-pressed={muted} onClick={() => toggleTrack("audio")} aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <FiMicOff /> : <FiMic />}
              </button>
              <span>{muted ? "Unmute" : "Mute"}</span>
            </div>
            {call.isVideo && (
              <div className="call-action">
                <button type="button" className={`call-round ${cameraOff ? "is-on" : ""}`} aria-pressed={cameraOff} onClick={() => toggleTrack("video")} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}>
                  {cameraOff ? <FiVideoOff /> : <FiVideo />}
                </button>
                <span>Camera</span>
              </div>
            )}
            {call.isVideo && (
              <div className="call-action">
                <button type="button" className="call-round" onClick={flipCamera} aria-label="Switch camera">
                  <FiRefreshCw />
                </button>
                <span>Flip</span>
              </div>
            )}
            <div className="call-action">
              <button type="button" className="call-round is-end" onClick={hangUp} aria-label="End call">
                <FiPhoneOff />
              </button>
              <span>End</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------- after a call: "Line busy", "No answer", "Call ended 01:23" … ---------- */}
      {ended && !call && !incoming && (
        <div className="call-screen call-overlay is-ended" role="status" onClick={() => setEnded(null)}>
          <div className="call-hero">
            <div className="call-avatar">
              <img src={getImageURL(ended.photo)} alt="" />
            </div>
            <h2 className="call-name">{ended.name || "Call"}</h2>
            <p className="call-status is-ended">{ended.title}</p>
            {ended.subtitle && <p className="call-sub">{ended.subtitle}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function CallVideo({ stream, label }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className="call-tile">
      <video ref={videoRef} autoPlay playsInline />
      <span>{label}</span>
    </div>
  );
}

function RemoteAudio({ stream }) {
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream || null;
  }, [stream]);
  return <audio ref={audioRef} autoPlay />;
}

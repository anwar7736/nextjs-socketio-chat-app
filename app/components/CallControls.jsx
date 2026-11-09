"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaVideo } from "react-icons/fa";
import { MdAddIcCall } from "react-icons/md";
import { toast } from "react-toastify";
import { socket_connection } from "../helpers/helper";

const socket = socket_connection();

export default function CallControls({ conversation, currentUser, showButtons = true }) {
  const [incoming, setIncoming] = useState(null);
  const [call, setCall] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [busy, setBusy] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const callRef = useRef(null);
  const iceServersRef = useRef([{ urls: "stun:stun.l.google.com:19302" }]);
  const currentUserIdRef = useRef(currentUser?._id);
  currentUserIdRef.current = currentUser?._id;
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const loadIceServers = useCallback(async () => {
    const response = await fetch("/api/calls/ice-servers");
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to load call network settings.");
    iceServersRef.current = result.iceServers;
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
  }, []);

  const makePeer = useCallback((peerId, callId) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
    localStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:signal", {
          callId,
          to: peerId,
          signal: { candidate: event.candidate.toJSON() },
        });
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

  const toggleTrack = (kind) => {
    const tracks = kind === "audio" ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMuted(!enabled);
    else setCameraOff(!enabled);
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
      throw new Error("Audio and video calls require a secure browser connection.");
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video });
  };

  const startCall = async (video) => {
    if (!conversation?._id || !currentUser?._id || !socket.connected || busy) return;
    setBusy(true);
    try {
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
        callerId: currentUser._id,
        callerName: currentUser.name,
        conversationName: conversation.name,
        isGroup: conversation.is_group === 1,
      };
      callRef.current = activeCall;
      setCall(activeCall);
      socket.emit("call:invite", {
        callId: activeCall.callId,
        isVideo: activeCall.isVideo,
        callerName: activeCall.callerName,
        conversationName: activeCall.conversationName,
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
      const activeCall = { ...incoming, isCaller: false };
      callRef.current = activeCall;
      setCall(activeCall);
      setIncoming(null);
      socket.emit("call:accept", { callId: incoming.callId, callerId: incoming.callerId });
    } catch (error) {
      toast.error(error.message || "Unable to join the call.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onInvite = (invite) => {
      if (callRef.current) {
        socket.emit("call:reject", { callId: invite.callId, callerId: invite.callerId });
        return;
      }
      setIncoming(invite);
    };
    const onParticipant = async ({ callId, userId }) => {
      const active = callRef.current;
      if (!active || active.callId !== callId || userId === currentUser?._id) return;
      const peer = makePeer(userId, callId);
      if (currentUser._id < userId) {
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.emit("call:signal", { callId, to: userId, signal: { description: peer.localDescription.toJSON() } });
        } catch (error) {
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
            pendingCandidatesRef.current.set(from, [
              ...(pendingCandidatesRef.current.get(from) || []),
              signal.candidate,
            ]);
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
      } catch (error) {
        toast.error("Unable to establish this call connection.");
      }
    };
    const onEnded = ({ callId, reason }) => {
      if (callRef.current?.callId === callId) {
        stopCall(false);
        if (reason === "no-answer") toast.info("No answer.");
        else if (reason === "declined") toast.info("The call was declined.");
        else toast.info("The call has ended.");
      }
      setIncoming((current) => current?.callId === callId ? null : current);
    };
    const onLeft = ({ callId, userId }) => {
      if (callRef.current?.callId === callId) removePeer(userId);
    };
    const onRejected = ({ callId }) => {
      // in a one-to-one call the call:end that follows says it was declined
      if (callRef.current?.callId === callId && callRef.current.isGroup) toast.info("A participant declined the call.");
    };
    const onUnavailable = ({ callId }) => {
      if (callRef.current?.callId !== callId) return;
      toast.info("No one is available to take the call.");
      stopCall(false);
    };

    socket.on("call:invite", onInvite);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("call:participant", onParticipant);
    socket.on("call:signal", onSignal);
    socket.on("call:end", onEnded);
    socket.on("call:left", onLeft);
    socket.on("call:rejected", onRejected);
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
      socket.off("call:unavailable", onUnavailable);
      stopCall();
    };
  }, [currentUser?._id, flushCandidates, loadIceServers, makePeer, removePeer, stopCall]);

  useEffect(() => {
    if (call && localStreamRef.current) {
      const element = document.getElementById("local-call-stream");
      if (element) element.srcObject = localStreamRef.current;
    }
  }, [call]);

  return (
    <>
      {showButtons && <button
        type="button"
        className="rounded-xl p-3 text-indigo-300 hover:bg-[#263248] disabled:opacity-50"
        title="Voice call"
        aria-label="Start voice call"
        disabled={busy || !socketConnected}
        onClick={() => startCall(false)}
      >
        <MdAddIcCall size={20} />
      </button>}
      {showButtons && <button
        type="button"
        className="rounded-xl p-3 text-indigo-300 hover:bg-[#263248] disabled:opacity-50"
        title="Video call"
        aria-label="Start video call"
        disabled={busy || !socketConnected}
        onClick={() => startCall(true)}
      >
        <FaVideo size={18} />
      </button>}

      {incoming && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#263248] bg-[#111827] p-6 text-center shadow-2xl">
            <p className="text-sm text-indigo-300">{incoming.isVideo ? "Incoming video call" : "Incoming voice call"}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{incoming.callerName}</h2>
            {incoming.conversationName && <p className="mt-1 text-sm text-[#91a0b7]">{incoming.conversationName}</p>}
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50" onClick={acceptCall} disabled={busy}>Accept</button>
              <button type="button" className="rounded-xl bg-rose-600 px-5 py-2.5 font-medium text-white hover:bg-rose-500" onClick={() => { socket.emit("call:reject", { callId: incoming.callId, callerId: incoming.callerId }); setIncoming(null); }}>Decline</button>
            </div>
          </div>
        </div>
      )}

      {call && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[#090d17] p-4 sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">{call.conversationName || conversation?.name || "Call"}</p>
              <p className="text-sm text-[#91a0b7]">{call.isVideo ? "Video call" : "Voice call"} · {Object.keys(remoteStreams).length + 1} participant(s)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={muted} className="rounded-xl bg-[#263248] px-4 py-3 font-medium text-white hover:bg-[#33415c]" onClick={() => toggleTrack("audio")}>{muted ? "Unmute" : "Mute"}</button>
              {call.isVideo && <button type="button" aria-pressed={cameraOff} className="rounded-xl bg-[#263248] px-4 py-3 font-medium text-white hover:bg-[#33415c]" onClick={() => toggleTrack("video")}>{cameraOff ? "Camera on" : "Camera off"}</button>}
              <button type="button" className="rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-500" onClick={() => stopCall()}>End call</button>
            </div>
          </div>
          {Object.keys(remoteStreams).length === 0 && <p className="mb-3 text-sm text-[#91a0b7]">{call.isCaller === false ? "Connecting…" : "Ringing…"}</p>}
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {call.isVideo && <CallVideo streamId="local-call-stream" stream={localStreamRef.current} muted label="You" />}
            {Object.entries(remoteStreams).map(([id, stream]) => (
              <CallVideo key={id} stream={stream} label={id === conversation?._id ? conversation.name : "Participant"} audioOnly={!call.isVideo} />
            ))}
            {!call.isVideo && <audio id="local-call-audio" autoPlay muted />}
          </div>
        </div>
      )}
    </>
  );
}

function CallVideo({ streamId, stream, muted = false, label, audioOnly = false }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
    if (audioRef.current) audioRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="relative grid min-h-36 place-items-center overflow-hidden rounded-2xl border border-[#263248] bg-[#111827]">
      {audioOnly ? (
        <audio ref={audioRef} autoPlay />
      ) : (
        <video id={streamId} ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      )}
      <span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-1 text-xs text-white">{label}</span>
    </div>
  );
}

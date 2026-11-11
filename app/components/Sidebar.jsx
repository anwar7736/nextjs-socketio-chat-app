import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";
import { CgProfile } from "react-icons/cg";
import { IoIosAddCircleOutline, IoMdArrowDropdown } from "react-icons/io";
import { IoPowerOutline } from "react-icons/io5";
import { IoNotificationsOutline } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { toast } from "react-toastify";
import { AuthContext } from "../contexts/AuthContext";
import { clearAuthProfile, getImageURL, socket_connection } from "../helpers/helper";
import GroupCreateModal from "./GroupCreateModal";
import ProfileModal from "./ProfileModal";
import Users from "./Users";
let socket = socket_connection();

const Sidebar = ({ search, setSearch, activeUsers, className = "" }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const sectionRef = useRef(null);
  const router = useRouter();
  const { user, setUser } = useContext(AuthContext);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [isAddGroupModalOpen, setAddGroupModalOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const toggleDropdown = () => {
    setIsDropdownOpen((open) => !open);
  };

  const logout = async () => {
    try {
      const activeSocket = socket_connection();
      if (activeSocket?.connected) {
        activeSocket.emit("user-logout"); // the server takes every tab of this user offline at once
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      // and this tab leaves for sure, so nobody keeps seeing it online until a reload
      activeSocket?.disconnect();
      clearAuthProfile();
      setUser("");
      router.push("/auth");
    } catch (error) {
      toast.error(error.message || "Unable to sign out.");
    }
  };

  const [showPushBanner, setShowPushBanner] = useState(false);
  const pushSupported = () =>
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // silent: re-register this device without asking or toasting (used on every app start once allowed)
  const enableNotifications = async ({ silent = false } = {}) => {
    setIsDropdownOpen(false);
    if (!pushSupported()) {
      if (!silent) toast.error("This browser does not support push notifications. On iPhone, add the app to the Home Screen first.");
      return;
    }
    try {
      const keyResponse = await fetch("/api/push-subscription", { cache: "no-store" });
      const keyResult = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyResult.success) {
        throw new Error(keyResult.message || "Push notifications are not configured.");
      }
      const permission = Notification.permission === "default" && !silent
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to continue.");

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyResult.publicKey),
        });
      const response = await fetch("/api/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to enable notifications.");
      setPushEnabled(true);
      setShowPushBanner(false);
      if (!silent) toast.success("Message notifications are enabled.");
    } catch (error) {
      if (!silent) toast.error(error.message || "Unable to enable notifications.");
      else console.warn("Push notifications not re-registered:", error.message);
    }
  };

  const disableNotifications = async () => {
    setIsDropdownOpen(false);
    if (!pushSupported()) {
      toast.error("This browser does not support push notifications.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushEnabled(false);
        toast.success("Message notifications are disabled on this device.");
        return;
      }

      const response = await fetch("/api/push-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to disable notifications.");
      }

      setPushEnabled(false);
      const unsubscribed = await subscription.unsubscribe();
      if (!unsubscribed) {
        throw new Error("The browser could not unsubscribe this device.");
      }
      toast.success("Message notifications are disabled on this device.");
    } catch (error) {
      toast.error(error.message || "Unable to disable notifications.");
    }
  };

  useEffect(() => {
    if (!user?._id || !pushSupported()) return;
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => {
          setPushEnabled(Boolean(subscription));
          if (subscription) enableNotifications({ silent: true });
        })
        .catch((error) => {
          console.error("Unable to check push notification status:", error);
        });
    } else if (Notification.permission === "default") {
      setPushEnabled(false);
      let dismissed = false;
      try { dismissed = window.localStorage.getItem("push-banner-dismissed") === "1"; } catch {}
      setShowPushBanner(!dismissed);
    } else {
      setPushEnabled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const dismissPushBanner = () => {
    setShowPushBanner(false);
    try { window.localStorage.setItem("push-banner-dismissed", "1"); } catch {}
  };

  const handleAddGroupModal = () => {
    setIsDropdownOpen(false);
    setAddGroupModalOpen(true);
  };

  const handleProfileModal = () => {
    setIsDropdownOpen(false);
    setProfileModalOpen(true);
  };

  const handleClickOutside = (event) => {
    if (sectionRef.current && !sectionRef.current.contains(event.target)) {
      setIsDropdownOpen(false);
    }
  };

  useEffect(() => {
    // setUser(auth());
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Cleanup event listener on unmount
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  return (
    <aside className={`chat-sidebar flex h-full flex-col ${className}`}>
      <header ref={sectionRef} className="relative flex items-center justify-between border-b border-[#263248] px-4 py-4">
        <div className="flex min-w-0 cursor-pointer items-center gap-3">
          <img
            src={getImageURL(user?.photo)}
            className="h-10 w-10 rounded-full border border-indigo-400 object-cover"
            title={user?.name}
            onClick={(e) => setIsDropdownOpen(true)}
          />
          <h1 className="truncate text-sm font-semibold text-white">
            {user?.name}
          </h1>
          <div className="ml-auto">
            <IoMdArrowDropdown
              title="More"
              className="w-5 text-[#91a0b7]"
              role="button"
              aria-label="Account menu"
              tabIndex={0}
              onClick={toggleDropdown}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleDropdown();
                }
              }}
            />
          </div>
        </div>
        {isDropdownOpen ? (
          <div
            className="dropdown-list right-4 top-16"
          >
            <ul
              className="py-1 text-sm text-gray-200"
              aria-labelledby="dropdownDefaultButton"
            >
              <li>
                <button
                  onClick={pushEnabled ? disableNotifications : () => enableNotifications()}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-[#263248]"
                >
                  <IoNotificationsOutline className="mr-2 text-indigo-300" />
                  {pushEnabled ? "Disable notifications" : "Enable notifications"}
                </button>
              </li>
              <li>
                <button
                  onClick={handleAddGroupModal}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-[#263248]"
                >
                  <IoIosAddCircleOutline className="mr-2 text-indigo-300" />
                  Add Group
                </button>
              </li>
              <li>
                <button
                  onClick={handleProfileModal}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-[#263248]"
                >
                  <CgProfile className="mr-2 text-indigo-300" />
                  Profile
                </button>
              </li>
              <li>
                <button
                  onClick={() => logout()}
                  className="flex w-full items-center px-4 py-3 text-left text-rose-300 hover:bg-[#263248]"
                >
                  <IoPowerOutline className="mr-2" />
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {showPushBanner && (
          <div className="push-banner mb-4" role="status">
            <IoNotificationsOutline className="mt-0.5 shrink-0 text-lg text-indigo-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Get message notifications</p>
              <p className="mt-0.5 text-xs text-[#91a0b7]">See new messages on this device even when the app is closed.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400" onClick={() => enableNotifications()}>
                  Turn on
                </button>
                <button type="button" className="rounded-lg px-3 py-1.5 text-xs text-[#91a0b7] hover:bg-[#263248]" onClick={dismissPushBanner}>
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-between">
          <input
            type="text"
            className="form-control mb-5"
            placeholder="Search conversations"
            aria-label="Search conversations"
            onChange={(e) => setSearch(e.target.value)}
            value={search}
          />
          <button className="w-50 hidden" title="Create group">
            <MdAdd></MdAdd>
          </button>
        </div>
        <Users activeUsers={activeUsers} />
      </div>
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
      <GroupCreateModal
        isOpen={isAddGroupModalOpen}
        onClose={() => setAddGroupModalOpen(false)}
      />
    </aside>
  );
};

function decodeVapidKey(base64Key) {
  const padding = "=".repeat((4 - base64Key.length % 4) % 4);
  const base64 = (base64Key + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default Sidebar;

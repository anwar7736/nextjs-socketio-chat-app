
import { useContext, useRef } from 'react';
import { UserContext } from '../contexts/UserContext';
import { MessageContext } from '../contexts/MessageContext';
import { activityFormat, getImageURL, loadMessages } from '../helpers/helper';
import { UserListContext } from '../contexts/UserListContext';
import { toast } from 'react-toastify';

const Users = ({ activeUsers, isLoading, setConversationLoading }) => {
  const { user, setUser } = useContext(UserContext)
  const { users, setUsers } = useContext(UserListContext)
  const {messages, setMessages} = useContext(MessageContext);
  const requestIdRef = useRef(0);

  const getMessages = async (data) => {
      if (data?._id === user?._id) return;
      const requestId = ++requestIdRef.current;
      setConversationLoading(true);
      setMessages([]);
      setUser(data);
      setUsers((current) => current.map((item) =>
        item?._id === data?._id ? { ...item, pending: 0 } : item
      ));
      try {
        const result = await loadMessages(data);
        if (!Array.isArray(result)) throw new Error("Unable to load messages.");
        if (requestId === requestIdRef.current) setMessages(result);
      } catch (error) {
        if (requestId === requestIdRef.current) {
          toast.error(error.message || "Unable to load messages.");
        }
      } finally {
        if (requestId === requestIdRef.current) setConversationLoading(false);
      }
  }
  
  return (
    <div>
      {isLoading ? (
        <div className="conversation-list-skeleton" role="status" aria-label="Loading conversations">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="conversation-skeleton-row" key={index}>
              <span className="skeleton-shimmer conversation-skeleton-avatar" />
              <span className="conversation-skeleton-copy">
                <span className="skeleton-shimmer conversation-skeleton-name" />
                <span className="skeleton-shimmer conversation-skeleton-preview" />
              </span>
            </div>
          ))}
          <span className="sr-only">Loading conversations...</span>
        </div>
      ) : (
        users.length > 0 ? users.map(u => {
          return  (<button type="button" key={u?._id} className={`${u?._id == user?._id ? 'bg-[#222f46]' : ''} mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#1b273b]`} onClick={() => getMessages(u)} >
          <div className="h-11 w-11 shrink-0 rounded-full bg-[#263248]" >
              <img src={getImageURL(u?.photo)} alt="" className="h-11 w-11 rounded-full border border-[#394761] object-cover" title={u?.name}/>
          </div>
          <div className="min-w-0 flex-1">
              <div className="flex">
                  <div className="flex min-w-0 flex-1 items-center font-semibold">
                  <span className="truncate text-sm text-[#e8edf7]">{u?.nickname || u?.name}</span>

                      {
                        activeUsers.includes(u?._id) && (<sup className="ml-2 h-2 w-2 rounded-full bg-emerald-400" aria-label="Online" />)
                      }
                      {
                          u?.pending > 0 && 
                          (<span className="ml-auto rounded-full bg-indigo-500 px-2 py-0.5 text-xs text-white">{u?.pending}</span>)
                      }
                  </div>
              </div>
              {u?.is_group !== 1 && (
                <p className="mt-1 truncate text-xs text-[#91a0b7]">
                      {activeUsers.includes(u?._id) ? "Active now" : activityFormat(u?.lastSeenAt)}
                </p>
              )}
          </div>
      </button>)
        }) : (<small className="text-sm text-[#91a0b7]">No conversations found.</small>)
      )}
    </div>
  ) 
}

export default Users
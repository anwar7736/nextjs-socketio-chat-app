
import { useContext, useEffect, useState } from 'react';
import { UserContext } from '../contexts/UserContext';
import { MessageContext } from '../contexts/MessageContext';
import { auth, getImageURL, loadMessages } from '../helpers/helper';
import { UserListContext } from '../contexts/UserListContext';
const Users = ({ activeUsers }) => {
  const { user, setUser } = useContext(UserContext)
  const { users, setUsers } = useContext(UserListContext)
  const {messages, setMessages} = useContext(MessageContext);
  const getMessages = async (data) => {
      setMessages([]);
      setUser([]);
      setUser(data);
      const index = users.findIndex(u => u?._id == data?._id);
      users[index].pending = 0;
      let res = await loadMessages(data);
      setMessages(res);
      
  }
  
  return (
    <div>
      {
        users.length > 0 ? users?.map(u => {
          return  (<button type="button" key={u?._id} className={`${u?._id == user?._id ? 'bg-[#222f46]' : ''} mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#1b273b]`} onClick={() => getMessages(u)} >
          <div className="h-11 w-11 shrink-0 rounded-full bg-[#263248]" >
              <img src={getImageURL(u?.photo)} alt="" className="h-11 w-11 rounded-full border border-[#394761] object-cover" title={u?.name}/>
          </div>
          <div className="flex-1">
              <div className="flex">
                  <div className="flex min-w-0 items-center font-semibold">
                  <span className="truncate text-sm text-[#e8edf7]">{u?.name}</span>

                      {
                        activeUsers.includes(u?._id) && (<sup className="ml-2 h-2 w-2 rounded-full bg-emerald-400" aria-label="Online" />)
                      }
                      {
                          u?.pending > 0 && 
                          (<span className="ml-auto rounded-full bg-indigo-500 px-2 py-0.5 text-xs text-white">{u?.pending}</span>)
                      }
                  </div>
              </div>
              {/* <p className="text-gray-600 text-xs">{user?.message}</p> */}
          </div>
      </button>)
        })
        :  (<small className="text-sm text-[#91a0b7]">No conversations found.</small>)
      }
    </div>
  ) 
}

export default Users
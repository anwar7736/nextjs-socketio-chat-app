
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
          return  (<div key={u?._id} className={`${u?._id == user?._id ? 'bg-gray-300' : ''} flex items-center mb-4 cursor-pointer hover:bg-gray-300 p-2 rounded-md`} onClick={() => getMessages(u)} >
          <div className="w-12 h-12 bg-gray-300 rounded-full mr-" >
              <img src={getImageURL(u?.photo)} alt="User Avatar" className="w-12 h-12 rounded-full border-2 border-red-400" title={u?.name}/>
          </div>
          <div className="flex-1">
              <div className="flex">
                  <div className="font-semibold cursor-pointer">
                  <span className="ml-1 text-xs flex items-center justify-center">{u?.name}</span>

                      {
                        activeUsers.includes(u?._id) && (<sup className="p-1 bg-green-500 ml-1 rounded" style={{ fontSize: "0px", marginBottom:"10px" }}></sup>)
                      }
                      {
                          u?.pending > 0 && 
                          (<span className="px-1 bg-red-600 ml-1 rounded text-white text-xs">{u?.pending}</span>)
                      }
                  </div>
              </div>
              {/* <p className="text-gray-600 text-xs">{user?.message}</p> */}
          </div>
      </div>)
        })
        :  (<small className="text-red-600 text-sm">No User Found!</small>)
      }
    </div>
  ) 
}

export default Users
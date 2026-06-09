import { io } from "socket.io-client";

let socket = null;

/**
 * Establish connection to the Socket.io server
 * @param {string} token - Signed JWT access token
 * @returns {object} - Socket.io socket instance
 */
export const connectSocket = (token) => {
  // Prevent duplicate connections with the same token
  if (socket) {
    if (socket.connected && socket.auth?.token === token) {
      return socket;
    }
    // If token has changed or is disconnected, clean up before reconnecting
    disconnectSocket();
  }

  const socketUrl = import.meta.env.VITE_SOCKET_URL || 
    (import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL.replace("/api/v1", "") 
      : "http://localhost:5000");

  socket = io(socketUrl, {
    auth: {
      token
    },
    autoConnect: true,
    reconnection: true
  });

  return socket;
};

/**
 * Disconnect socket and clean up all listeners
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

/**
 * Retrieve the current socket instance
 * @returns {object|null}
 */
export const getSocket = () => {
  return socket;
};

/**
 * Helper to check connection status directly
 * @returns {boolean}
 */
export const isSocketConnected = () => {
  return socket ? socket.connected : false;
};

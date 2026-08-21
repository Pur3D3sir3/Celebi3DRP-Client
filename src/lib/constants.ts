import { SocketContextType } from "./types";
import { createContext, useContext } from "react";
export const SocketContext = createContext<SocketContextType>({
  characters: [],
  socket: null as any, // This will be overridden by provider
  sceneItems: [],
  isSceneReady: false,
});
export const useSocket = () => useContext(SocketContext);
import React, { useEffect, useState, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Character, SocketProviderProps, SceneItem } from "../lib/types";
import { SocketContext } from "../lib/constants";

interface ExtendedSocketProviderProps extends SocketProviderProps {
  token: string;
  onSceneChange: (newScene: number) => void;
}

let socketInstance: Socket | null = null;

export const SocketProvider: React.FC<ExtendedSocketProviderProps> = ({ children, token, onSceneChange }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [sceneItems, setSceneItems] = useState<SceneItem[]>([]);
  const [isSceneReady, setIsSceneReady] = useState(false);

  const socket = useMemo(() => {
    if (!socketInstance) {
      console.log("Creating new singleton socket instance");
      socketInstance = io("http://localhost:3001", {
        auth: { token },
        autoConnect: false,
        reconnection: false,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ["websocket"],
      });
    }
    return socketInstance;
  }, [token]);

  useEffect(() => {
    console.log("SocketProvider mounted - connecting with token:", token ? "present" : "missing");

    const handleCharactersUpdate = (newCharacters: Character[]) => {
      console.log("Received characters update:", newCharacters);
      setCharacters(newCharacters);
    };

    const handleSceneItems = (items: SceneItem[]) => {
      console.log("Received scene items:", items);
      setSceneItems(items);
    };

    const handleAddSceneItem = (item: SceneItem) => {
      setSceneItems(prev => [...prev, item]);
    };

    const handleUpdateSceneItem = (updates: Partial<SceneItem> & { instance_id: number }) => {
      setSceneItems(prev => prev.map(i => i.instance_id === updates.instance_id ? { ...i, ...updates } : i));
    };

    const handleRemoveItem = (data: { instance_id: number }) => {
      setSceneItems((prev) => prev.filter((i) => i.instance_id !== data.instance_id));
    };

    const handleSceneReady = () => {
      console.log("Received scene_ready");
      setIsSceneReady(true);
    };

    socket.on("connect", () => {
      console.log("Socket connected successfully (id:", socket.id, ")");
    });
    socket.on("connect_error", (err) => {
      console.log("Socket connect_error:", err.message, err);
    });
    socket.on("error", (err) => console.log("Socket error:", err));
    socket.on("disconnect", (reason) => console.log("Socket disconnected:", reason));
    socket.on("characters", handleCharactersUpdate);
    socket.on("scene_items", handleSceneItems);
    socket.on("add_scene_item", handleAddSceneItem);
    socket.on("update_scene_item", handleUpdateSceneItem);
    socket.on("remove_item", handleRemoveItem);
    socket.on("scene_ready", handleSceneReady);
    socket.on("scene_change", (data: { scene: number }) => {
      console.log("Received scene_change:", data);
      setIsSceneReady(false);
      setSceneItems([]);
      onSceneChange(data.scene);
    });

    socket.connect();

    return () => {
      console.log("SocketProvider unmounting - cleaning up listeners and disconnecting");
      socket.off("connect");
      socket.off("connect_error");
      socket.off("error");
      socket.off("disconnect");
      socket.off("characters", handleCharactersUpdate);
      socket.off("scene_items", handleSceneItems);
      socket.off("add_scene_item", handleAddSceneItem);
      socket.off("update_scene_item", handleUpdateSceneItem);
      socket.off("remove_item", handleRemoveItem);
      socket.off("scene_ready", handleSceneReady);
      socket.off("scene_change");
      socket.disconnect();
    };
  }, [socket, onSceneChange]);

  return (
    <SocketContext.Provider value={{ characters, socket, sceneItems, isSceneReady }}>
      {children}
    </SocketContext.Provider>
  );
};
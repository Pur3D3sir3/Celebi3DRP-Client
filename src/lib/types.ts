import { ReactNode } from "react";
import * as THREE from "three";
import { Socket } from "socket.io-client";
export interface Character {
  dogColor: string;
  id: string;
  position: [number, number, number];
  model: string;
  user_id?: number; // Optional, for server-side
  scene: number; // Added for multi-scene
}
export type DogProps = {
  dogColor?: string;
  position: THREE.Vector3;
};
export interface SceneItem {
  instance_id: number;
  name: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  rotation_y: number;
  scale: number;
  width: number;
  height: number;
  is_walkable: boolean;
  is_interactable: boolean;
  interaction_type: string | null;
  state: string | null;
}
export interface SocketContextType {
  characters: Character[];
  socket: Socket;
  sceneItems: SceneItem[];
  isSceneReady: boolean;
}
export interface SocketProviderProps {
  children: ReactNode;
}
import { ReactNode } from "react";
import * as THREE from "three";
import { Socket } from "socket.io-client";

export interface Character {
    dogColor: string;
    id: string;
    position: [number, number, number];
    model: string;
    user_id?: number;
    scene: number;
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

export interface SceneConfig {
    id: number;
    name: string;
    description?: string | null;
    floor_color: string;
    plane_width: number;
    plane_depth: number;
    has_sky: boolean;
    fog_color?: string | null;
    fog_density?: number | null;
    spawn_x: number;
    spawn_y: number;
    spawn_z: number;
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
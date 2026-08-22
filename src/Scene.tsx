import { Environment, useGLTF, Sky, Stars, Cloud } from "@react-three/drei";
import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Player } from "./components/Player";
import { ItemInstance } from "./components/ItemInstance";
import { NeighborScene } from "./components/NeighborScene";
import { useSocket } from "./lib/constants";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Character, SceneItem, SceneConfig } from "./lib/types";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { OrbitControls } from "@react-three/drei";
import { useDayNight } from "./lib/useDayNight";
import { useAmbientAudio } from "./lib/useAmbientAudio";
import axios from "axios";

interface SceneProps {
    currentScene: number;
    setContextMenu: (menu: any) => void;
    userRank: string;
    editMode: boolean;
    selectedItemId: number | null;
    setSelectedItemId: (id: number | null) => void;
    placingItem: { item_id: number; name: string } | null;
    setPlacingItem: (item: { item_id: number; name: string } | null) => void;
    transformControlsRef: React.RefObject<TransformControls>;
    runEnabled?: boolean;
    onMovingChange?: (moving: boolean) => void;
}

useGLTF.preload("/meshy/idle.glb");
useGLTF.preload("/meshy/walk.glb");
useGLTF.preload("/meshy/pickup.glb");
useGLTF.preload("/meshy/run.glb");
useGLTF.preload("/meshy/male1.glb");
useGLTF.preload("/meshy/male2.glb");
useGLTF.preload("/meshy/male2idle.glb");
useGLTF.preload("/meshy/male2walk.glb");
useGLTF.preload("/meshy/male2run.glb");
useGLTF.preload("/meshy/male2pickup.glb");
useGLTF.preload("/items/soda_can.glb");
useGLTF.preload("/items/cobblestone_path.glb");
useGLTF.preload("/items/stone_path.glb");
useGLTF.preload("/items/water_well.glb");
useGLTF.preload("/items/mini_well.glb");
useGLTF.preload("/items/winter_cabin.glb");
useGLTF.preload("/items/whimsical_tree.glb");
useGLTF.preload("/items/enchanted_grove.glb");
useGLTF.preload("/items/cobblestone_path2.glb");
useGLTF.preload("/items/ancient_boulder.glb");
useGLTF.preload("/items/cave_entrance.glb");
useGLTF.preload("/items/grass.glb");
useGLTF.preload("/items/rock.glb");

type ClickMarker = {
    id: number;
    x: number;
    z: number;
    born: number;
};

type TeleportLink = {
    from_scene: number;
    from_x: number;
    from_y?: number;
    from_z: number;
    to_scene: number;
    to_x: number;
    to_y?: number;
    to_z: number;
    radius?: number;
};

type NeighborData = {
    sceneId: number;
    offset: [number, number, number];
    items: SceneItem[];
    floorColor: string;
    planeSize: [number, number];
};

const FALLBACK_TELEPORTS: TeleportLink[] = [
    { from_scene: 1, from_x: 15, from_z: 0, to_scene: 2, to_x: -15, to_z: 0, radius: 2 },
    { from_scene: 2, from_x: -15, from_z: 0, to_scene: 1, to_x: 15, to_z: 0, radius: 2 },
];

const NEIGHBOR_GAP = 5;

function getFallbackFloorColor(sceneId: number): string {
    switch (sceneId) {
        case 1:
            return "#70543E";
        case 2:
            return "#4A4A4A";
        default:
            return "#70543E";
    }
}

function computeNeighborOffset(link: TeleportLink): [number, number, number] {
    const dx = link.from_x - link.to_x;
    const dy = (link.from_y || 0) - (link.to_y || 0);
    const dz = link.from_z - link.to_z;
    const len = Math.hypot(dx, dz) || 1;
    const gapX = (dx / len) * NEIGHBOR_GAP;
    const gapZ = (dz / len) * NEIGHBOR_GAP;
    return [dx + gapX, dy, dz + gapZ];
}

export const Scene = forwardRef<
    {
        handleWalk: (point: { x: number; y: number; z: number }) => void;
        handleInteract: (item: SceneItem) => void;
        handleExamine: (item: SceneItem) => void;
        getAzimuth: () => number;
        getLocalPos: () => THREE.Vector3;
    },
    SceneProps
>(
    (
        {
            currentScene,
            setContextMenu,
            userRank,
            editMode,
            selectedItemId,
            setSelectedItemId,
            placingItem,
            setPlacingItem,
            transformControlsRef,
            runEnabled = false,
            onMovingChange,
        },
        ref
    ) => {
        const { characters, socket, sceneItems } = useSocket();
        const [localPath, setLocalPath] = useState<[number, number, number][]>([]);
        const [pendingInteraction, setPendingInteraction] = useState<{
            type: string;
            instance_id: number;
            position: [number, number, number];
        } | null>(null);
        const [speeches, setSpeeches] = useState<{ [key: string]: { text: string; time: number } }>({});
        const [clickMarkers, setClickMarkers] = useState<ClickMarker[]>([]);
        const markerIdRef = useRef(0);

        const [teleports, setTeleports] = useState<TeleportLink[]>(FALLBACK_TELEPORTS);
        const [neighbors, setNeighbors] = useState<NeighborData[]>([]);
        const [neighborOpacity, setNeighborOpacity] = useState(1);
        const neighborOpacityTarget = useRef(1);

        const [sceneConfig, setSceneConfig] = useState<{
            planeSize: [number, number];
            floorColor: string;
            hasSky: boolean;
            name: string;
        }>({
            planeSize: [30, 30],
            floorColor: "#70543E",
            hasSky: true,
            name: "Scene",
        });

        const itemsGroup = useRef<THREE.Group>(null!);
        const orbitControls = useRef<any>(null!);
        const { scene, gl, camera } = useThree();

        const azimuth = useRef(2.5);
        const elevation = useRef(0.3);
        const distance = useRef(12);
        const targetDistance = useRef(12);

        const keys = useRef({ a: false, d: false, w: false, s: false }).current;
        const localPlayer = useMemo(
            () => characters.find((c) => c.id === socket.id),
            [characters, socket.id]
        );
        const localPosRef = useRef(new THREE.Vector3(0, 0, 0));
        const cellSize = 0.5;
        const maxInteractDist = 1.5;
        const { sunElevation, isDay } = useDayNight();
        const hasSky = sceneConfig.hasSky;
        useAmbientAudio({ hasSky });

        const idleGltf = useGLTF("/meshy/idle.glb");
        const walkGltf = useGLTF("/meshy/walk.glb");
        const pickupGltf = useGLTF("/meshy/pickup.glb");
        const runGltf = useGLTF("/meshy/run.glb");

        const male2IdleGltf = useGLTF("/meshy/male2idle.glb");
        const male2WalkGltf = useGLTF("/meshy/male2walk.glb");
        const male2RunGltf = useGLTF("/meshy/male2run.glb");
        const male2PickupGltf = useGLTF("/meshy/male2pickup.glb");

        const getAnim = (gltf: any, preferredNames: string[] = []) => {
            if (!gltf?.animations?.length) return null;

            for (const name of preferredNames) {
                const found = gltf.animations.find((clip: THREE.AnimationClip) =>
                    clip.name.toLowerCase().includes(name.toLowerCase())
                );
                if (found) return found;
            }

            const sorted = [...gltf.animations].sort((a, b) => b.duration - a.duration);
            return sorted[0] || gltf.animations[0] || null;
        };

        const male1Clips = useMemo(
            () => ({
                idle: getAnim(idleGltf, ["idle", "stand"]),
                walkforward: getAnim(walkGltf, ["walk", "forward"]),
                pickup: getAnim(pickupGltf, ["pickup", "pick"]),
                run: getAnim(runGltf, ["run", "sprint", "jog", "running"]),
            }),
            [idleGltf, walkGltf, pickupGltf, runGltf]
        );

        const male2Clips = useMemo(
            () => ({
                idle: getAnim(male2IdleGltf, ["idle", "stand"]),
                walkforward: getAnim(male2WalkGltf, ["walk", "forward"]),
                pickup: getAnim(male2PickupGltf, ["pickup", "pick"]),
                run: getAnim(male2RunGltf, ["run", "sprint", "jog", "running"]),
            }),
            [male2IdleGltf, male2WalkGltf, male2RunGltf, male2PickupGltf]
        );

        useEffect(() => {
            setLocalPath([]);
            setPendingInteraction(null);
            setClickMarkers([]);
            neighborOpacityTarget.current = 0;
        }, [currentScene]);

        useEffect(() => {
            if (localPlayer?.position) {
                localPosRef.current.set(...localPlayer.position);
            }
        }, [localPlayer]);

        useEffect(() => {
            let cancelled = false;

            const loadSceneConfig = async () => {
                try {
                    const res = await axios.get(`/scene/${currentScene}`);
                    if (!cancelled && res.data?.scene) {
                        const s = res.data.scene as SceneConfig;
                        setSceneConfig({
                            planeSize: [s.plane_width || 30, s.plane_depth || 30],
                            floorColor: s.floor_color || "#70543E",
                            hasSky: !!s.has_sky,
                            name: s.name || `Scene ${currentScene}`,
                        });
                        return;
                    }
                } catch {
                }
                if (!cancelled) {
                    setSceneConfig({
                        planeSize: [30, 30],
                        floorColor: getFallbackFloorColor(currentScene),
                        hasSky: true,
                        name: `Scene ${currentScene}`,
                    });
                }
            };

            loadSceneConfig();
            return () => {
                cancelled = true;
            };
        }, [currentScene]);

        useEffect(() => {
            let cancelled = false;

            const loadTeleports = async () => {
                try {
                    const res = await axios.get(`/scene/${currentScene}/teleports`);
                    if (!cancelled && Array.isArray(res.data?.teleports) && res.data.teleports.length > 0) {
                        setTeleports(res.data.teleports);
                        return;
                    }
                } catch {
                }
                if (!cancelled) {
                    setTeleports(FALLBACK_TELEPORTS);
                }
            };

            loadTeleports();
            return () => {
                cancelled = true;
            };
        }, [currentScene]);

        useEffect(() => {
            let cancelled = false;

            const loadNeighbors = async () => {
                const links = teleports.filter((t) => t.from_scene === currentScene);
                if (links.length === 0) {
                    if (!cancelled) {
                        setNeighbors([]);
                        neighborOpacityTarget.current = 1;
                    }
                    return;
                }

                const seen = new Set<number>();
                const results: NeighborData[] = [];

                await Promise.all(
                    links.map(async (link) => {
                        if (seen.has(link.to_scene)) return;
                        seen.add(link.to_scene);

                        const offset = computeNeighborOffset(link);

                        try {
                            const [itemsRes, sceneRes] = await Promise.all([
                                axios.get(`/scene/${link.to_scene}/items`),
                                axios.get(`/scene/${link.to_scene}`),
                            ]);

                            const items: SceneItem[] = (itemsRes.data?.items || []).map((row: any) => ({
                                instance_id: row.instance_id,
                                name: row.name,
                                pos_x: row.pos_x,
                                pos_y: row.pos_y || 0,
                                pos_z: row.pos_z,
                                rotation_y: row.rotation_y || 0,
                                scale: row.scale || 1,
                                width: row.width || 1,
                                height: row.height || 1,
                                is_walkable: !!row.is_walkable,
                                is_interactable: false,
                                interaction_type: null,
                                state: row.state || null,
                            }));

                            const s = sceneRes.data?.scene;
                            results.push({
                                sceneId: link.to_scene,
                                offset,
                                items,
                                floorColor: s?.floor_color || getFallbackFloorColor(link.to_scene),
                                planeSize: [s?.plane_width || 30, s?.plane_depth || 30],
                            });
                        } catch (err) {
                            console.error("Failed to load neighbor scene", link.to_scene, err);
                            results.push({
                                sceneId: link.to_scene,
                                offset,
                                items: [],
                                floorColor: getFallbackFloorColor(link.to_scene),
                                planeSize: [30, 30],
                            });
                        }
                    })
                );

                if (!cancelled) {
                    setNeighbors(results);
                    neighborOpacityTarget.current = 1;
                }
            };

            loadNeighbors();
            return () => {
                cancelled = true;
            };
        }, [currentScene, teleports]);

        const spawnClickMarker = (x: number, z: number) => {
            const id = ++markerIdRef.current;
            setClickMarkers((prev) => [...prev, { id, x, z, born: performance.now() }]);
        };

        const halfExtent = sceneConfig.planeSize[0] / 2;
        const gridCols = Math.ceil(sceneConfig.planeSize[0] / cellSize);
        const gridRows = Math.ceil(sceneConfig.planeSize[1] / cellSize);
        const [grid, setGrid] = useState<boolean[][]>([]);

        useEffect(() => {
            const newGrid = Array.from({ length: gridCols }, () => Array(gridRows).fill(false));
            sceneItems.forEach((item: any) => {
                if (item.is_walkable) return;
                const scale = item.scale || 1;
                const w = item.width * scale;
                const h = item.height * scale;
                const centerX = item.pos_x;
                const centerZ = item.pos_z;
                const rotation = item.rotation_y || 0;
                const cos = Math.cos(rotation);
                const sin = Math.sin(rotation);
                const halfW = w / 2;
                const halfH = h / 2;
                const offsets: [number, number][] = [
                    [-halfW, -halfH],
                    [halfW, -halfH],
                    [halfW, halfH],
                    [-halfW, halfH],
                ];
                const rotated = offsets.map(([ox, oz]) => ({
                    x: centerX + ox * cos - oz * sin,
                    z: centerZ + ox * sin + oz * cos,
                }));
                const minX = Math.min(...rotated.map((p) => p.x));
                const maxX = Math.max(...rotated.map((p) => p.x));
                const minZ = Math.min(...rotated.map((p) => p.z));
                const maxZ = Math.max(...rotated.map((p) => p.z));
                const minCol = Math.max(0, Math.floor((minX + halfExtent) / cellSize));
                const maxCol = Math.min(gridCols - 1, Math.floor((maxX + halfExtent) / cellSize));
                const minRow = Math.max(0, Math.floor((minZ + halfExtent) / cellSize));
                const maxRow = Math.min(gridRows - 1, Math.floor((maxZ + halfExtent) / cellSize));
                for (let col = minCol; col <= maxCol; col++) {
                    for (let row = minRow; row <= maxRow; row++) {
                        newGrid[col][row] = true;
                    }
                }
            });
            setGrid(newGrid);
        }, [sceneItems, currentScene, cellSize, gridCols, gridRows, halfExtent]);

        const worldToGrid = (x: number, z: number): [number, number] | null => {
            const col = Math.floor((x + halfExtent) / cellSize);
            const row = Math.floor((z + halfExtent) / cellSize);
            if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;
            return [col, row];
        };

        const gridToWorld = (col: number, row: number): [number, number] => {
            return [
                col * cellSize - halfExtent + cellSize / 2,
                row * cellSize - halfExtent + cellSize / 2,
            ];
        };

        const findNearestWalkable = (goalGrid: [number, number]): [number, number] | null => {
            if (!grid[goalGrid[0]][goalGrid[1]]) return goalGrid;
            const queue: [number, number][] = [goalGrid];
            const visited = new Set<string>();
            while (queue.length) {
                const [c, r] = queue.shift()!;
                const key = `${c},${r}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (c >= 0 && c < gridCols && r >= 0 && r < gridRows && !grid[c][r]) {
                    return [c, r];
                }
                for (let dc = -1; dc <= 1; dc++) {
                    for (let dr = -1; dr <= 1; dr++) {
                        if (dc === 0 && dr === 0) continue;
                        queue.push([c + dc, r + dr]);
                    }
                }
            }
            return null;
        };

        const heuristic = (a: [number, number], b: [number, number]) => {
            const dx = Math.abs(a[0] - b[0]);
            const dz = Math.abs(a[1] - b[1]);
            return Math.sqrt(dx * dx + dz * dz);
        };

        const findPath = (
            startPos: [number, number, number],
            goalPos: [number, number, number]
        ): [number, number, number][] => {
            const startGrid = worldToGrid(startPos[0], startPos[2]);
            let goalGrid = worldToGrid(goalPos[0], goalPos[2]);
            if (!startGrid || !goalGrid) return [];
            if (startGrid[0] === goalGrid[0] && startGrid[1] === goalGrid[1]) {
                const dist = Math.hypot(startPos[0] - goalPos[0], startPos[2] - goalPos[2]);
                if (dist < 0.12) return [];
                return [[goalPos[0], 0, goalPos[2]]];
            }
            goalGrid = findNearestWalkable(goalGrid);
            if (!goalGrid || grid[startGrid[0]][startGrid[1]]) return [];
            interface Node {
                col: number;
                row: number;
                g: number;
                h: number;
                f: number;
                parent: Node | null;
            }
            const open: Node[] = [];
            const closed = new Set<string>();
            const startNode: Node = {
                col: startGrid[0],
                row: startGrid[1],
                g: 0,
                h: heuristic(startGrid, goalGrid),
                f: 0,
                parent: null,
            };
            startNode.f = startNode.g + startNode.h;
            open.push(startNode);
            while (open.length) {
                open.sort((a, b) => a.f - b.f);
                const current = open.shift()!;
                const key = `${current.col},${current.row}`;
                if (closed.has(key)) continue;
                closed.add(key);
                if (current.col === goalGrid[0] && current.row === goalGrid[1]) {
                    const path: [number, number, number][] = [];
                    let curr: Node | null = current;
                    while (curr) {
                        const [x, z] = gridToWorld(curr.col, curr.row);
                        path.push([x, 0, z]);
                        curr = curr.parent;
                    }
                    path.reverse();
                    return path;
                }
                for (let dc = -1; dc <= 1; dc++) {
                    for (let dr = -1; dr <= 1; dr++) {
                        if (dc === 0 && dr === 0) continue;
                        const nc = current.col + dc;
                        const nr = current.row + dr;
                        if (nc < 0 || nc >= gridCols || nr < 0 || nr >= gridRows || grid[nc][nr]) continue;
                        const nkey = `${nc},${nr}`;
                        if (closed.has(nkey)) continue;
                        const cost = Math.hypot(dc, dr);
                        const g = current.g + cost;
                        const idx = open.findIndex((o) => o.col === nc && o.row === nr);
                        if (idx !== -1 && g >= open[idx].g) continue;
                        const newNode: Node = {
                            col: nc,
                            row: nr,
                            g,
                            h: heuristic([nc, nr], goalGrid),
                            f: 0,
                            parent: current,
                        };
                        newNode.f = newNode.g + newNode.h;
                        if (idx !== -1) {
                            open[idx] = newNode;
                        } else {
                            open.push(newNode);
                        }
                    }
                }
            }
            return [];
        };

        const lineIntersectsBlocked = (startX: number, startZ: number, endX: number, endZ: number) => {
            const dx = endX - startX;
            const dz = endZ - startZ;
            const length = Math.hypot(dx, dz);
            if (length === 0) return false;
            const stepSize = cellSize / 2;
            const numSteps = Math.ceil(length / stepSize);
            for (let i = 1; i < numSteps; i++) {
                const t = i / numSteps;
                const px = startX + dx * t;
                const pz = startZ + dz * t;
                const g = worldToGrid(px, pz);
                if (g && grid[g[0]][g[1]]) return true;
            }
            return false;
        };

        const smoothPath = (path: [number, number, number][]) => {
            if (path.length < 3) return path;
            const smoothed: [number, number, number][] = [path[0]];
            let lastIndex = 0;
            for (let i = 2; i < path.length; i++) {
                const from = path[lastIndex];
                const to = path[i];
                if (lineIntersectsBlocked(from[0], from[2], to[0], to[2])) {
                    smoothed.push(path[i - 1]);
                    lastIndex = i - 1;
                }
            }
            smoothed.push(path[path.length - 1]);
            return smoothed;
        };

        const handlePlaneClick = (e: { point: { x: number; z: number } }) => {
            if (placingItem) {
                const target = [e.point.x, 0, e.point.z] as [number, number, number];
                socket.emit(
                    "admin_place_item",
                    {
                        item_id: placingItem.item_id,
                        pos_x: target[0],
                        pos_y: 0,
                        pos_z: target[2],
                        rotation_y: 0,
                        scale: 1,
                        scene_id: currentScene,
                    },
                    (response: any) => {
                        if (response.status === "ok") {
                            setSelectedItemId(response.instance_id);
                            setPlacingItem(null);
                        }
                    }
                );
                return;
            }

            if (editMode) {
                return;
            }

            const target = [e.point.x, 0, e.point.z] as [number, number, number];
            let path = findPath(localPosRef.current.toArray() as [number, number, number], target);
            if (path.length > 0) {
                path = smoothPath(path);
                setLocalPath(path);
                setPendingInteraction(null);
                spawnClickMarker(target[0], target[2]);
            }
        };

        const handleItemClick = (item: SceneItem, e: any) => {
            if (e?.stopPropagation) {
                e.stopPropagation();
            }

            if (editMode) {
                setSelectedItemId(item.instance_id);
                return;
            }

            const target = [item.pos_x, 0, item.pos_z] as [number, number, number];
            let path = findPath(localPosRef.current.toArray() as [number, number, number], target);
            setPendingInteraction({
                type: item.interaction_type,
                instance_id: item.instance_id,
                position: target,
            });
            if (path.length > 0) {
                path = smoothPath(path);
                setLocalPath(path);
                spawnClickMarker(target[0], target[2]);
            }
        };

        useImperativeHandle(ref, () => ({
            handleWalk: (point) => {
                const target = [point.x, 0, point.z] as [number, number, number];
                let path = findPath(localPosRef.current.toArray() as [number, number, number], target);
                if (path.length > 0) {
                    path = smoothPath(path);
                    setLocalPath(path);
                    setPendingInteraction(null);
                    spawnClickMarker(target[0], target[2]);
                }
            },
            handleInteract: (item: SceneItem) => {
                handleItemClick(item, null);
            },
            handleExamine: (item: SceneItem) => {
                const desc = `This is a ${item.name.replace(/_/g, " ")}.`;
                setSpeeches((prev) => ({ ...prev, [socket.id]: { text: desc, time: Date.now() } }));
            },
            getAzimuth: () => azimuth.current,
            getLocalPos: () => localPosRef.current.clone(),
        }));

        useEffect(() => {
            const interval = setInterval(() => {
                setSpeeches((prev) => {
                    const now = Date.now();
                    const next = { ...prev };
                    let changed = false;
                    Object.keys(next).forEach((k) => {
                        if (now - next[k].time > 5000) {
                            delete next[k];
                            changed = true;
                        }
                    });
                    return changed ? next : prev;
                });
            }, 1000);
            return () => clearInterval(interval);
        }, []);

        const showTeleportDebug = import.meta.env.DEV;
        const teleportSpots = useMemo(
            () => teleports.filter((tp) => tp.from_scene === currentScene),
            [teleports, currentScene]
        );

        const onNextWaypoint = () => setLocalPath([]);

        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                switch (e.key.toLowerCase()) {
                    case "a":
                        keys.a = true;
                        break;
                    case "d":
                        keys.d = true;
                        break;
                    case "w":
                        keys.w = true;
                        break;
                    case "s":
                        keys.s = true;
                        break;
                }
            };
            const handleKeyUp = (e: KeyboardEvent) => {
                switch (e.key.toLowerCase()) {
                    case "a":
                        keys.a = false;
                        break;
                    case "d":
                        keys.d = false;
                        break;
                    case "w":
                        keys.w = false;
                        break;
                    case "s":
                        keys.s = false;
                        break;
                }
            };
            window.addEventListener("keydown", handleKeyDown);
            window.addEventListener("keyup", handleKeyUp);
            return () => {
                window.removeEventListener("keydown", handleKeyDown);
                window.removeEventListener("keyup", handleKeyUp);
            };
        }, [keys]);

        useFrame((state, delta) => {
            if (!localPlayer) return;
            const dt = Math.min(delta, 0.05);

            const rotSpeed = 1.6;

            if (keys.a) azimuth.current -= rotSpeed * dt;
            if (keys.d) azimuth.current += rotSpeed * dt;
            if (keys.w) elevation.current = Math.max(0.08, elevation.current - rotSpeed * 0.55 * dt);
            if (keys.s)
                elevation.current = Math.min(Math.PI / 2 - 0.12, elevation.current + rotSpeed * 0.55 * dt);

            azimuth.current = azimuth.current % (Math.PI * 2);

            distance.current += (targetDistance.current - distance.current) * (1 - Math.exp(-9 * dt));

            const targetPos = localPosRef.current;

            const offset = new THREE.Vector3(
                Math.sin(azimuth.current) * Math.cos(elevation.current) * distance.current,
                Math.sin(elevation.current) * distance.current + 1.85,
                Math.cos(azimuth.current) * Math.cos(elevation.current) * distance.current
            );

            const idealCamPos = targetPos.clone().add(offset);

            const followSmooth = 1 - Math.exp(-12 * dt);
            state.camera.position.lerp(idealCamPos, followSmooth);

            const lookTarget = new THREE.Vector3(targetPos.x, targetPos.y + 1.55, targetPos.z);
            state.camera.lookAt(lookTarget);

            const now = performance.now();
            setClickMarkers((prev) => {
                const next = prev.filter((m) => now - m.born < 700);
                return next.length === prev.length ? prev : next;
            });

            const target = neighborOpacityTarget.current;
            setNeighborOpacity((prev) => {
                if (Math.abs(prev - target) < 0.005) return prev;
                return THREE.MathUtils.lerp(prev, target, 1 - Math.exp(-4.2 * dt));
            });
        });

        useEffect(() => {
            const handleWheel = (e: WheelEvent) => {
                e.preventDefault();
                targetDistance.current = THREE.MathUtils.clamp(
                    targetDistance.current + e.deltaY * 0.014,
                    5.5,
                    32
                );
            };
            window.addEventListener("wheel", handleWheel, { passive: false });
            return () => window.removeEventListener("wheel", handleWheel);
        }, []);

        useEffect(() => {
            if (!camera || !gl.domElement) return;

            const tc = new TransformControls(camera, gl.domElement);
            tc.setMode("translate");
            tc.setSize(0.9);

            const onObjectChange = () => {
                if (tc.object && tc.mode === "scale") {
                    const s = tc.object.scale.x;
                    tc.object.scale.setScalar(s);
                }
            };
            tc.addEventListener("objectChange", onObjectChange);

            tc.addEventListener("dragging-changed", (event: any) => {
                if (orbitControls.current) {
                    orbitControls.current.enabled = !event.value;
                }

                if (!event.value && tc.object && tc.object.userData?.instance_id) {
                    const obj = tc.object;
                    const s = obj.scale.x;
                    obj.scale.setScalar(s);

                    socket.emit("admin_update_item", {
                        instance_id: obj.userData.instance_id,
                        pos_x: obj.position.x,
                        pos_y: obj.position.y,
                        pos_z: obj.position.z,
                        rotation_y: obj.rotation.y,
                        scale: s,
                    });
                }
            });

            scene.add(tc);
            transformControlsRef.current = tc;

            return () => {
                tc.removeEventListener("objectChange", onObjectChange);
                scene.remove(tc);
                tc.dispose();
                transformControlsRef.current = null as any;
            };
        }, [scene, gl, camera, socket, transformControlsRef]);

        useEffect(() => {
            const tc = transformControlsRef.current;
            if (!tc) return;

            if (selectedItemId != null) {
                const obj = itemsGroup.current?.getObjectByName(`item-${selectedItemId}`);
                if (obj) {
                    tc.attach(obj);
                } else {
                    tc.detach();
                }
            } else {
                tc.detach();
            }
        }, [selectedItemId, transformControlsRef, sceneItems]);

        useFrame(() => {
            if (!hasSky) {
                scene.background = new THREE.Color(0x000000);
                scene.fog = new THREE.FogExp2(0x000000, 0.001);
            }
        });

        return (
            <>
                <OrbitControls
                    ref={orbitControls}
                    enabled={false}
                    enablePan={false}
                    enableZoom={false}
                    enableRotate={false}
                />
                {hasSky && (
                    <>
                        <Sky
                            distance={5000}
                            sunPosition={[sunElevation > -10 ? 60 : -60, sunElevation * 1.2, 0]}
                            inclination={0.48}
                            azimuth={0.25}
                            mieCoefficient={0.001}
                            mieDirectionalG={0.95}
                            rayleigh={0.35}
                            turbidity={2.5}
                            ground={false}
                        />
                        <Cloud
                            position={[0, 220, 0]}
                            speed={0.3}
                            segments={80}
                            depth={0.6}
                            opacity={0.38}
                            scale={[140, 35, 140]}
                            bounds={[200, 50, 200]}
                            concentrate="inside"
                        />
                        {!isDay && (
                            <Stars
                                radius={250}
                                depth={90}
                                count={12000}
                                factor={5}
                                saturation={0.1}
                                fade
                                speed={0.08}
                            />
                        )}
                    </>
                )}
                <directionalLight
                    position={[sunElevation > -10 ? 60 : -60, Math.max(sunElevation * 1.2, -25), 40]}
                    intensity={hasSky ? (isDay ? 3.8 : 0.7) : 0}
                    color={isDay ? 0xffffe8 : 0xccddee}
                    castShadow={hasSky}
                    shadow-mapSize={[1024, 1024]}
                />
                <ambientLight intensity={hasSky ? (isDay ? 0.55 : 0.18) : 0.08} />
                {!hasSky && <color attach="background" args={["#000000"]} />}
                <directionalLight
                    position={[sunElevation > -10 ? 100 : -100, Math.max(sunElevation, -20), 50]}
                    intensity={hasSky ? (isDay ? 4 : 0.8) : 0}
                    color={isDay ? 0xffffff : 0x88aaff}
                    castShadow={hasSky}
                    shadow-mapSize={[2048, 2048]}
                />
                <ambientLight intensity={hasSky ? (isDay ? 0.6 : 0.2) : 0.1} />

                <mesh
                    rotation-x={-Math.PI / 2}
                    onClick={handlePlaneClick}
                    onContextMenu={(e) => {
                        e.nativeEvent.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                            visible: true,
                            x: e.nativeEvent.clientX,
                            y: e.nativeEvent.clientY,
                            target: { type: "ground", point: e.point },
                        });
                    }}
                    onPointerEnter={() => {
                        document.body.style.cursor = "pointer";
                    }}
                    onPointerLeave={() => {
                        document.body.style.cursor = "auto";
                    }}
                    receiveShadow
                    userData={{ isWalkableGround: true }}
                >
                    <planeGeometry args={sceneConfig.planeSize} />
                    <meshStandardMaterial
                        color={sceneConfig.floorColor}
                        polygonOffset={true}
                        polygonOffsetFactor={1}
                        polygonOffsetUnits={1}
                    />
                </mesh>

                {neighbors.map((n) => (
                    <NeighborScene
                        key={`neighbor-scene-${n.sceneId}`}
                        sceneId={n.sceneId}
                        offset={n.offset}
                        items={n.items}
                        floorColor={n.floorColor}
                        planeSize={n.planeSize}
                        opacity={neighborOpacity}
                    />
                ))}

                {clickMarkers.map((m) => {
                    const age = Math.min(1, (performance.now() - m.born) / 700);
                    const scale = 0.35 + age * 0.95;
                    const opacity = 1 - age;
                    return (
                        <group key={m.id} position={[m.x, 0.04, m.z]}>
                            <mesh rotation-x={-Math.PI / 2} scale={[scale, scale, 1]}>
                                <ringGeometry args={[0.22, 0.32, 32]} />
                                <meshBasicMaterial
                                    color="#f5d76e"
                                    transparent
                                    opacity={opacity * 0.85}
                                    side={THREE.DoubleSide}
                                    depthWrite={false}
                                />
                            </mesh>
                            <mesh rotation-x={-Math.PI / 2} scale={[scale * 0.55, scale * 0.55, 1]}>
                                <ringGeometry args={[0.08, 0.14, 24]} />
                                <meshBasicMaterial
                                    color="#ffe9a0"
                                    transparent
                                    opacity={opacity}
                                    side={THREE.DoubleSide}
                                    depthWrite={false}
                                />
                            </mesh>
                            <mesh rotation-x={-Math.PI / 2}>
                                <circleGeometry args={[0.06, 16]} />
                                <meshBasicMaterial
                                    color="#fff3c0"
                                    transparent
                                    opacity={opacity * 0.9}
                                    depthWrite={false}
                                />
                            </mesh>
                        </group>
                    );
                })}

                {showTeleportDebug &&
                    teleportSpots.map((tp, i) => (
                        <mesh
                            key={`teleport-debug-${i}`}
                            position={[tp.from_x, 0.01, tp.from_z]}
                            rotation-x={-Math.PI / 2}
                        >
                            <circleGeometry args={[tp.radius || 2, 32]} />
                            <meshBasicMaterial color="#ffaa00" transparent opacity={0.45} side={THREE.DoubleSide} />
                        </mesh>
                    ))}

                {characters.map((character) => {
                    const isMale2 = character.model.includes("male2");
                    const clips = isMale2 ? male2Clips : male1Clips;

                    return (
                        <Player
                            key={character.id}
                            character={character}
                            clips={clips}
                            localPath={character.id === socket.id ? localPath : undefined}
                            onNextWaypoint={character.id === socket.id ? onNextWaypoint : undefined}
                            localPosRef={character.id === socket.id ? localPosRef : undefined}
                            pendingInteraction={character.id === socket.id ? pendingInteraction : undefined}
                            setPendingInteraction={character.id === socket.id ? setPendingInteraction : undefined}
                            maxInteractDist={character.id === socket.id ? maxInteractDist : undefined}
                            speech={speeches[character.id]?.text}
                            onSpeech={
                                character.id === socket.id
                                    ? (text: string) => {
                                        setSpeeches((prev) => ({
                                            ...prev,
                                            [character.id]: { text, time: Date.now() },
                                        }));
                                    }
                                    : undefined
                            }
                            runEnabled={runEnabled}
                            onMovingChange={character.id === socket.id ? onMovingChange : undefined}
                        />
                    );
                })}

                <group ref={itemsGroup}>
                    {sceneItems.map((item: SceneItem) => {
                        const key = `item-${item.instance_id}`;
                        const position: [number, number, number] = [item.pos_x, item.pos_y || 0, item.pos_z];
                        const rotationY = item.rotation_y || 0;
                        const scale = item.scale || 1;
                        return (
                            <ItemInstance
                                key={key}
                                name={item.name}
                                position={position}
                                rotationY={rotationY}
                                scale={scale}
                                instance_id={item.instance_id}
                                isWalkable={!!item.is_walkable}
                                onPointerEnter={() => {
                                    document.body.style.cursor = "pointer";
                                }}
                                onPointerLeave={() => {
                                    document.body.style.cursor = "auto";
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (editMode) {
                                        setSelectedItemId(item.instance_id);
                                    } else if (item.is_interactable) {
                                        handleItemClick(item, e);
                                    } else {
                                        handlePlaneClick({ point: { x: e.point.x, z: e.point.z } });
                                    }
                                }}
                                onContextMenu={(e) => {
                                    e.nativeEvent.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({
                                        visible: true,
                                        x: e.nativeEvent.clientX,
                                        y: e.nativeEvent.clientY,
                                        target: { type: "item", item },
                                    });
                                }}
                            />
                        );
                    })}
                </group>
            </>
        );
    }
);
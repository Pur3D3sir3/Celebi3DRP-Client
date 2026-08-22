import { useState, useMemo, Suspense, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Center, Stage } from "@react-three/drei";
import * as THREE from "three";
import _ from "lodash";

interface AdminInventoryProps {
    open: boolean;
    onClose: () => void;
    onSave: () => void;
    selectedItemId: number | null;
    setSelectedItemId: (id: number | null) => void;
    placingItem: { item_id: number; name: string } | null;
    setPlacingItem: (item: { item_id: number; name: string } | null) => void;
    currentScene: number;
    socket: any;
    sceneItems: any[];
    transformControls: any;
}

type CatalogItem = {
    item_id: number;
    name: string;
    display: string;
    category: string;
};

const availableItems: CatalogItem[] = [
    { item_id: 1, name: "soda_can", display: "Soda Can", category: "Props" },
    { item_id: 2, name: "rock", display: "Rock", category: "Nature" },
    { item_id: 3, name: "cobblestone_path", display: "Cobblestone Path", category: "Paths" },
    { item_id: 4, name: "grass", display: "Grass", category: "Nature" },
    { item_id: 5, name: "stone_path", display: "Stone Path", category: "Paths" },
    { item_id: 6, name: "water_well", display: "Water Well", category: "Structures" },
    { item_id: 7, name: "mini_well", display: "Mini Water Well", category: "Structures" },
    { item_id: 8, name: "winter_cabin", display: "Winter Cabin", category: "Buildings" },
    { item_id: 9, name: "whimsical_tree", display: "Whimsical Tree", category: "Nature" },
    { item_id: 10, name: "enchanted_grove", display: "Enchanted Grove", category: "Nature" },
    { item_id: 11, name: "cobblestone_path2", display: "Cobblestone Path 2", category: "Paths" },
    { item_id: 12, name: "ancient_boulder", display: "Ancient Boulder", category: "Nature" },
    { item_id: 13, name: "cave_entrance", display: "Cave Entrance", category: "Structures" },
];

function ModelPreview({ name }: { name: string }) {
    const { scene } = useGLTF(`/items/${name}.glb`);
    const clone = useMemo(() => {
        const c = scene.clone(true);
        c.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        return c;
    }, [scene]);

    return (
        <Center>
            <primitive object={clone} />
        </Center>
    );
}

export default function AdminInventory({
                                           open,
                                           onClose,
                                           onSave,
                                           selectedItemId,
                                           setSelectedItemId,
                                           placingItem,
                                           setPlacingItem,
                                           currentScene,
                                           socket,
                                           sceneItems,
                                           transformControls,
                                       }: AdminInventoryProps) {
    const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);

    const [inspectorPos, setInspectorPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const inspectorRef = useRef<HTMLDivElement>(null);

    // Live values driven by the selected item + TransformControls
    const [liveY, setLiveY] = useState(0);
    const [liveRot, setLiveRot] = useState(0);
    const [liveScale, setLiveScale] = useState(1);

    const selectedItem = sceneItems.find((i) => i.instance_id === selectedItemId);

    // Sync live values whenever selection changes
    useEffect(() => {
        if (!selectedItem) return;
        setLiveY(selectedItem.pos_y || 0);
        setLiveRot((selectedItem.rotation_y || 0) * (180 / Math.PI));
        setLiveScale(selectedItem.scale || 1);
    }, [selectedItemId, selectedItem]);

    // Keep live values in sync while the gizmo is being used
    useEffect(() => {
        if (!selectedItemId || !transformControls.current) return;

        const tc = transformControls.current;
        const onChange = () => {
            const obj = tc.object;
            if (!obj) return;
            setLiveY(obj.position.y);
            setLiveRot(obj.rotation.y * (180 / Math.PI));
            setLiveScale(obj.scale.x);
        };

        tc.addEventListener("objectChange", onChange);
        return () => tc.removeEventListener("objectChange", onChange);
    }, [selectedItemId, transformControls]);

    const debouncedUpdate = useMemo(
        () =>
            _.debounce((data: any) => {
                socket.emit("admin_update_item", data);
            }, 220),
        [socket]
    );

    const handleModeChange = (mode: "translate" | "rotate" | "scale") => {
        if (transformControls.current) {
            transformControls.current.setMode(mode);
        }
    };

    const handleDelete = () => {
        if (selectedItemId) {
            socket.emit("admin_delete_item", { instance_id: selectedItemId }, () => {
                setSelectedItemId(null);
            });
        }
    };

    const handlePlace = (item: CatalogItem) => {
        setPlacingItem({ item_id: item.item_id, name: item.name });
        setPreviewItem(item);
    };

    // Drag the inspector panel
    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: MouseEvent) => {
            setInspectorPos({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y,
            });
        };
        const onUp = () => setIsDragging(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [isDragging]);

    const startDrag = (e: React.MouseEvent) => {
        if (!inspectorRef.current) return;
        const rect = inspectorRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        setIsDragging(true);
    };

    useEffect(() => {
        if (selectedItem && inspectorPos.x === 0 && inspectorPos.y === 0) {
            setInspectorPos({
                x: Math.max(20, window.innerWidth / 2 - 170),
                y: Math.max(20, window.innerHeight - 340),
            });
        }
    }, [selectedItem]);

    if (!open) return null;

    return (
        <>
            {/* Catalog panel */}
            <div className="fixed top-0 right-0 bottom-0 z-[9000] w-[340px] sm:w-[360px] flex flex-col bg-[#0e0e14]/95 border-l border-indigo-500/40 shadow-2xl shadow-black/60 backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-500/30 bg-indigo-950/50">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                            <i className="fas fa-box-open text-white text-xs"></i>
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white">Catalog</div>
                            <div className="text-[10px] text-indigo-300">Scene {currentScene}</div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <div className="h-44 border-b border-white/5 bg-[#0a0a10] relative">
                    {previewItem ? (
                        <Canvas camera={{ position: [0, 1.2, 2.8], fov: 45 }} dpr={[1, 1.5]}>
                            <ambientLight intensity={0.7} />
                            <directionalLight position={[3, 5, 2]} intensity={1.4} />
                            <Suspense fallback={null}>
                                <Stage intensity={0.6} environment={null} adjustCamera={false}>
                                    <ModelPreview name={previewItem.name} />
                                </Stage>
                            </Suspense>
                            <OrbitControls
                                enableZoom={false}
                                enablePan={false}
                                autoRotate
                                autoRotateSpeed={1.8}
                                minPolarAngle={Math.PI / 3}
                                maxPolarAngle={Math.PI / 1.7}
                            />
                        </Canvas>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                            <i className="fas fa-cube text-3xl mb-2 opacity-40"></i>
                            <span className="text-xs">Select an item</span>
                        </div>
                    )}
                </div>

                {previewItem && (
                    <div className="px-4 py-3 border-b border-white/5 bg-indigo-950/20">
                        <div className="text-sm font-semibold text-white truncate">{previewItem.display}</div>
                        <div className="text-[11px] text-gray-500 mb-3">{previewItem.category}</div>
                        <button
                            onClick={() => handlePlace(previewItem)}
                            className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
                                placingItem?.item_id === previewItem.item_id
                                    ? "bg-emerald-600 text-white"
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                            }`}
                        >
                            <i className={`fas ${placingItem?.item_id === previewItem.item_id ? "fa-check" : "fa-plus"}`}></i>
                            {placingItem?.item_id === previewItem.item_id ? "Click Ground to Place" : "Place"}
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-3">
                    <div className="grid grid-cols-2 gap-2.5">
                        {availableItems.map((item) => {
                            const active =
                                previewItem?.item_id === item.item_id ||
                                placingItem?.item_id === item.item_id;
                            return (
                                <button
                                    key={item.item_id}
                                    onClick={() => setPreviewItem(item)}
                                    className={`rounded-xl border p-2.5 text-left transition ${
                                        active
                                            ? "border-indigo-400 bg-indigo-900/50"
                                            : "border-white/10 bg-white/5 hover:border-indigo-500/40 hover:bg-indigo-950/30"
                                    }`}
                                >
                                    <div className="h-16 rounded-lg bg-[#12121a] flex items-center justify-center mb-2 overflow-hidden">
                                        <div className="text-2xl font-bold text-indigo-400/60">
                                            {item.display.charAt(0)}
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-medium text-white truncate leading-tight">
                                        {item.display}
                                    </div>
                                    <div className="text-[10px] text-gray-500">{item.category}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-3 border-t border-indigo-500/20 bg-indigo-950/30 flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-gray-300"
                    >
                        Close
                    </button>
                    <button
                        onClick={onSave}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white"
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* Draggable Inspector */}
            {selectedItem && (
                <div
                    ref={inspectorRef}
                    style={{
                        position: "fixed",
                        left: inspectorPos.x,
                        top: inspectorPos.y,
                        zIndex: 9100,
                        width: 340,
                    }}
                    className="bg-[#0e0e14]/95 border border-indigo-500/40 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden select-none"
                >
                    <div
                        onMouseDown={startDrag}
                        className="px-4 py-2.5 border-b border-indigo-500/20 flex items-center justify-between bg-indigo-950/40 cursor-grab active:cursor-grabbing"
                    >
                        <div className="flex items-center gap-2">
                            <i className="fas fa-grip-vertical text-indigo-400 text-xs"></i>
                            <div className="text-sm font-semibold text-white truncate max-w-[200px]">
                                {selectedItem.name.replace(/_/g, " ")}
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedItemId(null)}
                            className="text-xs text-gray-500 hover:text-white"
                        >
                            Deselect
                        </button>
                    </div>

                    <div className="p-3">
                        <div className="flex gap-1.5 mb-3">
                            <button
                                onClick={() => handleModeChange("translate")}
                                className="flex-1 py-2 rounded-lg bg-indigo-700/80 hover:bg-indigo-600 text-xs font-medium"
                            >
                                Move
                            </button>
                            <button
                                onClick={() => handleModeChange("rotate")}
                                className="flex-1 py-2 rounded-lg bg-indigo-700/80 hover:bg-indigo-600 text-xs font-medium"
                            >
                                Rotate
                            </button>
                            <button
                                onClick={() => handleModeChange("scale")}
                                className="flex-1 py-2 rounded-lg bg-indigo-700/80 hover:bg-indigo-600 text-xs font-medium"
                            >
                                Scale
                            </button>
                        </div>

                        <div className="space-y-2.5 mb-3">
                            <div>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                    <span>Height</span>
                                    <span className="text-indigo-300">{liveY.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-5"
                                    max="10"
                                    step="0.05"
                                    value={liveY}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setLiveY(val);
                                        if (transformControls.current?.object) {
                                            transformControls.current.object.position.y = val;
                                        }
                                        debouncedUpdate({ instance_id: selectedItemId, pos_y: val });
                                    }}
                                    className="w-full accent-indigo-500 h-1.5"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                    <span>Rotation</span>
                                    <span className="text-indigo-300">{Math.round(liveRot)}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    step="1"
                                    value={liveRot}
                                    onChange={(e) => {
                                        const deg = parseFloat(e.target.value);
                                        const rad = deg * (Math.PI / 180);
                                        setLiveRot(deg);
                                        if (transformControls.current?.object) {
                                            transformControls.current.object.rotation.y = rad;
                                        }
                                        debouncedUpdate({ instance_id: selectedItemId, rotation_y: rad });
                                    }}
                                    className="w-full accent-indigo-500 h-1.5"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                    <span>Scale</span>
                                    <span className="text-indigo-300">{liveScale.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.15"
                                    max="5"
                                    step="0.05"
                                    value={liveScale}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setLiveScale(val);
                                        if (transformControls.current?.object) {
                                            transformControls.current.object.scale.set(val, val, val);
                                        }
                                        debouncedUpdate({ instance_id: selectedItemId, scale: val });
                                    }}
                                    className="w-full accent-indigo-500 h-1.5"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleDelete}
                            className="w-full py-2 rounded-xl bg-red-700/90 hover:bg-red-600 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                            <i className="fas fa-trash-alt text-[10px]"></i>
                            Delete
                        </button>
                    </div>
                </div>
            )}

            {placingItem && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9200] px-5 py-2.5 rounded-full bg-emerald-600/90 text-white text-sm font-medium shadow-lg shadow-emerald-900/40 flex items-center gap-2">
                    <i className="fas fa-crosshairs"></i>
                    Click ground to place <strong>{placingItem.name.replace(/_/g, " ")}</strong>
                </div>
            )}
        </>
    );
}